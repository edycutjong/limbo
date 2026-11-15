// Small helpers shared by the fixtures. Kit-owned, not an op file.
import type { Op } from '../../../skeleton/src/core/types.ts';
import { claimIntent, lifeIntent, splitIntent, type LifeKind } from '../intent/index.ts';
import type { RunOptions } from '../run.ts';
import type { GoldenMutant } from './types.ts';

type Deps = Record<string, number>;
const seen = (deps: Deps, r: string, n: number): boolean => (deps[r] ?? 0) >= n;

// ---- life (delete versus edit) ----
type LifeRec = { k: LifeKind; r: string; n: number; deps: Deps };
export type LifeState = { ops: Record<string, LifeRec> };
export type LifePayload = { k: LifeKind };

export const lifeRead = (s: LifeState, deleteWins: boolean): 'alive' | 'deleted' | 'twin' => {
  const all = Object.values(s.ops ?? {});
  const restores = all.filter((o) => o.k === 'restore');
  const active = all.filter((o) => o.k === 'delete' && !restores.some((r) => seen(r.deps, o.r, o.n)));
  if (active.length === 0) return 'alive';
  if (deleteWins) return 'deleted';
  const edits = all.filter((o) => o.k !== 'delete');
  const wins = edits.some((e) => !active.some((a) => seen(a.deps, e.r, e.n)) && !active.every((a) => seen(e.deps, a.r, a.n)));
  return wins ? 'twin' : 'deleted';
};

export const lifeApply =
  (ignore: LifeKind | undefined) =>
  (s: LifeState, op: Op<LifePayload>): LifeState =>
    op.payload.k === ignore ? s : { ops: { ...(s.ops ?? {}), [op.id]: { k: op.payload.k, r: op.stamp.r, n: op.stamp.n, deps: op.deps } } };

export const lifeOpts = (name: string, deleteWins: boolean): RunOptions => ({
  init: () => ({ ops: {} }),
  gen: (_d, r) => ({ target: 't', payload: { k: r.pick<LifeKind>(['create', 'edit', 'delete', 'delete', 'restore']) } }),
  checks: [
    lifeIntent({
      kind: (o) => (o.op === name ? (o.payload as LifePayload).k : undefined),
      // The oracle is given the true rule; the fixture's own read is what is under test.
      read: (s: LifeState) => lifeRead(s, deleteWins),
    }),
  ],
});

// ---- claim ----
type ClaimRec = { who: string; l: number; r: string; n: number };
type RelRec = { who: string; deps: Deps };
export type ClaimState = { claims: Record<string, ClaimRec>; rels: Record<string, RelRec> };
export type ClaimPayload = { who: string; rel: boolean };

const cmp = (a: ClaimRec, b: ClaimRec): number => (a.l !== b.l ? a.l - b.l : a.r !== b.r ? (a.r < b.r ? -1 : 1) : a.n - b.n);

export const claimApply = (s: ClaimState, op: Op<ClaimPayload>): ClaimState =>
  op.payload.rel
    ? { claims: s.claims, rels: { ...s.rels, [op.id]: { who: op.payload.who, deps: op.deps } } }
    : { rels: s.rels, claims: { ...s.claims, [op.id]: { who: op.payload.who, l: op.stamp.l, r: op.stamp.r, n: op.stamp.n } } };

/** Eligible claimants in ascending (or descending) stamp order. */
export function eligible(s: ClaimState, descending: boolean): string[] {
  const rels = Object.values(s.rels);
  const live = Object.values(s.claims)
    .filter((c) => !rels.some((r) => r.who === c.who && seen(r.deps, c.r, c.n)))
    .sort(cmp);
  const first: ClaimRec[] = [];
  const who = new Set<string>();
  for (const c of live) if (!who.has(c.who)) (who.add(c.who), first.push(c));
  return (descending ? first.reverse() : first).map((c) => c.who);
}

export const claimOpts = (name: string, winners: (s: ClaimState) => string[], losers: (s: ClaimState) => string[]): RunOptions => ({
  init: () => ({ claims: {}, rels: {} }),
  gen: (_d, r) => ({ target: 't', payload: { who: r.pick(['ann', 'bo', 'cy']), rel: r.chance(0.2) } }),
  checks: [
    claimIntent({
      claim: (o) => (o.op === name && !(o.payload as ClaimPayload).rel ? (o.payload as ClaimPayload).who : undefined),
      release: (o) => (o.op === name && (o.payload as ClaimPayload).rel ? (o.payload as ClaimPayload).who : undefined),
      units: () => 1,
      winners: (s: ClaimState) => winners(s),
      losers: (s: ClaimState) => losers(s),
    }),
  ],
});

// ---- split (integer cents) ----
export type SplitFn = (amount: number, members: readonly string[]) => Record<string, number>;

/** Materialize expense.add ops of a golden history with a given split function. */
export const splitGolden = (file: string, split: SplitFn): GoldenMutant => ({
  file,
  run(ops) {
    const expenses: Record<string, { shares: Record<string, number>; unallocated?: number }> = {};
    for (const o of ops) {
      if (o.op !== 'expense.add') continue;
      const p = o.payload as { amountCents: number; members: string[] };
      expenses[o.target] = p.members.length === 0 ? { shares: {}, unallocated: p.amountCents } : { shares: split(p.amountCents, p.members) };
    }
    return { expenses };
  },
});

export type SplitState = { amount: number; members: string[]; shares: Record<string, number> };

/** Options for a fixture whose op adds one member to a 1000-cent split, using `split` for the shares. */
export const splitOpts = (split: SplitFn): RunOptions => ({
  init: () => ({ amount: 1000, members: [], shares: {} }),
  gen: (_d, r) => ({ target: 't', payload: { m: r.pick(['p', 'q', 'r']) } }),
  checks: [splitIntent({ relevant: () => true, read: (s: SplitState) => s })],
});
