import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { InMemoryTransport } from '@modelcontextprotocol/sdk/inMemory.js';
import { afterEach, describe, expect, it } from 'vitest';
import { fixtures } from '../props/bad/index.ts';
import type { OpDef } from '../../skeleton/src/core/types.ts';
import type { Counterexample, RunOptions } from '../props/engine.ts';
import { runJobInProcess, type JobOverrides, type JobSpec } from './job.ts';
import { createServer, type RunJob } from './tools.ts';

const root = join(dirname(fileURLToPath(import.meta.url)), '..', '..');

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
