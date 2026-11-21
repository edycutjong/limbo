// Properties for sector.need: generator and the kit `add-remove` intent on needs.
import { conflictGen } from '../../../../kit/props/arbitraries/index.ts';
import { addRemoveIntent } from '../../../../kit/props/intent/index.ts';
import type { RunOptions } from '../../../../kit/props/run.ts';
import { NEEDS } from '../sectors.ts';
import type { NeedOpsState, NeedPayload } from './sector.state.ts';

export const opts: RunOptions = {
  gen: conflictGen({
    payloads: {
      'sector.need': (_rand, ctx): NeedPayload => ({ need: ctx.pick(['water', 'medical'], NEEDS) }),
      'sector.unneed': (_rand, ctx): NeedPayload => ({ need: ctx.pick(['water', 'medical'], NEEDS) }),
    },
  }),
  checks: [
    addRemoveIntent({
      add: (o) => (o.op === 'sector.need' ? (o.payload as NeedPayload).need : undefined),
      remove: (o) => (o.op === 'sector.unneed' ? (o.payload as NeedPayload).need : undefined),
      read: (s: NeedOpsState, target) => s.needs?.[target] ?? [],
    }),
  ],
};
