// Vacuity guard (R12): tag each simulated script with the conflict classes it contains,
// then report the share of runs per class. A class under MIN_SHARE fails; a class whose ops
// are not registered is `n/a` and excluded. Not a reducer file; no clock or randomness here.
//
// Generator choice (A/B pilot finding): scripts used to be drawn uniformly over every registered op, so each
// unrelated op registered later lowered every class's share (claim-release-claim fell to ~46%). Class weighting
// is done by ops: a run draws only from the class ops (the union of `requires` of the applicable classes, plus
// the causal-lww ops when an lww class applies). An op that is in no class gets weight 0, so adding one cannot
// move any share. The bar stays at MIN_SHARE and no class is dropped. Each op still draws its payload from its
// own generator and `simulate()` still delivers in random causal orders. The classes are measured with `classify`
// on the generated histories. The choice is a pure function of the registered defs, so it is deterministic
// from the recorded seed.
import { canonical, concurrent, covers } from '../../skeleton/src/core/causal.ts';
import { simulate } from '../../skeleton/src/core/simulate.ts';
import type { Op, OpDef } from '../../skeleton/src/core/types.ts';
import { CONFLICT_CLASSES, applicableClasses } from './arbitraries/index.ts';
import { config as defaultConfig, type PropsConfig } from './config.ts';
import type { RunOptions } from './run.ts';

export const MIN_SHARE = 0.5;

/** Ops that write item content (requirements glossary: Edit), minus restore which has its own classes. */
/** Op names assumed `causal-lww` when the caller does not pass the registered defs. */
const DEFAULT_LWW: ReadonlySet<string> = new Set(['item.rename', 'item.tick']);

/** Defs a vacuity run may draw from: the ops of the applicable classes. Falls back to all defs if none match. */
export function classOps(defs: readonly OpDef[]): OpDef[] {
  const lwwNames = defs.filter((d) => d.merge === 'causal-lww').map((d) => d.name);
  const { applicable } = applicableClasses(
    defs.map((d) => d.name),
    lwwNames,
  );
  const names = new Set<string>();
  for (const c of CONFLICT_CLASSES) {
    if (!applicable.includes(c.name)) continue;
    for (const r of c.requires) names.add(r);
    if (c.anyLww) for (const n of lwwNames) names.add(n);
  }
  const pool = defs.filter((d) => names.has(d.name));
  return pool.length > 0 ? pool : [...defs];
}

const EDITS = new Set(['item.tick', 'item.rename', 'item.claim']);

function conc(a: Op, b: Op): boolean {
  return a.id !== b.id && a.target === b.target && concurrent(a, b);
}

/** "Same gap": equal `left`/`right` bounds when the payload carries them, else an identical key. */
function gapOf(o: Op): string | undefined {
  const p = o.payload as { key?: unknown; left?: unknown; right?: unknown } | null;
  if (p === null || typeof p !== 'object') return undefined;
  if ('left' in p || 'right' in p) return canonical({ left: p.left ?? null, right: p.right ?? null });
  return typeof p.key === 'string' ? p.key : undefined;
}

const who = (o: Op): unknown => (o.payload as { who?: unknown } | null)?.who;

