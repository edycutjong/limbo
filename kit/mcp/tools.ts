// MCP server for the LIMBO convergence harness. Not a reducer file.
// Each call that loads app code runs as a job in a fresh child process (see `job-main.mjs`),
// so edited ops are never served from a module cache. Nothing here writes to stdout.
// Convergence is measured, property-tested.
import { spawn } from 'node:child_process';
import { join } from 'node:path';
import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { z } from 'zod';
import type { JobReply, JobSpec } from './job.ts';

const APP_NAMES = ['basecamp', 'aftershock'] as const;
export const MAX_ORDERINGS = 5000;
export const DEFAULT_ORDERINGS = 500;
export const SOFT_DEADLINE_MS = 50_000;
export const KILL_MS = 58_000;

export type RunJob = (spec: JobSpec, signal: AbortSignal) => Promise<JobReply>;

export interface ServerOptions {
  root: string;
  /** Injection point for tests. The default spawns `node kit/mcp/job-main.mjs`. */
  runJob?: RunJob;
  /** Evidence ledger path (written by the ledger task). */
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

/** Default job runner: one fresh `node` child per call. */
export function spawnJob(root: string): RunJob {
  return (spec, signal) =>
    new Promise<JobReply>((resolve) => {
      const child = spawn(process.execPath, [join(root, 'kit', 'mcp', 'job-main.mjs')], {
        cwd: root,
        stdio: ['pipe', 'pipe', 'pipe'],
        signal,
      });
      let out = '';
      let errText = '';
      const crashed = (why: string): JobReply => ({
        ok: false,
        error: { code: 'job-crashed', message: `${why}${errText ? `: ${errText.split('\n').slice(0, 5).join(' | ')}` : ''}` },
      });
      child.stdout.on('data', (d: Buffer) => (out += d.toString()));
      child.stderr.on('data', (d: Buffer) => {
        errText += d.toString();
        process.stderr.write(d);
      });
      child.on('error', (e) => resolve(crashed(e.message)));
      child.on('close', (code) => {
        const line = out.split('\n').filter((l) => l.trim() !== '').pop();
        if (line === undefined) return resolve(crashed(`job exited with code ${String(code)} and no reply`));
        try {
          resolve(JSON.parse(line) as JobReply);
        } catch {
          resolve(crashed('job reply was not JSON'));
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

  const guarded =
    <A>(fn: (a: A) => Promise<ToolResult>) =>
    async (a: A): Promise<ToolResult> => {
      try {
        return await fn(a);
      } catch (e) {
        return err('job-crashed', e instanceof Error ? e.message : String(e));
      }
    };

  server.registerTool(
    'list_ops',
    {
      description: 'List the registered ops of an app: name, merge rule, intent kind, props file.',
      inputSchema: { app: z.string().describe('basecamp or aftershock') },
    },
    guarded(async ({ app }: { app: string }) => {
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
    guarded(async (a: { app: string; op: string; orderings?: number; replicas?: number; seed?: number }) => {
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
    guarded(async (a: { app: string; op: string; counterexample: Extract<JobSpec, { job: 'explain_trace' }>['counterexample'] }) => {
      const bad = badApp(a.app);
      if (bad) return bad;
      return reply(await call({ job: 'explain_trace', root, app: a.app, op: a.op, counterexample: a.counterexample }));
    }),
  );

  server.registerTool(
    'check_lint',
    {
      description: 'Run the op lint hook on one file.',
      inputSchema: { file: z.string().describe('path of an op file, relative to the repo root or absolute') },
    },
    guarded(async () => err('not-implemented', 'check_lint is added by a later task')),
  );

  return server;
}
