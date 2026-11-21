import { spawnSync } from 'node:child_process';
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, symlinkSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { InMemoryTransport } from '@modelcontextprotocol/sdk/inMemory.js';
import { StdioClientTransport } from '@modelcontextprotocol/sdk/client/stdio.js';
import { afterAll, afterEach, describe, expect, it } from 'vitest';
import { fixtures } from '../props/bad/index.ts';
import type { OpDef } from '../../skeleton/src/core/types.ts';
import { failingProperties, runOnce, type Counterexample, type RunOptions } from '../props/engine.ts';
import { config as defaultConfig } from '../props/config.ts';
import { runJobInProcess, type JobOverrides, type JobSpec } from './job.ts';
import { createServer, type RunJob } from './tools.ts';

const root = join(dirname(fileURLToPath(import.meta.url)), '..', '..');

// R9.5: tests never write the real ledger. Children spawned by tests inherit this too.
const testLedgerDir = mkdtempSync(join(tmpdir(), 'limbo-mcp-ledger-'));
process.env.LIMBO_MCP_LOG = join(testLedgerDir, 'mcp-calls.jsonl');
const realMcpLedger = join(root, 'evidence', 'kiro', 'mcp-calls.jsonl');
const realMcpBefore = existsSync(realMcpLedger) ? readFileSync(realMcpLedger, 'utf8') : null;
afterAll(() => {
  const after = existsSync(realMcpLedger) ? readFileSync(realMcpLedger, 'utf8') : null;
  rmSync(testLedgerDir, { recursive: true, force: true });
  expect(after).toBe(realMcpBefore);
});

function fixtureDefs(): JobOverrides {
  const defs: Record<string, { def: OpDef; opts: RunOptions }> = {};
  for (const f of fixtures) {
    if (!f.def) continue;
    defs[f.def.name] = { def: f.def, opts: { ...f.opts, manifest: { [f.def.name]: f.def.intent } } };
  }
  return { defs };
}

const inProcess: RunJob = (spec) => runJobInProcess(spec, fixtureDefs());

const clients: Client[] = [];
afterEach(async () => {
  await Promise.all(clients.splice(0).map((c) => c.close()));
});

async function connect(runJob?: RunJob, killMs?: number): Promise<Client> {
  const server = createServer({ root, ...(runJob ? { runJob } : {}), ...(killMs ? { killMs } : {}) });
  const [a, b] = InMemoryTransport.createLinkedPair();
  const client = new Client({ name: 'test', version: '0.0.0' });
  await Promise.all([server.connect(a), client.connect(b)]);
  clients.push(client);
  return client;
}

interface Out {
  isError?: boolean;
  structuredContent?: Record<string, any>;
}
const call = async (c: Client, name: string, args: Record<string, unknown>): Promise<Out> =>
  (await c.callTool({ name, arguments: args })) as Out;

const nameOf = (tool: string): string => {
  const f = fixtures.find((x) => x.name === tool);
  if (!f?.def) throw new Error(`fixture ${tool} has no def`);
  return f.def.name;
};

describe('server: tools', () => {
  it('lists the four tools with input schemas', async () => {
    const c = await connect();
    const { tools } = await c.listTools();
    expect(tools.map((t) => t.name).sort()).toEqual(['check_lint', 'explain_trace', 'fuzz_op', 'list_ops']);
    for (const t of tools) expect(t.inputSchema.type).toBe('object');
  });

  it('list_ops runs in a real child for both apps', async () => {
    const c = await connect();
    for (const app of ['basecamp', 'aftershock']) {
      const r = await call(c, 'list_ops', { app });
      expect(r.isError).toBeFalsy();
      const ops = r.structuredContent!.ops as { name: string }[];
      expect(ops.length).toBeGreaterThan(0);
    }
  }, 60_000);

  it('unknown app names both valid apps', async () => {
    const c = await connect();
    const r = await call(c, 'list_ops', { app: 'nope' });
    expect(r.isError).toBe(true);
    expect(r.structuredContent!.error.code).toBe('unknown-app');
    expect(r.structuredContent!.error.message).toContain('basecamp');
    expect(r.structuredContent!.error.message).toContain('aftershock');
  });

  it('unknown op lists valid names', async () => {
    const c = await connect(inProcess);
    const r = await call(c, 'fuzz_op', { app: 'basecamp', op: 'item.nope', orderings: 5 });
    expect(r.isError).toBe(true);
    expect(r.structuredContent!.error.code).toBe('unknown-op');
    expect(r.structuredContent!.error.message).toContain('item.tick');
  });
});

