// item.release: gives a claim back.
// Intent: a release cancels only the claims by the same person that it observed; a claim made later or concurrently stands.
// Merge: claim-one. A release covers a claim iff it observed it.
import type { Op, OpDef } from '../../../../skeleton/src/core/types.ts';
import type { ClaimPayload } from '../../../../skeleton/src/core/merges.ts';
import { applyClaim, claimInvariant, type ClaimState } from './item.claims.ts';

const def: OpDef<ClaimState, ClaimPayload> = {
  name: 'item.release',
  merge: 'claim-one',
  intent: { kind: 'claim' },
  apply: (s, op: Op<ClaimPayload>) => applyClaim(s, 'releases', op),
  invariant: claimInvariant,
};

export default def as unknown as OpDef;
