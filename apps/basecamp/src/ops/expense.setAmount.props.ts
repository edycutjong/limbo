// Properties for expense.setAmount: generator, the kit `split` intent, and causal dominance on the amount.
import { conflictGen } from '../../../../kit/props/arbitraries/index.ts';
import { setIntent, splitIntent } from '../../../../kit/props/intent/index.ts';
import type { RunOptions } from '../../../../kit/props/run.ts';
import { sumSplit } from '../../../../skeleton/src/core/merges.ts';
import type { ExpenseAmountState } from './expense.setAmount.op.ts';
import type { AmountPayload } from './expense.state.ts';

const MEMBERS = ['budi', 'dewi', 'sari'];

export const opts: RunOptions = {
  gen: conflictGen({
    payloads: {
      'expense.setAmount': (rand, ctx): AmountPayload => ({
        amountCents: ctx.pick([0, 2600, 1300], [rand.int(100001), 1, 2600]),
      }),
    },
  }),
  checks: [
    splitIntent({
      relevant: (o) => o.op === 'expense.setAmount',
      read: (s: ExpenseAmountState, target) => {
        const amount = s.amounts?.[target]?.amountCents;
        if (amount === undefined) return undefined;
        return { amount, members: MEMBERS, shares: sumSplit(amount, MEMBERS) };
      },
    }),
    // Causal dominance: the converged amount is written by a frontier write; an amount that observed another beats it.
    setIntent({
      write: (o) => (o.op === 'expense.setAmount' ? (o.payload as AmountPayload).amountCents : undefined),
      read: (s: ExpenseAmountState, target) => s.amounts?.[target]?.amountCents,
    }),
  ],
};