describe('server: fuzz_op and explain_trace', () => {
  const args = (op: string) => ({ app: 'basecamp', op, orderings: 200, replicas: 3, seed: 20251031 });

  it('tick-toggle fixture fails with intent:set and a counterexample', async () => {
    const c = await connect(inProcess);
    const r = await call(c, 'fuzz_op', args(nameOf('tick-toggle')));
    expect(r.isError).toBeFalsy();
    expect(r.structuredContent!.pass).toBe(false);
    // A toggle also fails raw idempotence, and shrinking may land on either.
    expect(['intent:set', 'raw idempotence']).toContain(r.structuredContent!.counterexample.property);
  });

  it('lww-wallclock fixture returns a counterexample', async () => {
    const c = await connect(inProcess);
    const r = await call(c, 'fuzz_op', args(nameOf('lww-wallclock')));
    expect(r.structuredContent!.pass).toBe(false);
    expect(r.structuredContent!.counterexample.script.length).toBeGreaterThan(0);
  });

  it('the same call twice gives equal results', async () => {
    const c = await connect(inProcess);
    // tick-toggle has a deterministic reducer; lww-wallclock reads Date.now by design, so its states vary by the ms.
    const a = await call(c, 'fuzz_op', args(nameOf('tick-toggle')));
    const b = await call(c, 'fuzz_op', args(nameOf('tick-toggle')));
    expect(a.structuredContent).toEqual(b.structuredContent);
  });

  it('explain_trace names the first differing step', async () => {
    const c = await connect(inProcess);
    const op = nameOf('lww-wallclock');
    const f = await call(c, 'fuzz_op', args(op));
    const ce = f.structuredContent!.counterexample as Counterexample;
    const r = await call(c, 'explain_trace', { app: 'basecamp', op, counterexample: ce });
    expect(r.isError).toBeFalsy();
    expect(r.structuredContent!.agree).toBe(false);
    expect(r.structuredContent!.firstDifference.replicas).toHaveLength(2);
    expect(r.structuredContent!.text).toContain('first difference at step');
  });

  it('a stale counterexample is a structured error', async () => {
    const c = await connect(inProcess);
    const op = nameOf('tick-toggle');
    const f = await call(c, 'fuzz_op', args(op));
    const ce = f.structuredContent!.counterexample as Counterexample;
    const edited = { ...ce, script: ce.script.map((s, i) => (i === 0 ? { ...s, payload: { ticked: 'edited' } } : s)) };
    const r = await call(c, 'explain_trace', { app: 'basecamp', op, counterexample: edited });
    expect(r.isError).toBe(true);
    expect(r.structuredContent!.error.code).toBe('stale-counterexample');
  });
});

