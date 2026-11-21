import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { InMemoryTransport } from '@modelcontextprotocol/sdk/inMemory.js';
import { afterEach, describe, expect, it } from 'vitest';
import type { JobSpec } from './job.ts';
import { createServer, MAX_OUTPUT_BYTES, MAX_TRACE_STEPS, spawnJob } from './tools.ts';

const dirs: string[] = [];
const clients: Client[] = [];
afterEach(async () => {
  await Promise.all(clients.splice(0).map((c) => c.close()));
  for (const d of dirs.splice(0)) rmSync(d, { recursive: true, force: true });
});
function tempDir(): string {
  const d = mkdtempSync(join(tmpdir(), 'limbo-limits-'));
  dirs.push(d);
  return d;
}

interface Out {
  isError?: boolean;
  structuredContent?: Record<string, any>;
}

describe('explain_trace bounds (item 8)', () => {
  const ce = (over: Record<string, unknown> = {}) => ({
    property: 'p',
    reason: 'r',
    seed: 20251031,
    steps: 8,
    replicas: 3,
    script: [],
    deliveries: {},
    ...over,
  });
  async function client(seen: JobSpec[]): Promise<Client> {
    const logPath = join(tempDir(), 'mcp-calls.jsonl');
    const server = createServer({
      root: tempDir(),
      logPath,
      runJob: async (spec) => {
        seen.push(spec);
        return { ok: true, result: { agree: true } };
      },
    });
    const [a, b] = InMemoryTransport.createLinkedPair();
    const c = new Client({ name: 'test', version: '0.0.0' });
    await Promise.all([server.connect(a), c.connect(b)]);
    clients.push(c);
    return c;
  }
  const run = async (c: Client, counterexample: unknown): Promise<Out> =>
    (await c.callTool({ name: 'explain_trace', arguments: { app: 'basecamp', op: 'item.tick', counterexample } })) as Out;

  it('accepts in-range inputs and spawns a job', async () => {
    const seen: JobSpec[] = [];
    const c = await client(seen);
    for (const over of [{}, { steps: 0 }, { steps: MAX_TRACE_STEPS }, { replicas: 2 }, { replicas: 5 }, { seed: 0 }, { seed: -3 }]) {
      const r = await run(c, ce(over));
      expect(r.isError, JSON.stringify(over)).toBeFalsy();
    }
    expect(seen).toHaveLength(7);
  });

  it.each([
    ['steps below range', { steps: -1 }],
    ['steps above range', { steps: MAX_TRACE_STEPS + 1 }],
    ['huge steps', { steps: 1e9 }],
    ['fractional steps', { steps: 2.5 }],
    ['replicas 1', { replicas: 1 }],
    ['replicas 6', { replicas: 6 }],
    ['fractional replicas', { replicas: 3.5 }],
    ['fractional seed', { seed: 1.5 }],
    ['unsafe seed', { seed: 2 ** 60 }],
  ])('rejects %s before any job is spawned', async (_n, over) => {
    const seen: JobSpec[] = [];
    const c = await client(seen);
    const r = await run(c, ce(over));
    expect(r.isError).toBe(true);
    expect(r.structuredContent!.error.code).toBe('bad-argument');
    expect(seen).toHaveLength(0);
  });
});

