// claim-max-stamp: the highest stamp wins instead of the lowest, so a claim that has seen another beats it.
import { asDef, type Fixture } from './types.ts';
import { claimApply, claimOpts, eligible } from './shared.ts';

const fixture: Fixture = {
  name: 'claim-max-stamp',
  expectFails: ['intent:claim'],
  def: asDef({ name: 'f.claim', merge: 'claim-one', intent: { kind: 'claim' }, apply: claimApply }),
  opts: claimOpts('f.claim', (s) => eligible(s, true).slice(0, 1), (s) => eligible(s, true).slice(1)),
};
export default fixture;