/** Scan a script (the ops of one run) and return the R12.3 classes it contains. */
export function classify(script: readonly Op[], lwwOps: ReadonlySet<string> = DEFAULT_LWW): Set<string> {
  const found = new Set<string>();
  const by = (name: string): Op[] => script.filter((o) => o.op === name);
  const dels = by('item.delete');
  const restores = by('item.restore');
  const claims = by('item.claim');
  const releases = by('item.release');
  const moves = by('item.move');
  const lwws = script.filter((o) => lwwOps.has(o.op));
  const edits = script.filter((o) => EDITS.has(o.op));

  if (dels.some((d) => edits.some((e) => conc(d, e)))) found.add('delete-edit');
  if (dels.some((d) => restores.some((r) => conc(d, r)))) found.add('restore-delete');
  // Keep (a restore that covers one delete) concurrent with another delete of the same item.
  if (restores.some((r) => dels.some((d1) => d1.target === r.target && covers(r, d1) && dels.some((d2) => d2 !== d1 && conc(r, d2))))) {
    found.add('keep-delete');
  }
  // Includes a duplicate claimant: the same `who` on two concurrent claims counts.
  if (claims.some((a) => claims.some((b) => a.id < b.id && conc(a, b)))) found.add('claim-claim');
  if (claims.some((c) => dels.some((d) => conc(c, d)))) found.add('claim-delete');
  if (moves.some((a) => moves.some((b) => a.id < b.id && conc(a, b)))) found.add('move-move');
  if (
    moves.some((a) =>
      moves.some((b) => {
        const g = gapOf(a);
        return a.id < b.id && a.stamp.r !== b.stamp.r && concurrent(a, b) && g !== undefined && g === gapOf(b);
      }),
    )
  ) {
    found.add('move-same-gap');
  }
  if (moves.some((m) => dels.some((d) => conc(m, d)))) found.add('move-delete');
  // claim -> release -> claim again: same item, same claimant, each covering the previous.
  if (
    claims.some((c1) =>
      releases.some(
        (r) =>
          r.target === c1.target &&
          who(r) === who(c1) &&
          covers(r, c1) &&
          claims.some((c2) => c2.target === c1.target && who(c2) === who(c1) && covers(c2, r)),
      ),
    )
  ) {
    found.add('claim-release-claim');
  }
  // Concurrent writes to one field (same op name) of one item, by any causal-lww op.
  for (const a of lwws) {
    for (const b of lwws) {
      if (a.id >= b.id || a.op !== b.op || !conc(a, b)) continue;
      found.add(canonical(a.payload) === canonical(b.payload) ? 'lww-equal' : 'lww-different');
    }
  }
  return found;
}

export interface VacuityReport {
  runs: number;
  /** Share of runs containing each applicable class (0..1). */
  share: Record<string, number>;
  applicable: string[];
  /** Classes whose ops are not registered: reported, never counted as passing. */
  na: string[];
}

/** Share per class over a list of per-run class sets. Unregistered classes are `n/a`. */
export function vacuityReport(
  registered: Iterable<string>,
  runs: readonly ReadonlySet<string>[],
  lwwOps?: Iterable<string>,
): VacuityReport {
  const { applicable, na } = applicableClasses(registered, lwwOps);
  const share: Record<string, number> = {};
  for (const c of applicable) share[c] = runs.length === 0 ? 0 : runs.filter((r) => r.has(c)).length / runs.length;
  return { runs: runs.length, share, applicable, na };
}

/** Applicable classes whose share is under `min`, one message each. Empty = pass. `n/a` is never a failure. */
export function vacuityFailures(report: VacuityReport, min: number = MIN_SHARE): string[] {
  return report.applicable
    .filter((c) => (report.share[c] ?? 0) < min)
    .map(
      (c) =>
        `conflict class "${c}" occurred in ${((report.share[c] ?? 0) * 100).toFixed(1)}% of ${report.runs} runs, under ${min * 100}%; fix the generator, not the threshold`,
    );
}

/** Human-readable summary that names the `n/a` classes. */
export function formatVacuity(report: VacuityReport): string {
  const lines = report.applicable.map((c) => `  ${c}: ${((report.share[c] ?? 0) * 100).toFixed(1)}%`);
  const na = report.na.map((c) => `  ${c}: n/a (op not registered)`);
  return [`vacuity over ${report.runs} runs:`, ...lines, ...na].join('\n');
}

/** Yield to the event loop every this many runs in the async variant. */
const YIELD_EVERY = 50;

/** Hot targets of the mixed scripts: few, and `t0` three times as likely, so ops of different kinds collide on one item. */
export const HOT_TARGETS: readonly string[] = ['t0', 't0', 't0', 't1'];
/** Mixed scripts are long: a class such as claim-release-claim needs three causally chained ops on one replica. */
export const MIXED_STEPS = { min: 40, max: 80 } as const;
/** Every UNIFORM_EVERY-th run draws uniformly from all registered ops, so ops outside the classes are still checked. */
export const UNIFORM_EVERY = 5;

/** Run `i` draws from every registered op when true, else from the class ops (plus the create ops). */
export const isUniformRun = (i: number): boolean => i % UNIFORM_EVERY === UNIFORM_EVERY - 1;

