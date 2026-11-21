// apply-append: a set-intent reducer appends each write to an array instead of keying it by op id.
// Sorted appends converge through the causal buffer, but applying the same op twice changes the state.
import { asDef, type Fixture } from './types.ts';

type S = { writes?: number[] };
const fixture: Fixture = {
  name: 'apply-append',
  expectFails: ['raw idempotence'],
  def: asDef({
    name: 'f.append',
    merge: 'commutes',
    intent: { kind: 'set', field: 'writes' },
    apply: (s: S, op: { payload: { v: number } }): S => ({ ...s, writes: [...(s.writes ?? []), op.payload.v].sort((a, b) => a - b) }),
  }),
  opts: {
    gen: (_d, r) => ({ target: 't', payload: { v: r.int(10) } }),
  },
};
export default fixture;
