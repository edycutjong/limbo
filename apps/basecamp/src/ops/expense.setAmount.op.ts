// expense.setAmount: sets the amount to an explicit integer number of cents (never an edit script).
// Intent: an amount someone has seen another amount overwrite must lose to the later one; concurrent equal amounts
// collapse, different amounts surface as a twin (the model reads `twins`).
// Merge: causal-lww. State keeps every write by op id and re-derives the value, so order and duplicates cannot change it.
import { causalLww } from '../../../../skeleton/src/core/merges.ts';
import type { Op, OpDef } from '../../../../skeleton/src/core/types.ts';
import { isCents, type AmountPayload } from './expense.state.ts';

export type { AmountPayload };

export interface ExpenseAmountState {
  amounts?: Record<string, { writes: Record<string, Op<AmountPayload>>; amountCents: number | undefined }>;
}

const def: OpDef<ExpenseAmountState, AmountPayload> = {
  name: 'expense.setAmount',
  merge: 'causal-lww',
  intent: { kind: 'split' },
  apply(s, op: Op<AmountPayload>) {
    const cur = s.amounts?.[op.target];
    const writes = { ...(cur?.writes ?? {}), [op.id]: op };
    const amountCents = causalLww(Object.values(writes)).value?.amountCents;
    return { ...s, amounts: { ...(s.amounts ?? {}), [op.target]: { writes, amountCents } } };
  },
  invariant(s) {
    for (const [t, v] of Object.entries(s.amounts ?? {})) {
      if (!isCents(v.amountCents)) return `target ${t} has amount ${String(v.amountCents)}, expected an integer >= 0`;
      for (const w of Object.values(v.writes)) if (!isCents(w.payload.amountCents)) return `write ${w.id} is not integer cents`;
    }
    return true;
  },
};

export default def as unknown as OpDef;
