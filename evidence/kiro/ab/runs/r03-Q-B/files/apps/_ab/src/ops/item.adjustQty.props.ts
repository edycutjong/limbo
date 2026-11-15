// Properties for item.adjustQty: generator and the kit `delta` intent oracle on `qty`.
import { deltaIntent } from '../../../../kit/props/intent/index.ts';
import type { RunOptions } from '../../../../kit/props/run.ts';
import { qtyOf, type AdjustQtyPayload } from './item.adjustQty.op.ts';

export const opts: RunOptions = {
  gen: (_def, rand) => ({
    target: rand.chance(0.5) ? 'i1' : 'i2',
    payload: { by: rand.int(7) - 3 } satisfies AdjustQtyPayload,
  }),
  checks: [
    deltaIntent({
      delta: (o) => (o.op === 'item.adjustQty' ? (o.payload as AdjustQtyPayload).by : undefined),
      read: (s, target) => qtyOf(s, target),
    }),
  ],
};