describe('server: limits and errors', () => {
  it('clamps orderings to 5000 and reports requested', async () => {
    const seen: JobSpec[] = [];
    const c = await connect(async (spec) => {
      seen.push(spec);
      return { ok: true, result: { pass: true, runs: 0 } };
    });
    const r = await call(c, 'fuzz_op', { app: 'basecamp', op: 'item.tick', orderings: 99999 });
    expect(seen[0]).toMatchObject({ job: 'fuzz_op', orderings: 5000, deadlineMs: 50_000 });
    expect(r.structuredContent).toMatchObject({ clamped: true, requested: 99999 });
  });

  it('defaults orderings to 500 and does not report clamping', async () => {
    const seen: JobSpec[] = [];
    const c = await connect(async (spec) => {
      seen.push(spec);
      return { ok: true, result: { pass: true, runs: 0 } };
    });
    const r = await call(c, 'fuzz_op', { app: 'basecamp', op: 'item.tick' });
    expect(seen[0]).toMatchObject({ orderings: 500 });
    expect(r.structuredContent).not.toHaveProperty('clamped');
  });

  it.each([1, 6, 2.5])('replicas %s is bad-argument', async (replicas) => {
    const c = await connect(async () => ({ ok: true, result: {} }));
    const r = await call(c, 'fuzz_op', { app: 'basecamp', op: 'item.tick', replicas });
    expect(r.isError).toBe(true);
    expect(r.structuredContent!.error.code).toBe('bad-argument');
  });

  it('a job that never resolves returns timeout', async () => {
    let aborted = false;
    const c = await connect(
      (_spec, signal) =>
        new Promise(() => {
          signal.addEventListener('abort', () => (aborted = true));
        }),
      200,
    );
    const r = await call(c, 'fuzz_op', { app: 'basecamp', op: 'item.tick', orderings: 5 });
    expect(r.isError).toBe(true);
    expect(r.structuredContent!.error.code).toBe('timeout');
    expect(aborted).toBe(true);
  });

  it('a job that throws returns job-crashed and the server answers the next call', async () => {
    let n = 0;
    const c = await connect(async () => {
      if (n++ === 0) throw new Error('kaboom');
      return { ok: true, result: { app: 'basecamp', ops: [] } };
    });
    const bad = await call(c, 'list_ops', { app: 'basecamp' });
    expect(bad.isError).toBe(true);
    expect(bad.structuredContent!.error).toMatchObject({ code: 'job-crashed', message: 'kaboom' });
    const good = await call(c, 'list_ops', { app: 'basecamp' });
    expect(good.isError).toBeFalsy();
  });
});

