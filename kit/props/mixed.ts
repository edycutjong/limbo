// Mixed-script properties: scripts drawn from every registered op of one app, on a few hot targets, delivered by
// `simulate()` in random causal orders with duplicates. The properties run on the app's own fold (`materialize`).
// The vacuity guard classifies these same runs. Not a reducer file; no clock or randomness here.
// Convergence is measured, property-tested.
import { canonical, compareStamp } from '../../skeleton/src/core/causal.ts';
import type { SimResult, Step } from '../../skeleton/src/core/simulate.ts';
import type { Op, OpDef } from '../../skeleton/src/core/types.ts';
import type { PropsConfig } from './config.ts';
import { claimIntent, lifeIntent, moveIntent, type ClaimSpec, type LifeSpec } from './intent/index.ts';
import { formatFailure, type Failure, type RunCheck, type RunOptions } from './run.ts';
import { classify, lwwNamesOf, mixedSteps, simulateMixed } from './vacuity.ts';

/** What an app supplies in `apps/<app>/src/ops/app.props.ts` (`export const app: AppProps`). */
export interface AppProps {
  /** The app's real fold: any order, duplicates ignored. */
  materialize(ops: readonly Op[]): unknown;
  /** Lifecycle role of an op (`create` | `restore` | `delete` | `edit`); `read` is the item's life in a folded state. */
  life?: LifeSpec;
  /** Claim roles. `units` is the capacity of a target given its create op's payload. */
  claim?: {
    claim: ClaimSpec['claim'];
    release: ClaimSpec['release'];
    units(createPayload: unknown): number;
    winners: ClaimSpec['winners'];
    losers: ClaimSpec['losers'];
  };
  /** Display order in a folded state. */
  move?: { read(state: unknown): readonly string[] };
}

export const MIXED_PROPERTIES = [
  'app convergence',
  'app replay equivalence',
  'idempotence',
  'intent:life',
  'intent:claim',
  'intent:move',
] as const;

const dedupe = (ids: readonly string[]): string[] => [...new Set(ids)];

function logOf(res: SimResult, replica: string): Op[] {
  const byId = new Map(res.ops.map((o) => [o.id, o] as const));
  return res.orders[replica]!.map((id) => byId.get(id)!);
}

/** The per-replica trace with the app's folded state after each delivery (built only to print a failure). */
function appTrace(res: SimResult, app: AppProps): Step[] {
  const out: Step[] = [];
  for (const r of Object.keys(res.orders)) {
    const log = logOf(res, r);
    const seen = new Set<string>();
    log.forEach((o, k) => {
      out.push({
        replica: r,
        opId: o.id,
        stateAfter: canonical(app.materialize(log.slice(0, k + 1))),
        duplicate: seen.has(o.id),
      });
      seen.add(o.id);
    });
  }
  return out;
}

function tailOf(property: string, reason: string, res: SimResult, app: AppProps, cfg: PropsConfig, states: Record<string, string>): string {
  return formatFailure(property, reason, { ...res, states, trace: appTrace(res, app) }, cfg.seed);
}

type Checker = (res: SimResult, states: Record<string, string>) => true | string;

/** Intent checks over the folded states. Items without a create op are not folded by the app, so they are filtered out. */
function intentCheckers(app: AppProps): [string, Checker][] {
  const out: [string, Checker][] = [];
  const kind = app.life?.kind;
  const created = (ops: readonly Op[]): Set<string> => new Set(ops.filter((o) => kind?.(o) === 'create').map((o) => o.target));
  const scoped = (res: SimResult, states: Record<string, string>): SimResult => {
    const keep = created(res.ops);
    return { ...res, states, ops: res.ops.filter((o) => keep.has(o.target)) };
  };
  const ctx = { def: undefined as unknown as OpDef, init: () => ({}) };
  const run = (c: RunCheck, res: SimResult, states: Record<string, string>): true | string => c.check(scoped(res, states), ctx);
  // A fold exposes the items as `.items`; `read*` hooks receive the whole state.
  if (app.life) out.push(['intent:life', (res, st) => run(lifeIntent(app.life!), res, st)]);
  if (app.claim) {
    const c = app.claim;
    out.push([
      'intent:claim',
      (res, st) => {
        const units = new Map<string, number>();
        const adds = res.ops.filter((o) => kind?.(o) === 'create').sort((a, b) => compareStamp(a.stamp, b.stamp));
        for (const o of adds) if (!units.has(o.target)) units.set(o.target, c.units(o.payload));
        const spec: ClaimSpec = {
          claim: c.claim,
          release: c.release,
          units: (t) => units.get(t) ?? 0,
          deleted: (s, t) => app.life?.read(s, t) === 'deleted',
          winners: c.winners,
          losers: c.losers,
        };
        return run(claimIntent(spec), res, st);
      },
    ]);
  }
  if (app.move) {
    const m = app.move;
    out.push([
      'intent:move',
      (res, st) => {
        // Expected: created items whose life is not `deleted` (read from the first replica; the other replicas are compared against it).
        const first = JSON.parse(Object.values(st)[0] ?? '{}') as unknown;
        const expected = (ops: readonly Op[]): string[] => {
          const ids = ops.filter((o) => kind?.(o) === 'create').map((o) => o.target);
          return ids.filter((t) => app.life?.read(first, t) !== 'deleted');
        };
        return run(moveIntent({ expected, read: (s) => m.read(s) }), res, st);
      },
    ]);
  }
  return out;
}

