// expense.addMember: adds a member to an expense's split. Intent: someone added to a split while another person
// removes them offline must stay in, and the shares must add up to the amount in whole cents.
// Merge: commutes. State keeps every add by op id and re-derives the members (an add concurrent with a remove survives).
import type { Op, OpDef } from '../../../../skeleton/src/core/types.ts';
import { applyMemberOp, memberInvariant, type MemberOpsState, type MemberPayload } from './expense.state.ts';

export type { MemberPayload };
export type ExpenseAddMemberState = MemberOpsState;

const def: OpDef<MemberOpsState, MemberPayload> = {
  name: 'expense.addMember',
  merge: 'commutes',
  intent: { kind: 'split' },
  apply: (s, op: Op<MemberPayload>) => applyMemberOp(s, op, 'add'),
  invariant: memberInvariant,
};

export default def as unknown as OpDef;