describe('server: check_lint', () => {
  const tmpRoots: string[] = [];
  afterEach(() => {
    for (const d of tmpRoots.splice(0)) rmSync(d, { recursive: true, force: true });
  });

  function tempRoot(): string {
    const d = mkdtempSync(join(tmpdir(), 'limbo-lint-test-'));
    tmpRoots.push(d);
    mkdirSync(join(d, 'ops'), { recursive: true });
    mkdirSync(join(d, 'kit', 'props'), { recursive: true });
    writeFileSync(join(d, 'kit', 'props', 'intents.json'), JSON.stringify({ 'x.good': 'set', 'x.bad': 'set' }));
    return d;
  }
  const opSrc = (name: string, body: string) =>
    `export const def = {\n  name: '${name}',\n  merge: 'causal-lww',\n  intent: { kind: 'set', field: 'v' },\n  apply: (s, op) => ({ ...s, v: ${body} }),\n};\n`;

  async function lintClient(d: string): Promise<Client> {
    const server = createServer({ root: d, runJob: async () => ({ ok: true, result: {} }) });
    const [a, b] = InMemoryTransport.createLinkedPair();
    const client = new Client({ name: 'test', version: '0.0.0' });
    await Promise.all([server.connect(a), client.connect(b)]);
    clients.push(client);
    return client;
  }

  function hookDirect(d: string, file: string) {
    const log = join(d, 'direct.jsonl');
    const p = spawnSync(process.execPath, [join(root, 'kit', 'hooks', 'op-lint.mjs')], {
      input: JSON.stringify({ file_path: file, cwd: d }),
      env: { ...process.env, LIMBO_ROOT: d, LIMBO_HOOKS_LOG: log },
      encoding: 'utf8',
    });
    const row = JSON.parse(readFileSync(log, 'utf8').trim().split('\n').pop()!) as { result: string; detail: string | null };
    return { exit: p.status, result: row.result, detail: row.detail };
  }

  const realLedger = join(root, 'evidence', 'kiro', 'hooks.jsonl');
  const ledgerLines = (): number => (existsSync(realLedger) ? readFileSync(realLedger, 'utf8').split('\n').filter(Boolean).length : 0);

  it('flags Date.now and equals what the hook itself reports', async () => {
    const d = tempRoot();
    const file = join(d, 'ops', 'x.op.ts');
    writeFileSync(file, opSrc('x.bad', 'Date.now()'));
    const before = ledgerLines();
    const r = await call(await lintClient(d), 'check_lint', { file: 'ops/x.op.ts' });
    expect(r.isError).toBeFalsy();
    expect(r.structuredContent!.pass).toBe(false);
    expect(r.structuredContent!.violations.map((v: { rule: string }) => v.rule)).toContain('no-nondeterminism');
    const direct = hookDirect(d, file);
    expect(r.structuredContent).toMatchObject({ result: direct.result, detail: direct.detail, exit: direct.exit });
    expect(ledgerLines()).toBe(before);
  }, 30_000);

  it('passes a good op file', async () => {
    const d = tempRoot();
    writeFileSync(join(d, 'ops', 'x.op.ts'), opSrc('x.good', 'op.payload'));
    const r = await call(await lintClient(d), 'check_lint', { file: join(d, 'ops', 'x.op.ts') });
    expect(r.structuredContent).toMatchObject({ pass: true, result: 'pass', exit: 0, violations: [] });
  }, 30_000);

  it('a non-op file is an error result with pass false, not the hook pass', async () => {
    const d = tempRoot();
    writeFileSync(join(d, 'readme.md'), 'hi');
    writeFileSync(join(d, 'ops', 'x.ts'), 'export {};');
    writeFileSync(join(d, 'ops', 'x.op.tsx'), 'export {};');
    mkdirSync(join(d, 'other'), { recursive: true });
    writeFileSync(join(d, 'other', 'x.op.ts'), 'export {};');
    const c = await lintClient(d);
    for (const f of ['readme.md', 'ops/x.ts', 'ops/x.op.tsx', 'other/x.op.ts']) {
      const r = await call(c, 'check_lint', { file: f });
      expect(r.isError, f).toBe(true);
      expect(r.structuredContent, f).toMatchObject({ pass: false, error: { code: 'not-an-op-file' } });
    }
  }, 30_000);

  it('a missing file and an outside path carry pass false', async () => {
    const d = tempRoot();
    const c = await lintClient(d);
    expect((await call(c, 'check_lint', { file: 'ops/none.op.ts' })).structuredContent).toMatchObject({ pass: false });
    expect((await call(c, 'check_lint', { file: '../../etc/passwd' })).structuredContent).toMatchObject({ pass: false });
  });

  it('a symlink to an op file is linted by its real path; a symlink to a non-op file is rejected', async () => {
    const d = tempRoot();
    writeFileSync(join(d, 'ops', 'x.op.ts'), opSrc('x.good', 'op.payload'));
    writeFileSync(join(d, 'notes.md'), 'hi');
    symlinkSync(join(d, 'ops', 'x.op.ts'), join(d, 'link.ts'));
    symlinkSync(join(d, 'notes.md'), join(d, 'ops', 'y.op.ts'));
    const c = await lintClient(d);
    const bad = await call(c, 'check_lint', { file: 'ops/y.op.ts' });
    expect(bad.structuredContent).toMatchObject({ pass: false, error: { code: 'not-an-op-file' } });
    const viaLink = await call(c, 'check_lint', { file: 'link.ts' });
    expect(viaLink.structuredContent).toMatchObject({ pass: true, result: 'pass' });
    expect(String(viaLink.structuredContent!.target)).toMatch(/ops\/x\.op\.ts$/);
  }, 30_000);

  it('rejects paths outside the root and missing files without running the hook', async () => {
    const d = tempRoot();
    const before = ledgerLines();
    const c = await lintClient(d);
    const out = await call(c, 'check_lint', { file: '../../etc/passwd' });
    expect(out.isError).toBe(true);
    expect(out.structuredContent!.error.code).toBe('file-outside-root');
    const missing = await call(c, 'check_lint', { file: 'ops/none.op.ts' });
    expect(missing.isError).toBe(true);
    expect(missing.structuredContent!.error.code).toBe('file-not-found');
    expect(ledgerLines()).toBe(before);
  });
});

