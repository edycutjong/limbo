// Properties for item.adjustQty: generator and the kit `delta` intent oracle on `qty`.
import { conflictGen } from '../../../../kit/props/arbitraries/index.ts';
import { deltaIntent } from '../../../../kit/props/intent/index.ts';
import type { RunOptions } from '../../../../kit/props/run.ts';
import type { AdjustQtyPayload, AdjustQtyState } from './item.adjustQty.op.ts';

export const opts: RunOptions = {
  gen: conflictGen({
    payloads: { 'item.adjustQty': (_r, c) => ({ by: c.pick([1, -1], [1, -1, 2, -3, 5]) }) },
  }),
  checks: [
    deltaIntent({
      delta: (o) => (o.op === 'item.adjustQty' ? (o.payload as AdjustQtyPayload).by : undefined),
      read: (s: AdjustQtyState, target) => s.qty?.[target]?.total,
    }),
  ],
};
