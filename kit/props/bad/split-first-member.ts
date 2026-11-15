// split-first-member: the remainder goes to the first member in the order given, not in code-unit order of id.
// Shares still sum to the amount, so only the golden history (G20) shows it.
import { asDef, type Fixture } from './types.ts';
import { splitGolden, splitOpts, type SplitFn, type SplitState } from './shared.ts';

const split: SplitFn = (amount, members) => {
  const base = Math.floor(amount / members.length);
  const rem = amount % members.length;
  return Object.fromEntries(members.map((m, i) => [m, i < rem ? base + 1 : base]));
};

const fixture: Fixture = {
  name: 'split-first-member',
  expectFails: ['golden:G20'],
  // Reducer shown for completeness: it satisfies the split intent (sum, integers) on purpose.
  def: asDef({
    name: 'f.split1',
    merge: 'sum-split',
    intent: { kind: 'split' },
    apply: (s: SplitState, op: { payload: { m: string } }): SplitState => {
      const members = [...new Set([...s.members, op.payload.m])].sort();
      return { amount: s.amount, members, shares: split(s.amount, members) };
    },
  }),
  opts: splitOpts(split),
  golden: splitGolden('G20', split),
};
export default fixture;
