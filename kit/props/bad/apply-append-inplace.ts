// apply-append-inplace: a reducer that appends to the input state in place and returns the same object.
// `apply(once, o)` then returns the object `once` already is, so comparing `once` and `twice` after both
// applies sees one object. `raw idempotence` snapshots `once` before the second apply, so it sees the extra entry.
import { asDef, type Fixture } from './types.ts';

type S = { writes?: number[] };
const fixture: Fixture = {
  name: 'apply-append-inplace',
  expectFails: ['raw idempotence'],
  def: asDef({
    name: 'f.appendinplace',
    merge: 'commutes',
    intent: { kind: 'set', field: 'writes' },
    apply: (s: S, op: { payload: { v: number } }): S => {
      (s.writes ??= []).push(op.payload.v);
      return s;
    },
  }),
  opts: {
    gen: (_d, r) => ({ target: 't', payload: { v: r.int(10) } }),
  },
};
export default fixture;
