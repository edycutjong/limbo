// Job layer: the work of one MCP tool call, as plain functions. Not a reducer file.
// `job-main.mjs` runs one job in a fresh child process; tests call `runJobInProcess` directly.
// It reimplements no property, merge or delivery order: it calls the engine and `simulate.ts`.
// Convergence is measured, property-tested.
import { existsSync } from 'node:fs';
import { join } from 'node:path';
import { pathToFileURL } from 'node:url';
import { canonical } from '../../skeleton/src/core/causal.ts';
import { explainTrace, simulate } from '../../skeleton/src/core/simulate.ts';
import type { OpDef } from '../../skeleton/src/core/types.ts';
import { config } from '../props/config.ts';
import { fuzz, type Counterexample, type FuzzResult, type RunOptions } from '../props/engine.ts';

export const APPS = ['basecamp', 'aftershock'] as const;

export interface JobError {
  code: string;
  message: string;
  valid?: string[];
}

export type JobReply<T = unknown> = { ok: true; result: T } | { ok: false; error: JobError };

export interface OpEntry {
  def: OpDef;
  opts: RunOptions;
  propsFile: string | null;
}

export interface OpInfo {
  name: string;
  merge: string;
  intent: string;
  propsFile: string | null;
}

export interface FirstDifference {
  step: number;
  replicas: [string, string];
  appliedOps: string[];
  states: Record<string, string>;
}

export interface ExplainResult {
  property: string;
  reason: string;
  /** True when every replica ended in the same state (a wrong answer everyone shares). */
  agree: boolean;
  firstDifference: FirstDifference | null;
  /** Per replica: canonical state after each delivery. */
  states: Record<string, { step: number; opId: string; duplicate: boolean; state: string }[]>;
  /** The text `explainTrace` produced. */
  text: string;
}

export type JobSpec =
  | { job: 'list_ops'; root: string; app: string }
  | { job: 'fuzz_op'; root: string; app: string; op: string; orderings?: number; replicas?: number; seed?: number; deadlineMs?: number }
  | { job: 'explain_trace'; root: string; app: string; op: string; counterexample: Counterexample };

/** Fixture override: replaces the registry lookup for a def that is in no registry. */
export interface JobOverrides {
  defs?: Readonly<Record<string, { def: OpDef; opts?: RunOptions }>>;
}

const fail = (code: string, message: string, valid?: string[]): JobReply<never> => ({
  ok: false,
  error: { code, message, ...(valid ? { valid } : {}) },
});

const errText = (e: unknown): string => (e instanceof Error ? e.message : String(e));

/** Import `apps/<app>/src/ops/registry.gen.ts` and each op's `<op>.props.ts`. Fresh per process. */
export async function loadApp(root: string, app: string): Promise<JobReply<OpEntry[]>> {
  if (!(APPS as readonly string[]).includes(app)) {
    return fail('unknown-app', `unknown app "${app}"; valid apps: ${APPS.join(', ')}`, [...APPS]);
  }
  const dir = join(root, 'apps', app, 'src', 'ops');
  const registry = join(dir, 'registry.gen.ts');
  if (!existsSync(registry)) return fail('import-failed', `registry not found: apps/${app}/src/ops/registry.gen.ts`);
  let defs: OpDef[];
  try {
    const mod = (await import(pathToFileURL(registry).href)) as { ops?: OpDef[] };
    defs = mod.ops ?? [];
  } catch (e) {
    return fail('import-failed', `could not import apps/${app}/src/ops/registry.gen.ts: ${errText(e)}`);
  }
  const entries: OpEntry[] = [];
  for (const def of defs) {
    const rel = `apps/${app}/src/ops/${def.name}.props.ts`;
    const file = join(root, rel);
    if (!existsSync(file)) {
      entries.push({ def, opts: {}, propsFile: null });
      continue;
    }
    try {
      const pm = (await import(pathToFileURL(file).href)) as { opts?: RunOptions };
      entries.push({ def, opts: pm.opts ?? {}, propsFile: rel });
    } catch (e) {
      return fail('import-failed', `could not import ${rel}: ${errText(e)}`);
    }
  }
  return { ok: true, result: entries };
}

export async function listOps(root: string, app: string): Promise<JobReply<{ app: string; ops: OpInfo[] }>> {
  const loaded = await loadApp(root, app);
  if (!loaded.ok) return loaded;
  const ops = loaded.result
    .map((e) => ({ name: e.def.name, merge: e.def.merge, intent: e.def.intent.kind, propsFile: e.propsFile }))
    .sort((a, b) => (a.name < b.name ? -1 : a.name > b.name ? 1 : 0));
  return { ok: true, result: { app, ops } };
}

