// expense.removeMember: removes a member from an expense's split. Intent: a remove only takes out the adds it has
// seen, so a member added at the same time stays in, and the shares must add up to the amount in whole cents.
// Merge: commutes. State keeps every remove by op id and re-derives the members.
import type { Op, OpDef } from '../../../../skeleton/src/core/types.ts';
import { applyMemberOp, memberInvariant, type MemberOpsState, type MemberPayload } from './expense.state.ts';

export type { MemberPayload };
export type ExpenseRemoveMemberState = MemberOpsState;

const def: OpDef<MemberOpsState, MemberPayload> = {
  name: 'expense.removeMember',
  merge: 'commutes',
  intent: { kind: 'split' },
  apply: (s, op: Op<MemberPayload>) => applyMemberOp(s, op, 'remove'),
  invariant: memberInvariant,
};

export default def as unknown as OpDef;
