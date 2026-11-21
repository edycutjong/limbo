// Properties for expense.add: generator and the kit `split` intent on the op's own state.
import { conflictGen } from '../../../../kit/props/arbitraries/index.ts';
import { splitIntent } from '../../../../kit/props/intent/index.ts';
import type { RunOptions } from '../../../../kit/props/run.ts';
import { sumSplit } from '../../../../skeleton/src/core/merges.ts';
import type { ExpenseAddState } from './expense.add.op.ts';
import { firstAdd, initialMembers, present, type AddPayload } from './expense.state.ts';

const MEMBERS = ['sari', 'budi', 'citra', 'dewi'];

export const opts: RunOptions = {
  gen: conflictGen({
    payloads: {
      'expense.add': (rand, ctx): AddPayload => ({
        label: ctx.pick(['Gas', 'Snacks'], ['Gas', 'Snacks', 'Fuel', 'Ice']),
        amountCents: ctx.pick([0, 2500, 2600], [rand.int(100001), 1, 2500]),
        payer: ctx.pick(['sari', 'budi'], MEMBERS),
        members: MEMBERS.filter(() => rand.chance(0.6)),
      }),
    },
  }),
  checks: [
    splitIntent({
      relevant: (o) => o.op === 'expense.add',
      read: (s: ExpenseAddState, target) => {
        const adds = Object.values(s.adds ?? {}).filter((a) => a.target === target).map((a) => a.op);
        const first = firstAdd(adds);
        if (first === undefined) return undefined;
        const members = present(initialMembers(first), []);
        return { amount: first.payload.amountCents, members, shares: sumSplit(first.payload.amountCents, members) };
      },
    }),
  ],
};
