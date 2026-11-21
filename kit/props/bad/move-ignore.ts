// move-ignore: the fold lists items by id and ignores every move key.
// It converges and loses no item, so only an oracle that compares the order with the winning keys catches it.
import { expectedOrder, moveIntent } from '../intent/index.ts';
import { asDef, type Fixture } from './types.ts';

type S = { ids?: Record<string, true> };
type P = { key: string };
const fixture: Fixture = {
  name: 'move-ignore',
  expectFails: ['intent:move'],
  def: asDef({
    name: 'f.moveignore',
    merge: 'ordered-move',
    intent: { kind: 'move' },
    apply: (s: S, op: { target: string }): S => ({ ids: { ...(s.ids ?? {}), [op.target]: true } }),
  }),
  opts: {
    gen: (_d, r) => ({ target: r.pick(['p', 'q', 'r']), payload: { key: r.pick(['a0', 'a1', 'a2']) } }),
    checks: [
      moveIntent({
        expected: (ops) => expectedOrder(ops, (o) => (o.op === 'f.moveignore' ? (o.payload as P).key : undefined)),
        read: (s: S) => Object.keys(s.ids ?? {}).sort(),
      }),
    ],
  },
};
export default fixture;
