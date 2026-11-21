// Shared expense state helpers for expense.add, expense.setAmount and the member ops. Not an op file.
// `present` is the add-wins membership rule: a member is in iff some add of that member is not covered by a remove
// of that member that observed it. The model and the op props both use it, so they cannot disagree.
import { causalLww, sumSplit } from '../../../../skeleton/src/core/merges.ts';
import { compareStamp, covers } from '../../../../skeleton/src/core/causal.ts';
import type { Op } from '../../../../skeleton/src/core/types.ts';

export interface AddPayload {
  label: string;
  amountCents: number;
  payer: string;
  members: string[];
}
export interface AmountPayload {
  amountCents: number;
}

/** One add of a member: the op that added it (the expense.add op for initial members, or an addMember op). */
export interface MemberAdd {
  member: string;
  op: Op;
}
/** One remove of a member: the op that removed it. */
export interface MemberRemove {
  member: string;
  op: Op;
}

/** Members present (sorted by UTF-16 code unit, no duplicates). An add concurrent with a remove survives. */
export function present(addsOf: readonly MemberAdd[], removes: readonly MemberRemove[]): string[] {
  const out = new Set<string>();
  for (const a of addsOf) {
    if (!removes.some((r) => r.member === a.member && covers(r.op, a.op))) out.add(a.member);
  }
  return [...out].sort();
}

export interface MemberPayload {
  member: string;
}

/** State shared by `expense.addMember` and `expense.removeMember`: both ops keep their writes by op id and re-derive `members`. */
export interface MemberOpsState {
  memberAdds?: Record<string, Op<MemberPayload>>;
  memberRemoves?: Record<string, Op<MemberPayload>>;
  members?: Record<string, string[]>;
}

/** Record one member op by id and re-derive the present members of its target (order and duplicates cannot change it). */
export function applyMemberOp(s: MemberOpsState, op: Op<MemberPayload>, kind: 'add' | 'remove'): MemberOpsState {
  const memberAdds = kind === 'add' ? { ...(s.memberAdds ?? {}), [op.id]: op } : (s.memberAdds ?? {});
  const memberRemoves = kind === 'remove' ? { ...(s.memberRemoves ?? {}), [op.id]: op } : (s.memberRemoves ?? {});
  const of = (m: Record<string, Op<MemberPayload>>) =>
    Object.values(m).filter((o) => o.target === op.target).map((o) => ({ member: o.payload.member, op: o }));
  return { ...s, memberAdds, memberRemoves, members: { ...(s.members ?? {}), [op.target]: present(of(memberAdds), of(memberRemoves)) } };
}

/** Invariant shared by both member ops: every recorded member is a string. */
export function memberInvariant(s: MemberOpsState): true | string {
  for (const m of [...Object.values(s.memberAdds ?? {}), ...Object.values(s.memberRemoves ?? {})]) {
    if (typeof m.payload.member !== 'string') return `op ${m.id} has a non-string member`;
  }
  return true;
}

/** The expense's defining add: the lowest stamp (ties cannot occur, stamps are unique). */
export function firstAdd(adds: readonly Op<AddPayload>[]): Op<AddPayload> | undefined {
  let best: Op<AddPayload> | undefined;
  for (const a of adds) if (best === undefined || compareStamp(a.stamp, best.stamp) < 0) best = a;
  return best;
}

/** Initial members of an add, each an add dot by that op. */
export function initialMembers(first: Op<AddPayload>): MemberAdd[] {
  return first.payload.members.map((member) => ({ member, op: first }));
}

/** Converged amount: causal-lww over the first add's amount and every setAmount write. */
export function amountOf(first: Op<AddPayload>, sets: readonly Op<AmountPayload>[]) {
  const base: Op<AmountPayload> = { ...first, payload: { amountCents: first.payload.amountCents } };
  return causalLww<AmountPayload>([base, ...sets]);
}

/** Shares over a converged amount and member set; `unallocated` is the amount when there are no members. */
export function sharesOf(amountCents: number, members: readonly string[]): { shares: Record<string, number>; unallocated: number } {
  return { shares: sumSplit(amountCents, members), unallocated: members.length === 0 ? amountCents : 0 };
}

export const isCents = (n: unknown): n is number => typeof n === 'number' && Number.isSafeInteger(n) && n >= 0;
