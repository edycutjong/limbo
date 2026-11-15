// qty-read-modify-write: the op writes `seen + 1` instead of adding a delta, so concurrent adds are lost.
import { deltaIntent } from '../intent/index.ts';
import { asDef, type Fixture } from './types.ts';

type S = { n?: number };
const fixture: Fixture = {
  name: 'qty-read-modify-write',
  expectFails: ['intent:delta'],
  def: asDef({
    name: 'f.qty',
    merge: 'commutes',
    intent: { kind: 'delta', field: 'n' },
    apply: (_s: S, op: { payload: { seen: number } }) => ({ n: op.payload.seen + 1 }),
  }),
  opts: {
    gen: (_d, r) => ({ target: 't', payload: { by: 1, seen: r.int(3) } }),
    checks: [deltaIntent({ delta: (o) => (o.op === 'f.qty' ? (o.payload as { by: number }).by : undefined), read: (s: S) => s.n })],
  },
};
export default fixture;