/**
 * Defs run `i` draws from. Class-weighted runs use the class ops plus the `create` ops (without a create,
 * app-level folds ignore the item); an op in no class has weight 0 there. Pure function of the defs.
 */
export function mixedPool(defs: readonly OpDef[], i: number): OpDef[] {
  if (isUniformRun(i)) return [...defs];
  const pool = new Set(classOps(defs));
  for (const d of defs) if (d.intent.kind === 'create') pool.add(d);
  const picked = defs.filter((d) => pool.has(d));
  // A chain class (`boost`) draws its ops that many extra times; the draw is uniform over this list.
  const extra = CONFLICT_CLASSES.flatMap((c) => (c.boost ? picked.filter((d) => c.requires.includes(d.name)).flatMap((d) => Array<OpDef>(c.boost!).fill(d)) : []));
  return [...picked, ...extra];
}

/** Per-op payload generators (from each op's own `*.props.ts`), every op placed on one of the hot targets. */
export function mixedGen(optsByOp: ReadonlyMap<string, RunOptions>): NonNullable<RunOptions['gen']> {
  return (def, rand) => {
    const g = optsByOp.get(def.name)?.gen ?? (() => ({ target: HOT_TARGETS[0]!, payload: {} }));
    return { ...g(def, rand), target: rand.pick(HOT_TARGETS) };
  };
}

/** Script length of run `i`. */
export const mixedSteps = (i: number): number => MIXED_STEPS.min + (i % (MIXED_STEPS.max - MIXED_STEPS.min + 1));

/** Simulation seed of run `i`. */
export const mixedSeed = (cfg: PropsConfig, i: number): number => (cfg.seed + i) >>> 0;

/** The one simulation of mixed run `i`; the property sweep and the vacuity guard both call it. */
export function simulateMixed(
  defs: readonly OpDef[],
  gen: NonNullable<RunOptions['gen']>,
  cfg: PropsConfig,
  i: number,
  steps: number = mixedSteps(i),
  init: () => unknown = () => ({}),
) {
  // `apply` is not read by mixed runs (the app fold is), so it is stripped to keep the simulation cheap.
  const pool = mixedPool(defs, i).map((d) => ({ ...d, apply: undefined }) as OpDef);
  return simulate({ defs: pool, replicas: cfg.replicas, seed: mixedSeed(cfg, i), steps, init, gen });
}

export function lwwNamesOf(defs: readonly OpDef[]): Set<string> {
  return new Set(defs.filter((d) => d.merge === 'causal-lww').map((d) => d.name));
}

/** Report over the per-run class sets of the mixed runs. */
export function mixedReport(defs: readonly OpDef[], sets: readonly ReadonlySet<string>[]): VacuityReport {
  return vacuityReport(
    defs.map((d) => d.name),
    sets,
    lwwNamesOf(defs),
  );
}

function* vacuityRuns(defs: readonly OpDef[], opts: RunOptions, runs?: number): Generator<number, VacuityReport, void> {
  const cfg = opts.config ?? defaultConfig;
  const n = runs ?? cfg.orderings;
  const gen = opts.gen ?? mixedGen(new Map());
  const lwwOps = lwwNamesOf(defs);
  const sets: Set<string>[] = [];
  for (let i = 0; i < n; i++) {
    sets.push(classify(simulateMixed(defs, gen, cfg, i, mixedSteps(i), opts.init).ops, lwwOps));
    yield i + 1;
  }
  return mixedReport(defs, sets);
}

/** Measure class shares over the mixed runs (same seeds, generator and step range as the checked runs). */
export function measureVacuity(defs: readonly OpDef[], opts: RunOptions = {}, runs?: number): VacuityReport {
  const it = vacuityRuns(defs, opts, runs);
  for (;;) {
    const r = it.next();
    if (r.done) return r.value;
  }
}

/** Same loop, seeds and steps as `measureVacuity`, but yields to the event loop every 50 runs. */
export async function measureVacuityAsync(
  defs: readonly OpDef[],
  opts: RunOptions = {},
  runs?: number,
): Promise<VacuityReport> {
  const it = vacuityRuns(defs, opts, runs);
  for (;;) {
    const r = it.next();
    if (r.done) return r.value;
    if (r.value % YIELD_EVERY === 0) await new Promise<void>((res) => setImmediate(res));
  }
}
