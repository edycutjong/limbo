// item.claim: "I'll bring it."
// Intent: two people claiming the same thing offline must both be heard; one wins deterministically, the other is a loser twin.
// Merge: claim-one. The lowest stamp among eligible claims wins; this is a deterministic pick, not "who was first".
import type { Op, OpDef } from '../../../../skeleton/src/core/types.ts';
import type { ClaimPayload } from '../../../../skeleton/src/core/merges.ts';
import { applyClaim, claimInvariant, type ClaimState } from './item.claims.ts';

const def: OpDef<ClaimState, ClaimPayload> = {
  name: 'item.claim',
  merge: 'claim-one',
  intent: { kind: 'claim' },
  apply: (s, op: Op<ClaimPayload>) => applyClaim(s, 'claims', op),
  invariant: claimInvariant,
};

export default def as unknown as OpDef;
