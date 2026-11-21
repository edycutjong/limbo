// MCP server for the LIMBO convergence harness. Not a reducer file.
// Each call that loads app code runs as a job in a fresh child process (see `job-main.mjs`),
// so edited ops are never served from a module cache. Nothing here writes to stdout.
// Convergence is measured, property-tested.
import { spawn } from 'node:child_process';
import { appendFileSync, existsSync, mkdirSync, mkdtempSync, readFileSync, realpathSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, isAbsolute, join, relative, resolve, sep } from 'node:path';
import { fileURLToPath } from 'node:url';
import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { z } from 'zod';
import type { JobReply, JobSpec } from './job.ts';

const APP_NAMES = ['basecamp', 'aftershock'] as const;
export const MAX_ORDERINGS = 5000;
export const DEFAULT_ORDERINGS = 500;
export const SOFT_DEADLINE_MS = 50_000;
export const KILL_MS = 58_000;
/** After SIGTERM, a job that is still alive gets this long before SIGKILL. */
export const KILL_GRACE_MS = 2_000;
/** Cap on captured stdout and on captured stderr, each. Exceeding it fails the job. */
export const MAX_OUTPUT_BYTES = 1024 * 1024;
/** Bounds for explain_trace counterexample inputs; `steps` follows the harness range (default 2..14, tests use up to 30). */
export const MAX_TRACE_STEPS = 30;

/** The hook script is the only lint implementation. It ships with the kit, next to this file. */
/** Same pattern as `OP_FILE_RE` in `kit/hooks/lib.mjs` (a .mjs file with no types here). */
const OP_FILE_RE = /(^|\/)ops\/[^/]+\.op\.ts$/;

const HOOK_PATH = join(dirname(fileURLToPath(import.meta.url)), '..', 'hooks', 'op-lint.mjs');

export type RunJob = (spec: JobSpec, signal: AbortSignal) => Promise<JobReply>;

export interface ServerOptions {
  root: string;
  /** Injection point for tests. The default spawns `node kit/mcp/job-main.mjs`. */
  runJob?: RunJob;
  /** Evidence ledger path. Defaults to `LIMBO_MCP_LOG`, then `<root>/evidence/kiro/mcp-calls.jsonl`. */
  logPath?: string;
  /** Hard kill for a job, in ms. */
  killMs?: number;
}

interface ToolResult {
  [key: string]: unknown;
  content: { type: 'text'; text: string }[];
  structuredContent: Record<string, unknown>;
  isError?: boolean;
}

function ok(data: Record<string, unknown>): ToolResult {
  return { content: [{ type: 'text', text: JSON.stringify(data, null, 2) }], structuredContent: data };
}

function err(code: string, message: string, valid?: string[]): ToolResult {
  const data = { error: { code, message, ...(valid ? { valid } : {}) } };
  return { content: [{ type: 'text', text: JSON.stringify(data, null, 2) }], structuredContent: data, isError: true };
}

/** An error result that also says `pass: false`, for tools whose callers read `pass`. */
function notOk(code: string, message: string): ToolResult {
  const r = err(code, message);
  r.structuredContent = { pass: false, ...r.structuredContent };
  r.content = [{ type: 'text', text: JSON.stringify(r.structuredContent, null, 2) }];
  return r;
}

export interface SpawnOptions {
  /** Wait between SIGTERM and SIGKILL once the signal aborts. */
  graceMs?: number;
  /** Cap on captured stdout and on captured stderr, each. */
  maxBytes?: number;
}

