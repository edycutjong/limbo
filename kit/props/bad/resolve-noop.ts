// resolve-noop: a restore (the "Keep" resolve of a twin) is dropped, so a twin or a deleted item never comes back.
import { asDef, type Fixture } from './types.ts';
import { lifeApply, lifeOpts } from './shared.ts';

const fixture: Fixture = {
  name: 'resolve-noop',
  expectFails: ['intent:life'],
  def: asDef({
    name: 'f.life',
    merge: 'resurrect',
    intent: { kind: 'life' },
    apply: lifeApply('restore'),
  }),
  opts: lifeOpts('f.life', false),
};
export default fixture;
