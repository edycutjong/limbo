// claim-both: every eligible claimant wins a one-unit item. Nobody is a loser twin, and two people hold one thing.
import { asDef, type Fixture } from './types.ts';
import { claimApply, claimOpts, eligible } from './shared.ts';

const fixture: Fixture = {
  name: 'claim-both',
  expectFails: ['intent:claim'],
  def: asDef({ name: 'f.claim', merge: 'claim-one', intent: { kind: 'claim' }, apply: claimApply }),
  opts: claimOpts('f.claim', (s) => eligible(s, false), () => []),
};
export default fixture;