/** Default job runner: one fresh `node` child per call. Abort sends SIGTERM, then SIGKILL after the grace. */
export function spawnJob(root: string, o: SpawnOptions = {}): RunJob {
  const graceMs = o.graceMs ?? KILL_GRACE_MS;
  const maxBytes = o.maxBytes ?? MAX_OUTPUT_BYTES;
  return (spec, signal) =>
    new Promise<JobReply>((resolve) => {
      const child = spawn(process.execPath, [join(root, 'kit', 'mcp', 'job-main.mjs')], {
        cwd: root,
        stdio: ['pipe', 'pipe', 'pipe'],
      });
      let out = '';
      let errText = '';
      let outBytes = 0;
      let errBytes = 0;
      let settled = false;
      let exited = false;
      let escalate: NodeJS.Timeout | undefined;
      const finish = (r: JobReply): void => {
        if (settled) return;
        settled = true;
        signal.removeEventListener('abort', stop);
        resolve(r);
      };
      const crashed = (why: string): JobReply => ({
        ok: false,
        error: { code: 'job-crashed', message: `${why}${errText ? `: ${errText.split('\n').slice(0, 5).join(' | ')}` : ''}` },
      });
      function stop(): void {
        if (exited) return;
        child.kill('SIGTERM');
        escalate ??= setTimeout(() => {
          if (!exited) child.kill('SIGKILL');
        }, graceMs);
      }
      const tooBig = (which: string): void => {
        stop();
        finish({ ok: false, error: { code: 'output-too-large', message: `job ${which} exceeded ${maxBytes} bytes and the job was stopped` } });
      };
      if (signal.aborted) stop();
      else signal.addEventListener('abort', stop, { once: true });
      child.stdout.on('data', (d: Buffer) => {
        if (settled) return;
        outBytes += d.length;
        if (outBytes > maxBytes) return tooBig('stdout');
        out += d.toString();
      });
      child.stderr.on('data', (d: Buffer) => {
        if (settled) return;
        errBytes += d.length;
        if (errBytes > maxBytes) return tooBig('stderr');
        errText += d.toString();
        process.stderr.write(d);
      });
      child.on('error', (e) => finish(crashed(e.message)));
      child.on('close', (code) => {
        exited = true;
        clearTimeout(escalate);
        const line = out.split('\n').filter((l) => l.trim() !== '').pop();
        if (line === undefined) return finish(crashed(`job exited with code ${String(code)} and no reply`));
        try {
          finish(JSON.parse(line) as JobReply);
        } catch {
          finish(crashed('job reply was not JSON'));
        }
      });
      child.stdin.on('error', () => undefined);
      child.stdin.end(JSON.stringify(spec));
    });
}

