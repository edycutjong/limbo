// Properties for item.tick: generator and the kit `set` intent oracle on `ticked`.
import { conflictGen } from '../../../../kit/props/arbitraries/index.ts';
import { setIntent } from '../../../../kit/props/intent/index.ts';
import type { RunOptions } from '../../../../kit/props/run.ts';
import type { TickPayload, TickState } from './item.tick.op.ts';

export const opts: RunOptions = {
  gen: conflictGen({
    payloads: {
      'item.tick': (rand): TickPayload => ({ ticked: rand.chance(0.5) }),
    },
  }),
  checks: [
    setIntent({
      write: (o) => (o.op === 'item.tick' ? (o.payload as TickPayload).ticked : undefined),
      read: (s: TickState, target) => s.ticks?.[target]?.ticked,
    }),
  ],
};