describe('server: evidence ledger', () => {
  const dirs: string[] = [];
  afterEach(() => {
    for (const d of dirs.splice(0)) rmSync(d, { recursive: true, force: true });
  });

  async function withLedger(logPath: string, runJob?: RunJob): Promise<Client> {
    const server = createServer({ root, logPath, ...(runJob ? { runJob } : {}) });
    const [a, b] = InMemoryTransport.createLinkedPair();
    const client = new Client({ name: 'test', version: '0.0.0' });
    await Promise.all([server.connect(a), client.connect(b)]);
    clients.push(client);
    return client;
  }
  const tempDir = (): string => {
    const d = mkdtempSync(join(tmpdir(), 'limbo-ledger-test-'));
    dirs.push(d);
    return d;
  };

  it('appends one well-typed line per call, including a failing one', async () => {
    const log = join(tempDir(), 'sub', 'mcp-calls.jsonl');
    const c = await withLedger(log, inProcess);
    const tick = nameOf('tick-toggle');
    const fuzz = await call(c, 'fuzz_op', { app: 'basecamp', op: tick, orderings: 20 });
    const ce = fuzz.structuredContent!.counterexample;
    await call(c, 'list_ops', { app: 'basecamp' });
    await call(c, 'explain_trace', { app: 'basecamp', op: tick, counterexample: ce });
    await call(c, 'check_lint', { file: 'kit/mcp/tools.ts' });
    await call(c, 'list_ops', { app: 'nope' });

    const rows = readFileSync(log, 'utf8').split('\n').filter(Boolean).map((l) => JSON.parse(l) as Record<string, unknown>);
    expect(rows).toHaveLength(5);
    for (const r of rows) {
      expect(Object.keys(r).sort()).toEqual(['app', 'ms', 'op', 'pass', 'runs', 'tool', 'ts']);
      expect(typeof r.ts).toBe('string');
      expect(Number.isNaN(Date.parse(r.ts as string))).toBe(false);
      expect(typeof r.tool).toBe('string');
      expect(typeof r.ms).toBe('number');
      expect(r.app === null || typeof r.app === 'string').toBe(true);
      expect(r.op === null || typeof r.op === 'string').toBe(true);
      expect(r.pass === null || typeof r.pass === 'boolean').toBe(true);
      expect(r.runs === null || typeof r.runs === 'number').toBe(true);
    }
    expect(rows.map((r) => r.tool)).toEqual(['fuzz_op', 'list_ops', 'explain_trace', 'check_lint', 'list_ops']);
    expect(rows[0]).toMatchObject({ app: 'basecamp', op: tick, pass: false });
    expect(typeof rows[0]!.runs).toBe('number');
    expect(rows[1]).toMatchObject({ app: 'basecamp', op: null, pass: null, runs: null });
    expect(rows[2]).toMatchObject({ pass: null, runs: null });
    expect(rows[3]).toMatchObject({ app: null, op: null, runs: null });
    expect(rows[4]).toMatchObject({ app: 'nope', pass: null, runs: null });
  }, 60_000);

  it('records pass and runs for a passing fuzz_op', async () => {
    const log = join(tempDir(), 'mcp-calls.jsonl');
    const c = await withLedger(log, async () => ({ ok: true, result: { pass: true, runs: 7 } }));
    await call(c, 'fuzz_op', { app: 'basecamp', op: 'item.tick', orderings: 7 });
    const row = JSON.parse(readFileSync(log, 'utf8').trim()) as Record<string, unknown>;
    expect(row).toMatchObject({ tool: 'fuzz_op', app: 'basecamp', op: 'item.tick', pass: true, runs: 7 });
  });

  it('an unwritable ledger path does not change the tool result', async () => {
    const d = tempDir();
    const blocker = join(d, 'file');
    writeFileSync(blocker, 'x');
    const good = await withLedger(join(d, 'ok.jsonl'), inProcess);
    const bad = await withLedger(join(blocker, 'nested', 'mcp-calls.jsonl'), inProcess);
    const args = { app: 'basecamp', op: nameOf('tick-toggle'), orderings: 20 };
    const a = await call(good, 'fuzz_op', args);
    const b = await call(bad, 'fuzz_op', args);
    expect(b).toEqual(a);
    expect(b.isError).toBeFalsy();
  }, 60_000);
});

