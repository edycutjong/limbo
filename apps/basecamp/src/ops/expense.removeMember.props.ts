// Properties for expense.removeMember: generator, the kit `split` intent and the kit `add-remove` intent on membership.
import { conflictGen } from '../../../../kit/props/arbitraries/index.ts';
import { addRemoveIntent, splitIntent } from '../../../../kit/props/intent/index.ts';
import type { RunOptions } from '../../../../kit/props/run.ts';
import { sumSplit } from '../../../../skeleton/src/core/merges.ts';
import type { MemberOpsState, MemberPayload } from './expense.state.ts';

const AMOUNT = 2600;
const MEMBERS = ['sari', 'budi', 'citra', 'dewi'];

export const opts: RunOptions = {
  gen: conflictGen({
    payloads: {
      'expense.removeMember': (_rand, ctx): MemberPayload => ({ member: ctx.pick(['dewi', 'budi'], MEMBERS) }),
    },
  }),
  checks: [
    splitIntent({
      relevant: (o) => o.op === 'expense.removeMember',
      read: (s: MemberOpsState, target) => {
        const members = s.members?.[target];
        if (members === undefined) return undefined;
        return { amount: AMOUNT, members, shares: sumSplit(AMOUNT, members) };
      },
    }),
    addRemoveIntent({
      add: (o) => (o.op === 'expense.addMember' ? (o.payload as MemberPayload).member : undefined),
      remove: (o) => (o.op === 'expense.removeMember' ? (o.payload as MemberPayload).member : undefined),
      read: (s: MemberOpsState, target) => s.members?.[target] ?? [],
    }),
  ],
};
