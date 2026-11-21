// Properties for item.move: generator and the kit `move` intent oracle (no duplicate, none missing, the order the winning keys give, same on every replica).
import { conflictGen } from '../../../../kit/props/arbitraries/index.ts';
import { expectedOrder, moveIntent } from '../../../../kit/props/intent/index.ts';
import type { RunOptions } from '../../../../kit/props/run.ts';
import type { KeyPayload } from '../../../../skeleton/src/core/merges.ts';
import type { MoveState } from './item.move.op.ts';

export const opts: RunOptions = {
  gen: conflictGen({
    payloads: {
      'item.move': (_rand, ctx): KeyPayload => ({
        key: ctx.pick(['a0', 'a1'], ['a0', 'a1', 'a2', 'a3', 'a4']),
      }),
    },
  }),
  checks: [
    moveIntent({
      expected: (ops) => expectedOrder(ops, (o) => (o.op === 'item.move' ? (o.payload as KeyPayload).key : undefined)),
      read: (s: MoveState) =>
        Object.entries(s.moves ?? {})
          .sort(([ia, a], [ib, b]) => (a.key !== b.key ? (a.key < b.key ? -1 : 1) : ia < ib ? -1 : ia > ib ? 1 : 0))
          .map(([id]) => id),
    }),
  ],
};
