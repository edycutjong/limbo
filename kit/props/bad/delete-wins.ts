// delete-wins: any unobserved delete beats a concurrent edit. The edit is lost, with no twin.
import { asDef, type Fixture } from './types.ts';
import { lifeApply, lifeOpts } from './shared.ts';

const fixture: Fixture = {
  name: 'delete-wins',
  expectFails: ['intent:life'],
  def: asDef({
    name: 'f.life',
    merge: 'resurrect',
    intent: { kind: 'life' },
    apply: lifeApply(undefined),
  }),
  // The wrong reducer's own read is the one handed to the oracle.
  opts: lifeOpts('f.life', true),
};
export default fixture;