async function findOp(spec: { root: string; app: string; op: string }, overrides?: JobOverrides): Promise<JobReply<OpEntry>> {
  const over = overrides?.defs?.[spec.op];
  if (over) return { ok: true, result: { def: over.def, opts: over.opts ?? {}, propsFile: null } };
  const loaded = await loadApp(spec.root, spec.app);
  if (!loaded.ok) return loaded;
  const hit = loaded.result.find((e) => e.def.name === spec.op);
  if (hit) return { ok: true, result: hit };
  const valid = loaded.result.map((e) => e.def.name).sort();
  return fail('unknown-op', `unknown op "${spec.op}" in ${spec.app}; valid ops: ${valid.join(', ')}`, valid);
}

export async function fuzzJob(
  spec: Extract<JobSpec, { job: 'fuzz_op' }>,
  overrides?: JobOverrides,
): Promise<JobReply<FuzzResult & { op: string; app: string }>> {
  const found = await findOp(spec, overrides);
  if (!found.ok) return found;
  const { def, opts } = found.result;
  const r = fuzz(def, opts, {
    orderings: spec.orderings ?? config.orderings,
    replicas: spec.replicas ?? config.replicas,
    seed: spec.seed ?? config.seed,
    ...(spec.deadlineMs !== undefined ? { deadlineMs: spec.deadlineMs } : {}),
  });
  return { ok: true, result: { ...r, op: spec.op, app: spec.app } };
}

/** Parse the `first difference` block of `explainTrace` text. The rule itself stays in `simulate.ts`. */
function parseFirstDifference(text: string): FirstDifference | null {
  const lines = text.split('\n');
  const i = lines.findIndex((l) => l.startsWith('first difference at step '));
  if (i < 0) return null;
  const m = /^first difference at step (\d+): replicas (\S+) and (\S+) hold \{(.*)\} but differ:$/.exec(lines[i]!);
  if (!m) return null;
  const [, step, a, b, key] = m as unknown as [string, string, string, string, string];
  const stateOf = (line: string | undefined, r: string): string => (line ?? '').replace(new RegExp(`^\\s*${r}: `), '');
  return {
    step: Number(step),
    replicas: [a, b],
    appliedOps: key === '' ? [] : key.split(','),
    states: { [a]: stateOf(lines[i + 1], a), [b]: stateOf(lines[i + 2], b) },
  };
}

export async function explainJob(
  spec: Extract<JobSpec, { job: 'explain_trace' }>,
  overrides?: JobOverrides,
): Promise<JobReply<ExplainResult>> {
  const found = await findOp(spec, overrides);
  if (!found.ok) return found;
  const { def, opts } = found.result;
  const ce = spec.counterexample;
  const res = simulate({
    defs: [def],
    replicas: ce.replicas,
    seed: ce.seed,
    steps: ce.steps,
    init: opts.init ?? (() => ({})),
    ...(opts.gen ? { gen: opts.gen } : {}),
  });
  const script = res.ops.map((o) => ({ id: o.id, op: o.op, target: o.target, payload: o.payload, stamp: o.stamp, deps: o.deps }));
  if (canonical(script) !== canonical(ce.script) || canonical(res.orders) !== canonical(ce.deliveries)) {
    return fail('stale-counterexample', `the replayed script or deliveries differ from the counterexample for ${spec.op}; the op code or its generator changed. Fuzz again.`);
  }
  const states: ExplainResult['states'] = {};
  for (const s of res.trace) {
    const rows = (states[s.replica] ??= []);
    rows.push({ step: rows.length, opId: s.opId, duplicate: s.duplicate, state: s.stateAfter });
  }
  const text = explainTrace(res);
  const finals = Object.values(res.states);
  return {
    ok: true,
    result: {
      property: ce.property,
      reason: ce.reason,
      agree: finals.every((s) => s === finals[0]),
      firstDifference: parseFirstDifference(text),
      states,
      text,
    },
  };
}

/** Run one job spec in this process. Tests inject `overrides.defs` for fixtures. */
export async function runJobInProcess(spec: JobSpec, overrides?: JobOverrides): Promise<JobReply> {
  try {
    if (spec.job === 'list_ops') return await listOps(spec.root, spec.app);
    if (spec.job === 'fuzz_op') return await fuzzJob(spec, overrides);
    if (spec.job === 'explain_trace') return await explainJob(spec, overrides);
    return fail('bad-argument', `unknown job "${String((spec as { job?: unknown }).job)}"`);
  } catch (e) {
    return fail('job-crashed', errText(e));
  }
}
