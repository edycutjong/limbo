// Properties for item.restore: generator and the kit `life` intent oracle.
import { conflictGen } from '../../../../kit/props/arbitraries/index.ts';
import { lifeIntent } from '../../../../kit/props/intent/index.ts';
import type { RunOptions } from '../../../../kit/props/run.ts';
import type { LifeState } from './item.life.ts';

export const opts: RunOptions = {
  gen: conflictGen({}),
  checks: [
    lifeIntent({
      kind: (o) => (o.op === 'item.restore' ? 'restore' : undefined),
      read: (s: LifeState, target) => s.life?.[target]?.life ?? 'alive',
    }),
  ],
};
