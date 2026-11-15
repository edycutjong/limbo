// Properties for item.release: generator and the kit `claim` intent oracle.
import { basecampPayloads, conflictGen } from '../../../../kit/props/arbitraries/index.ts';
import { claimIntent } from '../../../../kit/props/intent/index.ts';
import type { RunOptions } from '../../../../kit/props/run.ts';
import { UNITS, type ClaimState } from './item.claims.ts';

export const opts: RunOptions = {
  gen: conflictGen({ payloads: basecampPayloads }),
  checks: [
    claimIntent({
      claim: (o) => (o.op === 'item.claim' ? (o.payload as { who: string }).who : undefined),
      release: (o) => (o.op === 'item.release' ? (o.payload as { who: string }).who : undefined),
      units: () => UNITS,
      winners: (s: ClaimState, t) => s.claims?.[t]?.winners ?? [],
      losers: (s: ClaimState, t) => s.claims?.[t]?.losers ?? [],
    }),
  ],
};
