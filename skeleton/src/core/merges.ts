import { canonical, compareStamp, covers } from './causal.ts';
import type { Op } from './types.ts';

export interface LwwResult<P = unknown> {
  /** Payload of the frontier write with the maximum stamp. `undefined` when there are no writes. */
  value: P | undefined;
  /** The winning write. */
  winner: Op<P> | undefined;
  /** Frontier writes whose value differs from the winner's, one per distinct value (the highest stamp of each). */
  twins: Op<P>[];
}

/**
 * causal-lww: a pure join over the set of writes to one field.
 * Frontier = writes no other write covers. The max stamp on the frontier wins.
 * Different frontier values surface as twins; equal values collapse.
 * Reads no arrival order, so it gives one result for any order and for duplicates.
 */
export function causalLww<P = unknown>(writes: readonly Op<P>[]): LwwResult<P> {
  const byId = new Map<string, Op<P>>();
  for (const w of writes) byId.set(w.id, w);
  const all = [...byId.values()];
  const frontier = all.filter((w) => !all.some((o) => o !== w && covers(o, w)));
  frontier.sort((a, b) => compareStamp(b.stamp, a.stamp)); // descending
  const winner = frontier[0];
  if (winner === undefined) return { value: undefined, winner: undefined, twins: [] };
  const winnerKey = canonical(winner.payload);
  const seen = new Set<string>([winnerKey]);
  const twins: Op<P>[] = [];
  for (const w of frontier) {
    const k = canonical(w.payload);
    if (seen.has(k)) continue;
    seen.add(k);
    twins.push(w);
  }
  return { value: winner.payload, winner, twins };
}

export type LifeKind = 'create' | 'restore' | 'delete' | 'edit';
export interface LifeOp {
  kind: LifeKind;
  op: Op;
}
export type Life = 'alive' | 'deleted' | 'twin';
export interface LifeResult {
  life: Life;
  /** Deletes no restore covers. */
  active: Op[];
  /** Edits that resurrect against the active deletes. */
  resurrecting: Op[];
}

/**
 * resurrect: a pure join over the lifecycle ops of one item.
 * Active deletes A = deletes no restore covers. An edit (create, restore, content write)
 * resurrects iff no active delete covers it and it does not cover every active delete.
 * A empty: alive. A non-empty with a resurrecting edit: twin. Otherwise deleted.
 * Reads no arrival order; duplicates collapse by op id.
 */
export function resurrect(entries: readonly LifeOp[]): LifeResult {
  const byId = new Map<string, LifeOp>();
  for (const e of entries) byId.set(e.op.id, e);
  const all = [...byId.values()].sort((a, b) => compareStamp(a.op.stamp, b.op.stamp));
  const restores = all.filter((e) => e.kind === 'restore').map((e) => e.op);
  const active = all
    .filter((e) => e.kind === 'delete' && !restores.some((r) => covers(r, e.op)))
    .map((e) => e.op);
  if (active.length === 0) return { life: 'alive', active, resurrecting: [] };
  const resurrecting = all
    .filter((e) => e.kind !== 'delete')
    .map((e) => e.op)
    .filter((x) => active.every((a) => !covers(a, x)) && !active.every((a) => covers(x, a)));
  return { life: resurrecting.length > 0 ? 'twin' : 'deleted', active, resurrecting };
}

export interface ClaimPayload {
  who: string;
}
export interface ClaimResult {
  /** The first `min(units, eligible)` eligible claims by ascending stamp. */
  winners: Op<ClaimPayload>[];
  /** Eligible claims that did not win; surfaced as loser twins. */
  losers: Op<ClaimPayload>[];
}

/**
 * claim-one: a pure join over the claims and releases of one item.
 * A claim is released iff a release with the same `who` covers it.
 * Each `who` keeps its lowest-stamp unreleased claim. A deleted item has no eligible claims.
 * Eligible claims sort ascending by stamp; the first `min(units, n)` win, the rest lose.
 * Because a claim that covers another has a higher Lamport counter, it never beats the one it covers.
 * The pick is deterministic, not "who was first"; reads no arrival order; duplicates collapse by op id.
 */
export function claimOne(
  claims: readonly Op<ClaimPayload>[],
  releases: readonly Op<ClaimPayload>[],
  units: number,
  life: Life,
): ClaimResult {
  if (life === 'deleted') return { winners: [], losers: [] };
  const byId = new Map<string, Op<ClaimPayload>>();
  for (const c of claims) byId.set(c.id, c);
  const rels = [...new Map(releases.map((r) => [r.id, r] as const)).values()];
  const live = [...byId.values()]
    .filter((c) => !rels.some((r) => r.payload.who === c.payload.who && covers(r, c)))
    .sort((a, b) => compareStamp(a.stamp, b.stamp));
  const seenWho = new Set<string>();
  const eligible: Op<ClaimPayload>[] = [];
  for (const c of live) {
    if (seenWho.has(c.payload.who)) continue;
    seenWho.add(c.payload.who);
    eligible.push(c);
  }
  const k = Math.max(0, Math.min(units, eligible.length));
  return { winners: eligible.slice(0, k), losers: eligible.slice(k) };
}

export interface KeyPayload {
  key: string;
}
export interface MoveItem {
  id: string;
  /** The item's create op and its moves; each payload carries a fractional key. */
  writes: readonly Op<KeyPayload>[];
}
export interface Placed {
  id: string;
  /** The item's winning fractional key (`pos`). */
  key: string;
  /** Frontier writes with a different key than the winner. */
  twins: Op<KeyPayload>[];
}

/**
 * ordered-move: a pure join over the items of one list.
 * Each item's `pos` is `causalLww` over its create key and its moves.
 * Order = ascending by (key, id), both by UTF-16 code unit (never localeCompare).
 * Items with no writes are dropped. Keys carry a replica suffix, so two moves into one gap
 * give distinct keys; the id only breaks a tie between identical keys.
 * Reads no arrival order; duplicates collapse by op id.
 */
export function orderedMove(items: readonly MoveItem[]): Placed[] {
  const placed: Placed[] = [];
  for (const it of items) {
    const r = causalLww(it.writes);
    if (r.value === undefined) continue;
    placed.push({ id: it.id, key: r.value.key, twins: r.twins });
  }
  return placed.sort((a, b) =>
    a.key !== b.key ? (a.key < b.key ? -1 : 1) : a.id < b.id ? -1 : a.id > b.id ? 1 : 0,
  );
}

/**
 * sum-split: split integer cents over distinct members, sorted by UTF-16 code unit.
 * The first `amount % k` members get one extra cent, so shares sum to the amount and differ by at most 1.
 */
export function sumSplit(amountCents: number, members: readonly string[]): Record<string, number> {
  if (!Number.isInteger(amountCents) || amountCents < 0) throw new Error(`sumSplit: bad amount ${amountCents}`);
  const ids = [...new Set(members)].sort();
  const k = ids.length;
  if (k === 0) return {};
  const base = Math.floor(amountCents / k);
  const rem = amountCents % k;
  return Object.fromEntries(ids.map((id, i) => [id, i < rem ? base + 1 : base]));
}
