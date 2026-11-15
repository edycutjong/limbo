// Shared claim state for item.claim and item.release. Not an op file.
// State keeps every claim and release by op id and re-derives winners with the `claimOne` merge,
// so order and duplicates cannot change it. Item life and units live in other ops; here one unit, alive.
import { claimOne, type ClaimPayload } from '../../../../skeleton/src/core/merges.ts';
import type { Op } from '../../../../skeleton/src/core/types.ts';

export const UNITS = 1;

export interface ClaimEntry {
  claims: Record<string, Op<ClaimPayload>>;
  releases: Record<string, Op<ClaimPayload>>;
  winners: string[];
  losers: string[];
}

export interface ClaimState {
  claims?: Record<string, ClaimEntry>;
}

export function applyClaim(s: ClaimState, side: 'claims' | 'releases', op: Op<ClaimPayload>): ClaimState {
  const prev = s.claims?.[op.target];
  const claims = { ...(prev?.claims ?? {}) };
  const releases = { ...(prev?.releases ?? {}) };
  (side === 'claims' ? claims : releases)[op.id] = op;
  const r = claimOne(Object.values(claims), Object.values(releases), UNITS, 'alive');
  const entry: ClaimEntry = {
    claims,
    releases,
    winners: r.winners.map((w) => w.payload.who),
    losers: r.losers.map((l) => l.payload.who),
  };
  return { ...s, claims: { ...(s.claims ?? {}), [op.target]: entry } };
}

export function claimInvariant(s: ClaimState): true | string {
  for (const [t, v] of Object.entries(s.claims ?? {})) {
    if (v.winners.length > UNITS) return `target ${t} has ${v.winners.length} winners for ${UNITS} unit`;
    const all = [...v.winners, ...v.losers];
    if (new Set(all).size !== all.length) return `target ${t} lists a claimant twice`;
  }
  return true;
}
