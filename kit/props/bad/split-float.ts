// split-float: each share is amount / k rounded on its own, so the shares drift from the total.
import { asDef, type Fixture } from './types.ts';
import { splitGolden, splitOpts, type SplitFn, type SplitState } from './shared.ts';

const split: SplitFn = (amount, members) => Object.fromEntries(members.map((m) => [m, Math.round(amount / members.length)]));

const fixture: Fixture = {
  name: 'split-float',
  expectFails: ['intent:split', 'golden:G20'],
  def: asDef({
    name: 'f.split',
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
