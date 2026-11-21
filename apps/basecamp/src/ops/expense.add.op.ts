// expense.add: creates an expense. Intent: two people adding expenses offline must both count, and the shares must
// always add up to the amount in whole cents.
// Merge: commutes. State is keyed by op id, so order and duplicates cannot change it.
import type { Op, OpDef } from '../../../../skeleton/src/core/types.ts';
import { isCents, type AddPayload } from './expense.state.ts';

export type { AddPayload };

export interface ExpenseAddState {
  adds?: Record<string, AddPayload & { target: string; op: Op<AddPayload> }>;
}

const def: OpDef<ExpenseAddState, AddPayload> = {
  name: 'expense.add',
  merge: 'commutes',
  intent: { kind: 'split' },
  apply(s, op: Op<AddPayload>) {
    return { ...s, adds: { ...(s.adds ?? {}), [op.id]: { target: op.target, ...op.payload, op } } };
  },
  invariant(s) {
    for (const [id, a] of Object.entries(s.adds ?? {})) {
      if (!isCents(a.amountCents)) return `add ${id} has amountCents ${String(a.amountCents)}, expected an integer >= 0`;
      if (typeof a.label !== 'string' || typeof a.payer !== 'string') return `add ${id} has a non-string label or payer`;
      if (!Array.isArray(a.members) || a.members.some((m) => typeof m !== 'string')) return `add ${id} has a non-string member`;
    }
    return true;
  },
};

export default def as unknown as OpDef;
