// arrival-order: the last op to arrive wins. Replicas that receive ops in different orders diverge,
// which shows the scheduler really permutes deliveries (R15.4).
import { setIntent } from '../intent/index.ts';
import { asDef, type Fixture } from './types.ts';

type S = { v?: number };
const fixture: Fixture = {
  name: 'arrival-order',
  expectFails: ['convergence'],
  def: asDef({
    name: 'f.arrival',
    merge: 'causal-lww',
    intent: { kind: 'set', field: 'v' },
    apply: (_s: S, op: { payload: { v: number } }): S => ({ v: op.payload.v }),
  }),
  opts: {
    gen: (_d, r) => ({ target: 't', payload: { v: r.int(4) } }),
    checks: [setIntent({ write: (o) => (o.op === 'f.arrival' ? (o.payload as { v: number }).v : undefined), read: (s: S) => s.v })],
  },
};
export default fixture;
