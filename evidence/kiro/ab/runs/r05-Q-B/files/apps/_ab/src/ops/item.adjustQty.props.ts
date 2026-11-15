// Properties for item.adjustQty: generator and the kit `delta` intent oracle on `qty`.
import { conflictGen } from '../../../../kit/props/arbitraries/index.ts';
import { deltaIntent } from '../../../../kit/props/intent/index.ts';
import type { RunOptions } from '../../../../kit/props/run.ts';
import { qtyOf, type AdjustQtyPayload } from './item.adjustQty.op.ts';

export const opts: RunOptions = {
  gen: conflictGen({
    payloads: {
      'item.adjustQty': (rand): AdjustQtyPayload => ({ by: rand.int(7) - 3 }),
    },
  }),
  checks: [
    deltaIntent({
      delta: (o) => (o.op === 'item.adjustQty' ? (o.payload as AdjustQtyPayload).by : undefined),
      read: (s, target) => qtyOf(s, target),
    }),
  ],
};
