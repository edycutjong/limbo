// move-reinsert: a move inserts the id at an index without removing the old entry, and create appends in arrival order.
// Concurrent moves duplicate an item and replicas order it differently.
import { moveIntent } from '../intent/index.ts';
import { asDef, type Fixture } from './types.ts';

type S = { list?: string[] };
type P = { k: 'create' | 'move'; id: string; at: number };
const fixture: Fixture = {
  name: 'move-reinsert',
  expectFails: ['intent:move', 'convergence'],
  def: asDef({
    name: 'f.move',
    merge: 'ordered-move',
    intent: { kind: 'move' },
    apply: (s: S, op: { payload: P }): S => {
      const list = [...(s.list ?? [])];
      if (op.payload.k === 'create') {
        if (!list.includes(op.payload.id)) list.push(op.payload.id);
      } else list.splice(Math.min(op.payload.at, list.length), 0, op.payload.id);
      return { list };
    },
  }),
  opts: {
    gen: (_d, r) => ({ target: 't', payload: { k: r.chance(0.5) ? 'create' : 'move', id: r.pick(['p', 'q', 'r']), at: r.int(3) } }),
    checks: [
      moveIntent({
        // Membership and duplication are what this fixture breaks; its fold has no keys, so the expected order is sorted ids.
        expected: (ops) => [...new Set(ops.filter((o) => o.op === 'f.move' && (o.payload as P).k === 'create').map((o) => (o.payload as P).id))].sort(),
        read: (s: S) => s.list ?? [],
      }),
    ],
  },
};
export default fixture;
