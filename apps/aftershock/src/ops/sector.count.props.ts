// Properties for sector.count: generator and the kit `set` intent oracle on `count`.
import { conflictGen } from '../../../../kit/props/arbitraries/index.ts';
import { setIntent } from '../../../../kit/props/intent/index.ts';
import type { RunOptions } from '../../../../kit/props/run.ts';
import type { CountPayload, CountState } from './sector.count.op.ts';

export const opts: RunOptions = {
  gen: conflictGen({
    targets: ['C3#sari', 'C3#budi', 'D1#sari', 'D1#budi'],
    payloads: { 'sector.count': (_rand, ctx): CountPayload => ({ count: ctx.pick([2, 3], [0, 1, 2, 3, 5, 100000]) }) },
  }),
  checks: [
    setIntent({
      write: (o) => (o.op === 'sector.count' ? (o.payload as CountPayload).count : undefined),
      read: (s: CountState, target) => s.counts?.[target]?.count,
    }),
  ],
};
