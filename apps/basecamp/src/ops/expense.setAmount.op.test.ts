import { describe, expect, it } from 'vitest';
import type { Op } from '../../../../skeleton/src/core/types.ts';
 import def from './expense.setAmount.op.ts';

function mk<P>(r: string, n: number, l: number, deps: Record<string, number>, payload: P, target = 't'): Op<P> {
  return { id: `${r}:${n}`, op: 'x', target, payload, stamp: { l, r, n }, deps };
}

const apply = def.apply!;
const inv = def.invariant!;
type S = { amounts: Record<string, { amountCents: number | undefined }> };

describe('expense.setAmount', () => {
  it('declares causal-lww with the split intent', () => {
    expect([def.merge, def.intent]).toEqual(['causal-lww', { kind: 'split' }]);
  });
  it('an observing later write wins and applying a write twice gives the same state', () => {
    const w1 = mk('a', 1, 1, {}, { amountCents: 100 });
    const w2 = mk('b', 1, 2, { a: 1 }, { amountCents: 250 });
    const s = apply(apply({}, w1), w2) as S;
    expect(s.amounts.t!.amountCents).toBe(250);
    expect(apply(s, w2)).toEqual(s);
    expect(apply(apply({}, w2), w1)).toEqual(s);
  });
  it('accepts an empty state and a valid amount', () => {
    expect(inv({})).toBe(true);
    expect(inv(apply({}, mk('a', 1, 1, {}, { amountCents: 0 })))).toBe(true);
  });
  it('rejects a converged amount that is not integer cents', () => {
    expect(inv({ amounts: { t: { amountCents: 1.5, writes: {} } } })).toBe('target t has amount 1.5, expected an integer >= 0');
  });
  it('rejects a recorded write that is not integer cents', () => {
    const bad = mk('a', 1, 1, {}, { amountCents: -3 });
    const s = { amounts: { t: { amountCents: 5, writes: { [bad.id]: bad } } } };
    expect(inv(s)).toBe('write a:1 is not integer cents');
  });
});
