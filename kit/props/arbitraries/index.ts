// Conflict-template generators (R12.4): weight scripts toward the conflict classes of R12.3.
// Not a reducer file. All randomness comes from the simulator's seeded `Rand`, never Math.random.
// A script that starts from a template uses one hot target and a tiny value domain, so concurrent ops
// on one item collide (same target, equal values, a duplicate claimant). The rest is drawn wide.
import type { Rand } from '../../../skeleton/src/core/simulate.ts';
import type { OpDef } from '../../../skeleton/src/core/types.ts';

/** Probability that a script starts from a conflict template (design: 0.7). */
export const TEMPLATE_WEIGHT = 0.7;

export interface ConflictClass {
  name: string;
  /** Op names that must all be registered, else the class is `n/a` (R12.5). */
  requires: readonly string[];
}

/** The eleven classes of R12.3, with the BASECAMP ops each needs. */
export const CONFLICT_CLASSES: readonly ConflictClass[] = [
  { name: 'delete-edit', requires: ['item.delete', 'item.tick'] },
  { name: 'restore-delete', requires: ['item.restore', 'item.delete'] },
  { name: 'keep-delete', requires: ['item.restore', 'item.delete', 'item.tick'] },
  { name: 'claim-claim', requires: ['item.claim'] },
  { name: 'claim-delete', requires: ['item.claim', 'item.delete'] },
  { name: 'move-move', requires: ['item.move'] },
  { name: 'move-same-gap', requires: ['item.move'] },
  { name: 'move-delete', requires: ['item.move', 'item.delete'] },
  { name: 'claim-release-claim', requires: ['item.claim', 'item.release'] },
  { name: 'lww-equal', requires: ['item.rename'] },
  { name: 'lww-different', requires: ['item.rename'] },
];

/** Classes whose ops are all registered; the others are `n/a`. */
export function applicableClasses(registered: Iterable<string>): { applicable: string[]; na: string[] } {
  const have = new Set(registered);
  const applicable: string[] = [];
  const na: string[] = [];
  for (const c of CONFLICT_CLASSES) (c.requires.every((r) => have.has(r)) ? applicable : na).push(c.name);
  return { applicable, na };
}

/** What a payload builder sees. */
export interface GenCtx {
  /** True when this script started from a conflict template. */
  hot: boolean;
  target: string;
  /** Pick from a small pool in a hot script (so values and claimants collide), a wide pool otherwise. */
  pick<T>(small: readonly T[], wide?: readonly T[]): T;
}

export interface ConflictGenSpec {
  /** Payload builder per op name. Ops with no builder get `{}`. */
  payloads?: Readonly<Record<string, (rand: Rand, ctx: GenCtx) => unknown>>;
  /** Wide target pool. Default `t0`..`t5`. */
  targets?: readonly string[];
  /** Template weight. Default 0.7. */
  weight?: number;
}

const TARGETS = ['t0', 't1', 't2', 't3', 't4', 't5'];

/**
 * Build a `gen` for `simulate` / `RunOptions.gen`. The simulator calls it once per op and passes no script
 * state, so the template choice is per op: with probability `weight` an op is "hot" (one of the first two
 * targets, small value and claimant pools). Hot ops from different replicas collide on one item, which
 * yields the R12.3 classes; the rest are drawn wide.
 */
export function conflictGen(spec: ConflictGenSpec = {}): (def: OpDef, rand: Rand) => { target: string; payload: unknown } {
  const pool = spec.targets ?? TARGETS;
  const weight = spec.weight ?? TEMPLATE_WEIGHT;
  return (def, rand) => {
    const hot = rand.chance(weight);
    const target = hot ? pool[rand.int(Math.min(2, pool.length))]! : rand.pick(pool);
    const ctx: GenCtx = {
      hot,
      target,
      pick: (small, wide) => rand.pick(hot || wide === undefined ? small : wide),
    };
    const build = spec.payloads?.[def.name];
    return { target, payload: build ? build(rand, ctx) : {} };
  };
}

/** Payload builders for BASECAMP-shaped ops, keyed by op name. Apps may extend or replace them. */
export const basecampPayloads: Readonly<Record<string, (rand: Rand, ctx: GenCtx) => unknown>> = {
  'item.tick': (_r, c) => ({ ticked: c.pick([true, false]) }),
  'item.rename': (_r, c) => ({ name: c.pick(['Stove', 'Tent'], ['Stove', 'Tent', 'Gas', 'Rope', 'Lantern']) }),
  'item.claim': (_r, c) => ({ who: c.pick(['ann', 'bo'], ['ann', 'bo', 'cy', 'di']) }),
  'item.release': (_r, c) => ({ who: c.pick(['ann', 'bo'], ['ann', 'bo', 'cy', 'di']) }),
};