export function createServer(opts: ServerOptions): McpServer {
  const { root } = opts;
  const killMs = opts.killMs ?? KILL_MS;
  const runJob = opts.runJob ?? spawnJob(root);
  const server = new McpServer({ name: 'limbo-convergence', version: '0.0.0' });

  const badApp = (app: string): ToolResult | null =>
    (APP_NAMES as readonly string[]).includes(app)
      ? null
      : err('unknown-app', `unknown app "${app}"; valid apps: ${APP_NAMES.join(', ')}`, [...APP_NAMES]);

  /** Run a job with a hard kill. Never throws. */
  async function call(spec: JobSpec): Promise<JobReply> {
    const ctl = new AbortController();
    let timer: NodeJS.Timeout | undefined;
    const timeout = new Promise<JobReply>((resolve) => {
      timer = setTimeout(() => {
        ctl.abort();
        resolve({ ok: false, error: { code: 'timeout', message: `job still running after ${killMs} ms and was stopped` } });
      }, killMs);
    });
    try {
      return await Promise.race([runJob(spec, ctl.signal), timeout]);
    } catch (e) {
      return { ok: false, error: { code: 'job-crashed', message: e instanceof Error ? e.message : String(e) } };
    } finally {
      clearTimeout(timer);
    }
  }

  const reply = (r: JobReply, extra: Record<string, unknown> = {}): ToolResult =>
    r.ok ? ok({ ...(r.result as Record<string, unknown>), ...extra }) : err(r.error.code, r.error.message, r.error.valid);

  const ledgerPath = opts.logPath ?? process.env.LIMBO_MCP_LOG ?? join(root, 'evidence', 'kiro', 'mcp-calls.jsonl');

  /** Append one evidence line. A write error goes to stderr and never changes the tool result. */
  function appendLedger(row: Record<string, unknown>): void {
    try {
      mkdirSync(dirname(ledgerPath), { recursive: true });
      appendFileSync(ledgerPath, `${JSON.stringify(row)}\n`);
    } catch (e) {
      process.stderr.write(`mcp-calls ledger: ${e instanceof Error ? e.message : String(e)}\n`);
    }
  }

  const str = (v: unknown): string | null => (typeof v === 'string' ? v : null);

  /** Wrap a handler: catch exceptions, and append exactly one ledger line in `finally`. */
  const guarded =
    <A extends object>(tool: string, fn: (a: A) => Promise<ToolResult>) =>
    async (a: A): Promise<ToolResult> => {
      const t0 = performance.now();
      const { app, op } = a as { app?: unknown; op?: unknown };
      let out: ToolResult | undefined;
      try {
        out = await fn(a);
      } catch (e) {
        out = err('job-crashed', e instanceof Error ? e.message : String(e));
      } finally {
        const sc = out?.structuredContent;
        const failed = out === undefined || out.isError === true;
        appendLedger({
          ts: new Date().toISOString(),
          tool,
          app: str(app),
          op: str(op),
          pass: !failed && typeof sc?.pass === 'boolean' ? sc.pass : null,
          runs: !failed && typeof sc?.runs === 'number' ? sc.runs : null,
          ms: Math.round(performance.now() - t0),
        });
      }
      return out;
    };

  server.registerTool(
    'list_ops',
    {
      description: 'List the registered ops of an app: name, merge rule, intent kind, props file.',
      inputSchema: { app: z.string().describe('basecamp or aftershock') },
    },
    guarded('list_ops', async ({ app }: { app: string }) => {
      const bad = badApp(app);
      if (bad) return bad;
      return reply(await call({ job: 'list_ops', root, app }));
    }),
  );

  server.registerTool(
    'fuzz_op',
    {
      description:
        'Fuzz one registered op over random delivery orders with the same properties `pnpm props` runs. Returns pass, runs, vacuity and, on failure, the shrunk counterexample.',
      inputSchema: {
        app: z.string().describe('basecamp or aftershock'),
        op: z.string().describe('op name, for example item.tick'),
        orderings: z.number().int().optional().describe(`runs, default ${DEFAULT_ORDERINGS}, clamped to 1..${MAX_ORDERINGS}`),
        replicas: z.number().optional().describe('integer 2..5, default 3'),
        seed: z.number().int().optional().describe('run seed, default is the harness seed'),
      },
    },
    guarded('fuzz_op', async (a: { app: string; op: string; orderings?: number; replicas?: number; seed?: number }) => {
      const bad = badApp(a.app);
      if (bad) return bad;
      if (a.replicas !== undefined && (!Number.isInteger(a.replicas) || a.replicas < 2 || a.replicas > 5)) {
        return err('bad-argument', `replicas must be an integer from 2 to 5, got ${a.replicas}`);
      }
      const requested = a.orderings ?? DEFAULT_ORDERINGS;
      const orderings = Math.min(MAX_ORDERINGS, Math.max(1, requested));
      const clamped = orderings !== requested;
      const spec: JobSpec = {
        job: 'fuzz_op',
        root,
        app: a.app,
        op: a.op,
        orderings,
        ...(a.replicas !== undefined ? { replicas: a.replicas } : {}),
        ...(a.seed !== undefined ? { seed: a.seed } : {}),
        deadlineMs: SOFT_DEADLINE_MS,
      };
      return reply(await call(spec), clamped ? { requested, clamped: true } : {});
    }),
  );

  server.registerTool(
    'explain_trace',
    {
      description: 'Replay a counterexample from fuzz_op and name the first delivery step where replicas differ.',
      inputSchema: {
        app: z.string().describe('basecamp or aftershock'),
        op: z.string().describe('op name the counterexample came from'),
        counterexample: z.object({
          property: z.string(),
          reason: z.string(),
          seed: z.number(),
          steps: z.number(),
          replicas: z.number(),
          script: z.array(
            z.object({
              id: z.string(),
              op: z.string(),
              target: z.string(),
              payload: z.unknown(),
              stamp: z.object({ l: z.number(), r: z.string(), n: z.number() }),
              deps: z.record(z.string(), z.number()),
            }),
          ),
          deliveries: z.record(z.string(), z.array(z.string())),
        }),
      },
    },
    guarded('explain_trace', async (a: { app: string; op: string; counterexample: Extract<JobSpec, { job: 'explain_trace' }>['counterexample'] }) => {
      const bad = badApp(a.app);
      if (bad) return bad;
      const ce = a.counterexample;
      if (!Number.isInteger(ce.steps) || ce.steps < 0 || ce.steps > MAX_TRACE_STEPS) {
        return err('bad-argument', `counterexample.steps must be an integer from 0 to ${MAX_TRACE_STEPS}, got ${ce.steps}`);
      }
      if (!Number.isInteger(ce.replicas) || ce.replicas < 2 || ce.replicas > 5) {
        return err('bad-argument', `counterexample.replicas must be an integer from 2 to 5, got ${ce.replicas}`);
      }
      if (!Number.isSafeInteger(ce.seed)) {
        return err('bad-argument', `counterexample.seed must be an integer, got ${ce.seed}`);
      }
      return reply(await call({ job: 'explain_trace', root, app: a.app, op: a.op, counterexample: a.counterexample }));
    }),
  );

  server.registerTool(
    'check_lint',
    {
      description: 'Run the op lint hook on one file.',
      inputSchema: { file: z.string().describe('path of an op file, relative to the repo root or absolute') },
    },
    guarded('check_lint', async ({ file }: { file: string }) => {
      const abs = resolve(root, file);
      const outside = (p: string): boolean => {
        const r = relative(root, p);
        return r === '..' || r.startsWith(`..${sep}`) || isAbsolute(r);
      };
      if (outside(abs)) return notOk('file-outside-root', `file "${file}" is outside the workspace root`);
      if (!existsSync(abs)) return notOk('file-not-found', `file "${file}" does not exist`);
      const realRoot = realpathSync(root);
      const realRel = relative(realRoot, realpathSync(abs));
      if (realRel === '..' || realRel.startsWith(`..${sep}`) || isAbsolute(realRel)) {
        return notOk('file-outside-root', `file "${file}" is outside the workspace root`);
      }
      const real = realpathSync(abs);
      if (!OP_FILE_RE.test(real.split(sep).join('/'))) {
        return notOk('not-an-op-file', `file "${file}" is not an op file (expected ops/<name>.op.ts)`);
      }
      const dir = mkdtempSync(join(tmpdir(), 'limbo-lint-'));
      const ledger = join(dir, 'hooks.jsonl');
      try {
        const run = await new Promise<{ exit: number | null; stderr: string }>((res) => {
          const child = spawn(process.execPath, [HOOK_PATH], {
            cwd: root,
            stdio: ['pipe', 'pipe', 'pipe'],
            env: { ...process.env, LIMBO_ROOT: root, LIMBO_HOOKS_LOG: ledger },
            timeout: 20_000,
            killSignal: 'SIGKILL',
          });
          let stderr = '';
          child.stdout.on('data', () => undefined);
          child.stderr.on('data', (d: Buffer) => {
            if (stderr.length > MAX_OUTPUT_BYTES) return;
            stderr += d.toString();
            if (stderr.length > MAX_OUTPUT_BYTES) child.kill('SIGKILL');
          });
          child.on('error', (e) => res({ exit: null, stderr: e.message }));
          child.on('close', (code) => res({ exit: code, stderr }));
          child.stdin.on('error', () => undefined);
          child.stdin.end(JSON.stringify({ file_path: real, cwd: root }));
        });
        let row: { result?: string; target?: string | null; detail?: string | null } | undefined;
        try {
          row = readFileSync(ledger, 'utf8')
            .split('\n')
            .filter(Boolean)
            .map((l) => JSON.parse(l) as { result?: string; target?: string | null; detail?: string | null })
            .pop();
        } catch {
          row = undefined;
        }
        if (!row) return err('job-crashed', `lint hook wrote no result: ${run.stderr.split('\n').slice(0, 5).join(' | ')}`);
        const violations: { rule: string; message: string }[] = [];
        for (const line of run.stderr.split('\n')) {
          const m = /^op-lint [^:]*: \[([^\]]+)\] (.*)$/.exec(line);
          if (m) violations.push({ rule: m[1]!, message: m[2]! });
        }
        return ok({
          pass: row.result === 'pass',
          result: row.result ?? null,
          exit: run.exit,
          target: row.target ?? null,
          detail: row.detail ?? null,
          violations,
        });
      } finally {
        rmSync(dir, { recursive: true, force: true });
      }
    }),
  );

  return server;
}
