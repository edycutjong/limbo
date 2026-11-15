// tick-toggle: a tick flips the field. Two equal ticks cancel, and every replica agrees on the wrong value.
import { setIntent } from '../intent/index.ts';
import { asDef, type Fixture } from './types.ts';

type S = { ticked?: boolean };
const fixture: Fixture = {
  name: 'tick-toggle',
  expectFails: ['intent:set'],
  def: asDef({
    name: 'f.tick',
    merge: 'commutes',
    intent: { kind: 'set', field: 'ticked' },
    apply: (s: S) => ({ ...s, ticked: !s.ticked }),
  }),
  opts: {
    gen: (_d, r) => ({ target: 't', payload: { ticked: r.chance(0.7) } }),
    checks: [setIntent({ write: (o) => (o.op === 'f.tick' ? (o.payload as { ticked: boolean }).ticked : undefined), read: (s: S) => s.ticked })],
  },
};
export default fixture;
