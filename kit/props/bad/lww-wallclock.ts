// lww-wallclock: the winner is picked by the replica's own clock. Skewed clocks make replicas disagree
// and a write that has seen another can lose to it.
import { setIntent } from '../intent/index.ts';
import { asDef, type Fixture } from './types.ts';

type S = { v?: number; at?: number };
const fixture: Fixture = {
  name: 'lww-wallclock',
  expectFails: ['intent:set', 'convergence'],
  def: asDef({
    name: 'f.wall',
    merge: 'causal-lww',
    intent: { kind: 'set', field: 'v' },
    apply: (s: S, op: { payload: { v: number } }) => {
      const at = Date.now();
      return s.at === undefined || at >= s.at ? { v: op.payload.v, at } : s;
    },
  }),
  opts: {
    gen: (_d, r) => ({ target: 't', payload: { v: r.int(3) } }),
    checks: [setIntent({ write: (o) => (o.op === 'f.wall' ? (o.payload as { v: number }).v : undefined), read: (s: S) => s.v })],
  },
};
export default fixture;
