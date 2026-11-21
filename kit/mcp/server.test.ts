import { spawnSync } from 'node:child_process';
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { InMemoryTransport } from '@modelcontextprotocol/sdk/inMemory.js';
import { afterAll, afterEach, describe, expect, it } from 'vitest';
import { fixtures } from '../props/bad/index.ts';
import type { OpDef } from '../../skeleton/src/core/types.ts';
import type { Counterexample, RunOptions } from '../props/engine.ts';
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
    expect(r.structuredContent!.counterexample.property).toBe('intent:set');
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

  it('returns the hook pass for a non-op file', async () => {
    const d = tempRoot();
    writeFileSync(join(d, 'readme.md'), 'hi');
    const r = await call(await lintClient(d), 'check_lint', { file: 'readme.md' });
    expect(r.structuredContent).toMatchObject({ pass: true, detail: 'not an op file' });
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
