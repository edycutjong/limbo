// Property engine: the vitest-free harness shared by `run.ts` (suite) and the MCP server.
// Not a reducer file. Randomness comes only from the simulator's seeded PRNG.
// Convergence is measured, property-tested.
import { existsSync, readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import * as fc from 'fast-check';
import { canonical, causalBuffer, compareStamp, concurrent } from '../../skeleton/src/core/causal.ts';
import { explainTrace, simulate, type Rand, type SimResult } from '../../skeleton/src/core/simulate.ts';
import type { Intent, Op, OpDef, Stamp, VV } from '../../skeleton/src/core/types.ts';
import { config as defaultConfig, type PropsConfig } from './config.ts';

export const MANIFEST_PATH = join(dirname(fileURLToPath(import.meta.url)), 'intents.json');

/** An extra per-run check (intent oracles plug in here). Returns true or a reason. */
export interface RunCheck {
  name: string;
  check(res: SimResult, ctx: { def: OpDef; init: () => unknown }): true | string;
}

export interface RunOptions {
  config?: PropsConfig;
  init?: () => unknown;
  gen?: (def: OpDef, rand: Rand) => { target: string; payload: unknown };
  /** Script length range. Default 2..14. */
  steps?: { min: number; max: number };
  /** Intent manifest: op name -> intent. Default: `kit/props/intents.json`. */
  manifest?: Readonly<Record<string, Intent>>;
  /** Additional checks run on every simulated script. */
  checks?: readonly RunCheck[];
}

export type Failure = { property: string; reason: string };

/** Read `intents.json`. Accepts `{name: intent}`, `{ops: {name: intent}}` or `[{name, intent}]`. */
export function loadManifest(path: string = MANIFEST_PATH): Record<string, Intent> | undefined {
  if (!existsSync(path)) return undefined;
  const raw: unknown = JSON.parse(readFileSync(path, 'utf8'));
  if (Array.isArray(raw)) {
    return Object.fromEntries((raw as { name: string; intent: Intent }[]).map((e) => [e.name, e.intent]));
  }
  const obj = raw as Record<string, unknown>;
  const inner = obj.ops;
  return (inner !== undefined && typeof inner === 'object' ? inner : obj) as Record<string, Intent>;
}

/** Manifest property (R10.6, R10.7): the op is listed and its intent matches. */
export function checkManifest(def: OpDef, manifest: Readonly<Record<string, Intent>> | undefined): true | string {
  if (manifest === undefined) return `intents.json not found; op "${def.name}" has no manifest entry`;
  const entry = manifest[def.name];
  if (entry === undefined) return `op "${def.name}" is missing from intents.json`;
  // R13 maps op name to intent kind. An entry that also names a `field` must match it too.
  const entryField = (entry as { field?: string }).field;
  const defField = (def.intent as { field?: string }).field;
  if (entry.kind !== def.intent.kind || (entryField !== undefined && entryField !== defField)) {
    return `op "${def.name}" declares intent ${canonical(def.intent)} but intents.json has ${canonical(entry)}`;
  }
  return true;
}

function applyAll(def: OpDef, init: () => unknown, ops: readonly Op[]): unknown {
  let s = init();
  for (const o of ops) if (o.op === def.name && def.apply) s = def.apply(s, o);
  return s;
}

/** Feed ops (in the given order) through a fresh causal buffer; return applied ops and the held count. */
function bufferRun(order: readonly Op[]): { applied: Op[]; held: number } {
  const buf = causalBuffer();
  const applied: Op[] = [];
  for (const o of order) applied.push(...buf.offer(o));
  return { applied, held: buf.held().length };
}

type Prop = (res: SimResult, def: OpDef, init: () => unknown) => true | string;

const RAW_IDEMPOTENCE = 'raw idempotence';

const PROPS: Record<string, Prop> = {
  convergence(res) {
    const entries = Object.entries(res.states);
    const [r0, s0] = entries[0] ?? ['', ''];
    for (const [r, s] of entries) if (s !== s0) return `replicas ${r0} and ${r} ended in different states:\n  ${r0}: ${s0}\n  ${r}: ${s}`;
    return true;
  },

  'replay equivalence'(res, def, init) {
    // Lamport order extends causal order, so the sorted full log is a valid single-pass delivery.
    const sorted = [...res.ops].sort((a, b) => compareStamp(a.stamp, b.stamp));
    const { applied } = bufferRun(sorted);
    const replayed = canonical(applyAll(def, init, applied));
    for (const [r, s] of Object.entries(res.states)) {
      if (s !== replayed) return `replica ${r} differs from the one-pass replay of the sorted log:\n  ${r}: ${s}\n  replay: ${replayed}`;
    }
    return true;
  },

  idempotence(res, def, init) {
    // Redelivery: offering the whole log a second time must apply nothing and leave the state unchanged.
    // (A delta `+=` is idempotent only through the causal buffer, which drops a repeated op id.)
    const sorted = [...res.ops].sort((a, b) => compareStamp(a.stamp, b.stamp));
    const buf = causalBuffer();
    const first: Op[] = [];
    for (const o of sorted) first.push(...buf.offer(o));
    const again: Op[] = [];
    for (const o of [...sorted, ...sorted]) again.push(...buf.offer(o));
    if (again.length > 0) return `redelivering the log applied ${again.length} op(s) a second time`;
    const once = canonical(applyAll(def, init, first));
    for (const [r, s] of Object.entries(res.states)) {
      if (s !== once) return `replica ${r} with duplicate deliveries differs from the single-delivery state:\n  ${r}: ${s}\n  once: ${once}`;
    }
    return true;
  },

  'raw idempotence'(res, def, init) {
    // Steering rule 6 checked on the reducer itself: apply(apply(s, o), o) equals apply(s, o).
    // The causal buffer drops a repeated op id before apply runs, so this property bypasses it.
    if (!def.apply) return true;
    const sorted = [...res.ops].sort((a, b) => compareStamp(a.stamp, b.stamp));
    const { applied } = bufferRun(sorted);
    let s = init();
    for (const o of applied) {
      if (o.op !== def.name) continue;
      const once = def.apply(s, o);
      const twice = def.apply(once, o);
      const a = canonical(once);
      const b = canonical(twice);
      if (a !== b) return `apply is not idempotent for op ${o.id}:\n  apply once:  ${a}\n  apply twice: ${b}`;
      s = once;
    }
    return true;
  },

  commutes(res, def, init) {
    if (def.merge !== 'commutes' || !def.apply) return true;
    const mine = res.ops.filter((o) => o.op === def.name);
    for (const x of mine) {
      for (const y of mine) {
        if (x.id >= y.id || !concurrent(x, y)) continue;
        const xy = canonical(applyAll(def, init, [x, y]));
        const yx = canonical(applyAll(def, init, [y, x]));
        if (xy !== yx) return `concurrent ops ${x.id} and ${y.id} do not commute:\n  x then y: ${xy}\n  y then x: ${yx}`;
      }
    }
    const sorted = [...res.ops].sort((a, b) => compareStamp(a.stamp, b.stamp));
    const fwd = canonical(applyAll(def, init, sorted));
    const rev = canonical(applyAll(def, init, [...sorted].reverse()));
    return fwd === rev ? true : `a commutes op depends on order across the whole log:\n  sorted: ${fwd}\n  reversed: ${rev}`;
  },

  'no lost edit'(res, def, init) {
    // Every op reaches every replica: nothing stays held, nothing is dropped.
    const byId = new Map(res.ops.map((o) => [o.id, o] as const));
    for (const [r, order] of Object.entries(res.orders)) {
      const { applied, held } = bufferRun(order.map((id) => byId.get(id)!));
      if (held > 0 || applied.length !== res.ops.length) {
        return `replica ${r} applied ${applied.length} of ${res.ops.length} ops (${held} still held)`;
      }
    }
    // The op's own invariant holds on every final state.
    if (def.invariant) {
      const sorted = [...res.ops].sort((a, b) => compareStamp(a.stamp, b.stamp));
      const v = def.invariant(applyAll(def, init, sorted));
      if (v !== true) return `invariant failed: ${v}`;
    }
    return true;
  },
};

export const PROPERTY_NAMES: readonly string[] = [...Object.keys(PROPS), 'manifest'];

/** Build the full failure message: shrunk script, delivery order, seeds, explainTrace. */
export function formatFailure(property: string, reason: string, res: SimResult, runSeed: number): string {
  const script = res.ops.map((o) => `  ${o.id} ${o.op} -> ${o.target} ${canonical(o.payload)} stamp=${canonical(o.stamp)} deps=${canonical(o.deps)}`);
  const orders = Object.entries(res.orders).map(([r, ids]) => `  ${r}: ${ids.join(' ')}`);
  return [
    `property "${property}" failed: ${reason}`,
    'shrunk script:',
    ...script,
    'delivery order per replica:',
    ...orders,
    `seed: ${runSeed} (simulation seed ${res.seed})`,
    'explainTrace:',
    explainTrace(res),
  ].join('\n');
}

/** One simulated run, every property. Returns the simulation result and the failures (empty = pass). */
export function runOnce(def: OpDef, simSeed: number, steps: number, opts: RunOptions = {}): { res: SimResult; failures: Failure[] } {
  const cfg = opts.config ?? defaultConfig;
  const init = opts.init ?? (() => ({}));
  const res = simulate({
    defs: [def],
    replicas: cfg.replicas,
    seed: simSeed,
    steps,
    init,
    ...(opts.gen ? { gen: opts.gen } : {}),
  });
  const failures: Failure[] = [];
  // `raw idempotence` reports last, so the first failure of a fixture stays the property that names its mistake.
  const run = (name: string, p: Prop): void => {
    const r = p(res, def, init);
    if (r !== true) failures.push({ property: name, reason: formatFailure(name, r, res, cfg.seed) });
  };
  for (const [name, p] of Object.entries(PROPS)) if (name !== RAW_IDEMPOTENCE) run(name, p);
  for (const c of opts.checks ?? []) {
    const r = c.check(res, { def, init });
    if (r !== true) failures.push({ property: c.name, reason: formatFailure(c.name, r, res, cfg.seed) });
  }
  run(RAW_IDEMPOTENCE, PROPS[RAW_IDEMPOTENCE]!);
  return { res, failures };
}

/** One simulated run, every property. Returns the failures (empty = pass). Used by tests and mutant checks. */
export function checkRun(def: OpDef, simSeed: number, steps: number, opts: RunOptions = {}): Failure[] {
  return runOnce(def, simSeed, steps, opts).failures;
}

/** Names of properties that fail over `numRuns` runs of the given def (no shrinking). */
export function failingProperties(def: OpDef, opts: RunOptions = {}, numRuns?: number): string[] {
  const cfg = opts.config ?? defaultConfig;
  const runs = numRuns ?? cfg.orderings;
  const range = opts.steps ?? { min: 2, max: 14 };
  const names = new Set<string>();
  for (let i = 0; i < runs; i++) {
    const steps = range.min + (i % (range.max - range.min + 1));
    for (const f of checkRun(def, (cfg.seed + i) >>> 0, steps, opts)) names.add(f.property);
  }
  return [...names];
}

export interface FuzzParams {
  orderings: number;
  replicas: number;
  seed: number;
  /** Stop starting runs after this many ms (sets `truncated`). */
  deadlineMs?: number;
}

export interface Counterexample {
  property: string;
  reason: string;
  /** Simulation seed (replay input). */
  seed: number;
  steps: number;
  replicas: number;
  script: { id: string; op: string; target: string; payload: unknown; stamp: Stamp; deps: VV }[];
  /** Replica -> op ids in delivery order, duplicates included. */
  deliveries: Record<string, string[]>;
}

export interface FuzzResult {
  pass: boolean;
  runs: number;
  seed: number;
  truncated: boolean;
  vacuity: { concurrentShare: number; minShare: number; vacuous: boolean };
  counterexample?: Counterexample;
  warning?: string;
}

/** Same bar as the kit's vacuity guard. */
const MIN_CONCURRENT_SHARE = 0.5;

function hasConcurrentPair(ops: readonly Op[]): boolean {
  for (let i = 0; i < ops.length; i++) {
    for (let j = i + 1; j < ops.length; j++) {
      if (ops[i]!.target === ops[j]!.target && concurrent(ops[i]!, ops[j]!)) return true;
    }
  }
  return false;
}

function counterexampleOf(def: OpDef, opts: RunOptions, cfgSeed: number, simSeed: number, steps: number, replicas: number): Counterexample | undefined {
  const { res, failures } = runOnce(def, simSeed, steps, { ...opts, config: { ...(opts.config ?? defaultConfig), replicas, seed: cfgSeed } });
  const f = failures[0];
  if (f === undefined) return undefined;
  return {
    property: f.property,
    reason: f.reason,
    seed: res.seed,
    steps,
    replicas,
    script: res.ops.map((o) => ({ id: o.id, op: o.op, target: o.target, payload: o.payload, stamp: o.stamp, deps: o.deps })),
    deliveries: res.orders,
  };
}

/**
 * Fuzz one op: the same loop as `runOpProperties`, with `orderings`, `replicas` and `seed` as inputs.
 * `pass` does not depend on vacuity; the share is reported with a warning instead.
 */
export function fuzz(def: OpDef, opts: RunOptions, p: FuzzParams): FuzzResult {
  const base = opts.config ?? defaultConfig;
  const cfg: PropsConfig = { ...base, replicas: p.replicas, seed: p.seed, orderings: p.orderings };
  const vac = (counted: number, executed: number): FuzzResult['vacuity'] => {
    const share = executed === 0 ? 0 : counted / executed;
    return { concurrentShare: share, minShare: MIN_CONCURRENT_SHARE, vacuous: share < MIN_CONCURRENT_SHARE };
  };
  const warn = (v: FuzzResult['vacuity']): { warning?: string } =>
    v.vacuous ? { warning: `only ${(v.concurrentShare * 100).toFixed(0)}% of runs had concurrent ops on one target; a pass says little` } : {};

  const m = checkManifest(def, opts.manifest ?? loadManifest());
  if (m !== true) {
    const v = vac(0, 0);
    return {
      pass: false,
      runs: 0,
      seed: p.seed,
      truncated: false,
      vacuity: v,
      counterexample: { property: 'manifest', reason: m, seed: 0, steps: 0, replicas: p.replicas, script: [], deliveries: {} },
    };
  }

  const range = opts.steps ?? { min: 2, max: 14 };
  const arb = fc.record({
    seed: fc.integer({ min: 0, max: 0x7fffffff }),
    steps: fc.integer({ min: range.min, max: range.max }),
  });
  let executed = 0;
  let counted = 0;
  let failedOnce = false;
  const result = fc.check(
    fc.property(arb, ({ seed, steps }) => {
      const { res, failures } = runOnce(def, seed, steps, { ...opts, config: cfg });
      if (!failedOnce) {
        executed++;
        if (hasConcurrentPair(res.ops)) counted++;
      }
      const f = failures[0];
      if (f !== undefined) {
        failedOnce = true;
        throw new Error(f.reason);
      }
    }),
    {
      numRuns: p.orderings,
      seed: p.seed,
      endOnFailure: false,
      ...(p.deadlineMs !== undefined ? { interruptAfterTimeLimit: p.deadlineMs, markInterruptAsFailure: false } : {}),
    },
  );
  const v = vac(counted, executed);
  if (!result.failed) {
    return { pass: true, runs: executed, seed: p.seed, truncated: result.interrupted, vacuity: v, ...warn(v) };
  }
  const shrunk = result.counterexample?.[0] as { seed: number; steps: number } | undefined;
  const ce = shrunk ? counterexampleOf(def, opts, p.seed, shrunk.seed, shrunk.steps, p.replicas) : undefined;
  return {
    pass: false,
    runs: executed,
    seed: p.seed,
    truncated: result.interrupted,
    vacuity: v,
    ...(ce ? { counterexample: ce } : {}),
    ...warn(v),
  };
}