describe('spawnJob kills and caps (item 9)', () => {
  /** A temp root whose job-main.mjs is `body`. The child writes its pid to `<root>/pid.txt` first. */
  function fakeRoot(body: string): string {
    const d = tempDir();
    mkdirSync(join(d, 'kit', 'mcp'), { recursive: true });
    writeFileSync(
      join(d, 'kit', 'mcp', 'job-main.mjs'),
      `import { writeFileSync } from 'node:fs';\nwriteFileSync('pid.txt', String(process.pid));\n${body}\n`,
    );
    return d;
  }
  const spec = { job: 'list_ops', root: '/x', app: 'basecamp' } as JobSpec;
  const alive = (pid: number): boolean => {
    try {
      process.kill(pid, 0);
      return true;
    } catch {
      return false;
    }
  };
  const pidOf = (d: string): number => Number(readFileSync(join(d, 'pid.txt'), 'utf8'));
  const waitDead = async (pid: number, ms: number): Promise<boolean> => {
    const end = Date.now() + ms;
    while (Date.now() < end) {
      if (!alive(pid)) return true;
      await new Promise((r) => setTimeout(r, 25));
    }
    return !alive(pid);
  };
  const waitFile = async (f: string): Promise<void> => {
    for (let i = 0; i < 400 && !existsSync(f); i++) await new Promise((r) => setTimeout(r, 25));
  };

  it('returns the reply of a normal job', async () => {
    const d = fakeRoot(`process.stdin.resume(); process.stdin.on('end', () => console.log(JSON.stringify({ ok: true, result: { hi: 1 } })));`);
    const r = await spawnJob(d)(spec, new AbortController().signal);
    expect(r).toEqual({ ok: true, result: { hi: 1 } });
  }, 20_000);

  it('escalates to SIGKILL when the job ignores SIGTERM', async () => {
    const d = fakeRoot(
      `process.on('SIGTERM', () => writeFileSync('got-term.txt', '1'));\nprocess.stdin.resume();\nsetInterval(() => {}, 1000);`,
    );
    const ctl = new AbortController();
    const p = spawnJob(d, { graceMs: 300 })(spec, ctl.signal);
    await waitFile(join(d, 'pid.txt'));
    const pid = pidOf(d);
    expect(alive(pid)).toBe(true);
    ctl.abort();
    const t0 = Date.now();
    const r = await p;
    expect(r.ok).toBe(false);
    expect(await waitDead(pid, 5000)).toBe(true);
    expect(Date.now() - t0).toBeGreaterThanOrEqual(250); // it survived SIGTERM until the grace ran out
    expect(existsSync(join(d, 'got-term.txt'))).toBe(true);
  }, 20_000);

  it('does not wait for the grace when the job exits on SIGTERM', async () => {
    const d = fakeRoot(`process.stdin.resume();\nsetInterval(() => {}, 1000);`);
    const ctl = new AbortController();
    const p = spawnJob(d, { graceMs: 10_000 })(spec, ctl.signal);
    await waitFile(join(d, 'pid.txt'));
    ctl.abort();
    const t0 = Date.now();
    await p;
    expect(Date.now() - t0).toBeLessThan(5000);
    expect(await waitDead(pidOf(d), 2000)).toBe(true);
  }, 20_000);

  it('an already aborted signal stops the job', async () => {
    const d = fakeRoot(`process.on('SIGTERM', () => {});\nprocess.stdin.resume();\nsetInterval(() => {}, 1000);`);
    const ctl = new AbortController();
    ctl.abort();
    const t0 = Date.now();
    const r = await spawnJob(d, { graceMs: 200 })(spec, ctl.signal);
    expect(r.ok).toBe(false);
    expect(Date.now() - t0).toBeLessThan(10_000); // the job did not run on forever
  }, 20_000);

  it.each(['stdout', 'stderr'])('fails the job and stops it when %s exceeds the cap', async (stream) => {
    const d = fakeRoot(
      `const chunk = 'x'.repeat(4096);\nprocess.on('SIGTERM', () => {});\nprocess.stdin.resume();\nsetInterval(() => process.${stream}.write(chunk), 1);`,
    );
    const r = await spawnJob(d, { maxBytes: 20_000, graceMs: 200 })(spec, new AbortController().signal);
    expect(r.ok).toBe(false);
    if (r.ok) return;
    expect(r.error.code).toBe('output-too-large');
    expect(r.error.message).toContain(stream);
    expect(r.error.message).toContain('20000');
    expect(await waitDead(pidOf(d), 5000)).toBe(true);
  }, 20_000);

  it('the default cap is 1 MB', () => {
    expect(MAX_OUTPUT_BYTES).toBe(1024 * 1024);
  });
});
