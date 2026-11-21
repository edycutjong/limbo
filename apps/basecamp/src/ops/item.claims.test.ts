import { describe, expect, it } from 'vitest';
import type { Op } from '../../../../skeleton/src/core/types.ts';
 import { applyClaim, claimInvariant, UNITS, type ClaimState } from './item.claims.ts';
import type { ClaimPayload } from '../../../../skeleton/src/core/merges.ts';

function mk<P>(r: string, n: number, l: number, deps: Record<string, number>, payload: P, target = 't'): Op<P> {
  return { id: `${r}:${n}`, op: 'x', target, payload, stamp: { l, r, n }, deps };
}

const c = (r: string, who: string, l = 1, deps: Record<string, number> = {}) => mk<ClaimPayload>(r, 1, l, deps, { who });

describe('item.claims', () => {
  it('lets the lowest stamp win one unit and the other claimant lose', () => {
    const s = applyClaim(applyClaim({}, 'claims', c('b', 'dewi')), 'claims', c('a', 'sari'));
    expect(UNITS).toBe(1);
    expect(s.claims!.t).toMatchObject({ winners: ['sari'], losers: ['dewi'] });
  });
  it('a release that observed the claim frees it, and applying a claim twice gives the same state', () => {
    const k = c('a', 'sari');
    const once = applyClaim({}, 'claims', k);
    expect(applyClaim(once, 'claims', k)).toEqual(once);
    const rel = applyClaim(once, 'releases', mk<ClaimPayload>('a', 2, 2, { a: 1 }, { who: 'sari' }));
    expect(rel.claims!.t).toMatchObject({ winners: [], losers: [] });
  });
  it('accepts an empty state and a converged state', () => {
    expect(claimInvariant({})).toBe(true);
    expect(claimInvariant(applyClaim({}, 'claims', c('a', 'sari')))).toBe(true);
  });
  it('rejects more winners than units', () => {
    const s: ClaimState = { claims: { t: { claims: {}, releases: {}, winners: ['a', 'b'], losers: [] } } };
    expect(claimInvariant(s)).toBe('target t has 2 winners for 1 unit');
  });
  it('rejects a claimant listed twice', () => {
    const s: ClaimState = { claims: { t: { claims: {}, releases: {}, winners: ['a'], losers: ['a'] } } };
    expect(claimInvariant(s)).toBe('target t lists a claimant twice');
  });
});