/** Every mixed property over one simulated run. Returns the failures (empty = pass). */
export function checkMixedRun(res: SimResult, app: AppProps, cfg: PropsConfig): Failure[] {
  const fail: Failure[] = [];
  const add = (property: string, reason: string, states: Record<string, string>): void => {
    fail.push({ property, reason: tailOf(property, reason, res, app, cfg, states) });
  };
  const replicas = Object.keys(res.orders);
  const states: Record<string, string> = {};
  for (const r of replicas) states[r] = canonical(app.materialize(logOf(res, r)));

  const [r0, s0] = [replicas[0] ?? '', states[replicas[0] ?? ''] ?? ''];
  for (const r of replicas) {
    if (states[r] !== s0) {
      add('app convergence', `replicas ${r0} and ${r} ended in different states:\n  ${r0}: ${s0}\n  ${r}: ${states[r]}`, states);
      break;
    }
  }

  const sorted = [...res.ops].sort((a, b) => compareStamp(a.stamp, b.stamp));
  const replay = canonical(app.materialize(sorted));
  for (const r of replicas) {
    if (states[r] !== replay) {
      add('app replay equivalence', `replica ${r} differs from the fold of the stamp-sorted log:\n  ${r}: ${states[r]}\n  replay: ${replay}`, states);
      break;
    }
  }

  const byId = new Map(res.ops.map((o) => [o.id, o] as const));
  for (const r of replicas) {
    const once = canonical(app.materialize(dedupe(res.orders[r]!).map((id) => byId.get(id)!)));
    const twice = canonical(app.materialize([...logOf(res, r), ...logOf(res, r)]));
    if (states[r] !== once || states[r] !== twice) {
      add('idempotence', `replica ${r}: duplicate deliveries change the state:\n  delivered: ${states[r]}\n  without duplicates: ${once}\n  delivered twice: ${twice}`, states);
      break;
    }
  }

  for (const [name, check] of intentCheckers(app)) {
    const v = check(res, states);
    if (v !== true) add(name, v, states);
  }
  return fail;
}

export interface MixedRun {
  index: number;
  steps: number;
  classes: Set<string>;
  failures: Failure[];
}

/** Run `i`: simulate, check, classify. */
export function mixedRun(
  defs: readonly OpDef[],
  app: AppProps | undefined,
  gen: NonNullable<RunOptions['gen']>,
  cfg: PropsConfig,
  i: number,
  steps: number = mixedSteps(i),
): MixedRun {
  const res = simulateMixed(defs, gen, cfg, i, steps);
  return {
    index: i,
    steps,
    classes: classify(res.ops, lwwNamesOf(defs)),
    failures: app ? checkMixedRun(res, app, cfg) : [],
  };
}

/** Shrink a failing run by truncating its script: the smallest step count (same seed) that still fails `property`. */
export function shrinkMixed(
  defs: readonly OpDef[],
  app: AppProps,
  gen: NonNullable<RunOptions['gen']>,
  cfg: PropsConfig,
  i: number,
  steps: number,
  property: string,
): Failure {
  let best: Failure | undefined;
  for (let s = 1; s <= steps; s++) {
    const f = checkMixedRun(simulateMixed(defs, gen, cfg, i, s), app, cfg).find((x) => x.property === property);
    if (f) {
      best = f;
      break;
    }
  }
  return best ?? checkMixedRun(simulateMixed(defs, gen, cfg, i, steps), app, cfg).find((x) => x.property === property)!;
}
