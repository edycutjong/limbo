// Shared helpers for the kit-owned intent properties.
// Oracles here are written from the intent's definition and the raw `deps`/`stamp` fields only.
// They do not import `merges.ts` or `causal.ts`, so one bug cannot hide itself in both places.
// Not a reducer file. Convergence is measured, property-tested.
import type { SimResult } from '../../../skeleton/src/core/simulate.ts';
import type { Op } from '../../../skeleton/src/core/types.ts';
import type { RunCheck } from '../run.ts';

/** Replica state as the app defines it (parsed from the canonical JSON). The spec accessors read it. */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export type State = any;

/** x observed y: x's causal context includes y. */
export const sees = (x: Op, y: Op): boolean => (x.deps[y.stamp.r] ?? 0) >= y.stamp.n;

/** Stamp order: l, then r by code unit, then n. */
export function stampLess(a: Op, b: Op): boolean {
  if (a.stamp.l !== b.stamp.l) return a.stamp.l < b.stamp.l;
  if (a.stamp.r !== b.stamp.r) return a.stamp.r < b.stamp.r;
  return a.stamp.n < b.stamp.n;
}

export const byStamp = (a: Op, b: Op): number => (stampLess(a, b) ? -1 : stampLess(b, a) ? 1 : 0);

export const show = (v: unknown): string => (v === undefined ? 'undefined' : JSON.stringify(v));

/** `undefined` and `null` both mean "absent". */
export const same = (a: unknown, b: unknown): boolean => show(a ?? null) === show(b ?? null);

export interface TargetCtx {
  replica: string;
  state: State;
  target: string;
  /** Ops of this target that the intent cares about, in creation order. */
  ops: Op[];
}

/** Run `fn` for every replica and every target that has a relevant op. Returns the first failure. */
export function eachTarget(res: SimResult, relevant: (o: Op) => boolean, fn: (c: TargetCtx) => true | string): true | string {
  const groups = new Map<string, Op[]>();
  for (const o of res.ops) if (relevant(o)) (groups.get(o.target) ?? groups.set(o.target, []).get(o.target)!).push(o);
  for (const [replica, json] of Object.entries(res.states)) {
    const state: State = JSON.parse(json);
    for (const [target, ops] of groups) {
      const r = fn({ replica, state, target, ops });
      if (r !== true) return `replica ${replica}, target ${target}: ${r}`;
    }
  }
  return true;
}

export type Check = RunCheck['check'];
export const intentCheck = (name: string, check: Check): RunCheck => ({ name, check });
