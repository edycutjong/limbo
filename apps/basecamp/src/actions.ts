// BASECAMP actions (design §6): one function per user action. Each creates one op through
// `replica.local`, so `deps` is the replica's current vv and a resolve op observes every op
// the replica holds on that target. No clock, randomness or locale is read here.
import { allocKey, type Dot } from '../../../skeleton/src/core/causal.ts';
import type { Op } from '../../../skeleton/src/core/types.ts';
import type { Replica } from '../../../skeleton/src/sync/replica.ts';
import { memberOfReplica } from './members.ts';
import type { State } from './model.ts';

type R = Replica<State>;

/** The dot of the op this replica creates next; its key suffix then encodes that op's id. */
const nextDot = (r: R): Dot => ({ r: r.ns, n: (r.vv()[r.ns] ?? 0) + 1 });

/** Neighbour keys for slot `i` among `keys` (ascending). Keys equal to the left key are skipped, since no key lies between equal keys. */
function gap(keys: readonly string[], i: number): [string | null, string | null] {
  const left = i > 0 ? keys[i - 1]! : null;
  let j = i;
  while (left !== null && j < keys.length && keys[j]! <= left) j++;
  return [left, j < keys.length ? keys[j]! : null];
}

/** The member id this replica acts as; replicas without a member act as themselves. */
export const memberOf = (r: R): string => memberOfReplica(r.id) ?? r.id;

/** Add an item. The target is the add op's own id, so two replicas cannot pick the same one. */
export function addItem(r: R, name: string, units = 1): Op {
  const dot = nextDot(r);
  const target = `${dot.r}:${dot.n}`;
  const s = r.state();
  const last = s.order[s.order.length - 1];
  const key = allocKey(last === undefined ? null : s.items[last]!.pos, null, dot);
  return r.local('item.add', target, { name, units, key });
}

export const renameItem = (r: R, id: string, name: string): Op => r.local('item.rename', id, { name });

/** Explicit value, never a toggle. */
export const tickItem = (r: R, id: string, ticked: boolean): Op => r.local('item.tick', id, { ticked });

export const deleteItem = (r: R, id: string): Op => r.local('item.delete', id, {});

export const restoreItem = (r: R, id: string): Op => r.local('item.restore', id, {});

export const claimItem = (r: R, id: string): Op => r.local('item.claim', id, { who: memberOf(r) });

/** Release a claim by `who` (default: this replica's member). It cancels only claims the replica has observed. */
export const releaseItem = (r: R, id: string, who: string = memberOf(r)): Op => r.local('item.release', id, { who });

/** Move an item to `index` among the other visible items; the key is allocated between its new neighbours. */
export function moveItem(r: R, id: string, index: number): Op {
  const s = r.state();
  const others = s.order.filter((x) => x !== id);
  const i = Math.max(0, Math.min(index, others.length));
  const [left, right] = gap(others.map((x) => s.items[x]!.pos), i);
  return r.local('item.move', id, { key: allocKey(left, right, nextDot(r)) });
}

export const addExpenseMember = (r: R, id: string, member: string): Op => r.local('expense.addMember', id, { member });

export const removeExpenseMember = (r: R, id: string, member: string): Op => r.local('expense.removeMember', id, { member });

export const setAmount = (r: R, id: string, amountCents: number): Op => r.local('expense.setAmount', id, { amountCents });