describe('server: stdio spawn and cwd', () => {
  const dirs: string[] = [];
  afterEach(() => {
    for (const d of dirs.splice(0)) rmSync(d, { recursive: true, force: true });
  });

  async function spawnClient(cwd: string): Promise<{ client: Client; errors: Error[]; log: string }> {
    const d = mkdtempSync(join(tmpdir(), 'limbo-stdio-test-'));
    dirs.push(d);
    const log = join(d, 'mcp-calls.jsonl');
    const env: Record<string, string> = {};
    for (const [k, v] of Object.entries(process.env)) if (v !== undefined) env[k] = v;
    env.LIMBO_MCP_LOG = log;
    const transport = new StdioClientTransport({
      command: process.execPath,
      args: [join(root, 'kit', 'mcp', 'server.mjs')],
      cwd,
      env,
      stderr: 'ignore',
    });
    const errors: Error[] = [];
    const client = new Client({ name: 'test', version: '0.0.0' });
    client.onerror = (e) => errors.push(e);
    await client.connect(transport);
    clients.push(client);
    return { client, errors, log };
  }

  const opNames = (r: Out): string[] => (r.structuredContent!.ops as { name: string }[]).map((o) => o.name);

  it('fuzz_op on item.tick from the repo root passes with the requested runs', async () => {
    const { client, errors, log } = await spawnClient(root);
    const r = await call(client, 'fuzz_op', { app: 'basecamp', op: 'item.tick', orderings: 100 });
    expect(r.isError).toBeFalsy();
    expect(r.structuredContent).toMatchObject({ pass: true, runs: 100 });
    expect(errors).toEqual([]);
    const row = JSON.parse(readFileSync(log, 'utf8').trim().split('\n').pop()!) as Record<string, unknown>;
    expect(row).toMatchObject({ tool: 'fuzz_op', op: 'item.tick', pass: true, runs: 100 });
  }, 60_000);

  it('from another working directory it lists the same tools and the same ops', async () => {
    const here = await spawnClient(root);
    const there = await spawnClient(tmpdir());
    const names = async (c: Client) => (await c.listTools()).tools.map((t) => t.name).sort();
    const expected = ['check_lint', 'explain_trace', 'fuzz_op', 'list_ops'];
    expect(await names(there.client)).toEqual(expected);
    expect(await names(here.client)).toEqual(expected);
    for (const app of ['basecamp', 'aftershock']) {
      const a = await call(here.client, 'list_ops', { app });
      const b = await call(there.client, 'list_ops', { app });
      expect(b.isError).toBeFalsy();
      expect(opNames(b).length).toBeGreaterThan(0);
      expect(opNames(b)).toEqual(opNames(a));
    }
    expect(here.errors).toEqual([]);
    expect(there.errors).toEqual([]);
  }, 60_000);
});

describe('server: mutation check through fuzz_op', () => {
  const withDef = fixtures.filter((f) => f.def);
  const goldenOnly = withDef.filter((f) => f.expectFails.every((p) => p.startsWith('golden:')));
  const checked = withDef.filter((f) => !goldenOnly.includes(f));

  it('lists the fixtures skipped because only a golden history fails them', () => {
    console.info(`mutation check skipped (golden only): ${goldenOnly.map((f) => f.name).join(', ') || 'none'}`);
    expect(checked.length + goldenOnly.length).toBe(withDef.length);
    expect(checked.length).toBeGreaterThan(0);
  });

  for (const f of checked) {
    it(`fuzz_op fails fixture ${f.name} on an expected property`, async () => {
      const def = f.def!;
      // Fixtures share def names (f.claim, f.life), so each gets its own single-entry override.
      const job: RunJob = (spec) =>
        runJobInProcess(spec, {
          defs: { [def.name]: { def, opts: { ...f.opts, manifest: { [def.name]: def.intent } } } },
        });
      const c = await connect(job);
      const r = await call(c, 'fuzz_op', { app: 'basecamp', op: def.name, orderings: 200, replicas: 3, seed: 20251031 });
      expect(r.isError).toBeFalsy();
      expect(r.structuredContent!.pass).toBe(false);
      // fuzz_op reports the first failing property of the counterexample. Replay it to list every failing
      // property, then require the fixture's expected property among them.
      const ce = r.structuredContent!.counterexample as Counterexample;
      const opts: RunOptions = { ...f.opts, manifest: { [def.name]: def.intent }, config: { ...defaultConfig, replicas: ce.replicas, seed: 20251031 } };
      const failing = runOnce(def, ce.seed, ce.steps, opts).failures.map((x) => x.property);
      expect(failing).toContain(ce.property);
      // The shrunk counterexample can fail a different property than the one the fixture is named for
      // (arrival-order shrinks to a run where only replay equivalence fails). The expected property must
      // still fail over the same fuzz range, as the kit's mutation check measures it.
      const overRange = failingProperties(def, { ...opts, config: { ...defaultConfig, replicas: 3, seed: 20251031 } }, 200);
      expect(overRange.filter((n) => f.expectFails.includes(n)).length).toBeGreaterThan(0);
    }, 60_000);
  }
});
