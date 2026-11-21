import { describe, expect, it } from 'vitest';
import type { Op } from '../../../../skeleton/src/core/types.ts';
 import def from './expense.add.op.ts';
import type { AddPayload } from './expense.state.ts';

function mk<P>(r: string, n: number, l: number, deps: Record<string, number>, payload: P, target = 't'): Op<P> {
  return { id: `${r}:${n}`, op: 'x', target, payload, stamp: { l, r, n }, deps };
}

const p: AddPayload = { label: 'Gas', amountCents: 1200, payer: 'sari', members: ['sari', 'budi'] };
const apply = def.apply!;
const inv = def.invariant!;

describe('expense.add', () => {
  it('declares commutes with the split intent', () => {
    expect([def.merge, def.intent]).toEqual(['commutes', { kind: 'split' }]);
  });
  it('keeps two adds by op id and applying one twice gives the same state', () => {
    const a = mk('a', 1, 1, {}, p, 'e1');
    const b = mk('b', 1, 1, {}, { ...p, label: 'Ice' }, 'e2');
    const s = apply(apply({}, a), b);
    expect(Object.keys((s as { adds: object }).adds)).toEqual(['a:1', 'b:1']);
    expect(apply(s, a)).toEqual(s);
    expect(apply(apply({}, b), a)).toEqual(s);
  });
  it('accepts an empty state and a valid add', () => {
    expect(inv({})).toBe(true);
    expect(inv(apply({}, mk('a', 1, 1, {}, p)))).toBe(true);
  });
  it('rejects an amount that is not integer cents', () => {
    expect(inv(apply({}, mk('a', 1, 1, {}, { ...p, amountCents: 1.5 })))).toMatch(/amountCents 1.5/);
    expect(inv(apply({}, mk('a', 1, 1, {}, { ...p, amountCents: -1 })))).toMatch(/amountCents -1/);
  });
  it('rejects a non-string label or payer', () => {
    expect(inv(apply({}, mk('a', 1, 1, {}, { ...p, label: 5 as unknown as string })))).toMatch(/non-string label or payer/);
    expect(inv(apply({}, mk('a', 1, 1, {}, { ...p, payer: 5 as unknown as string })))).toMatch(/non-string label or payer/);
  });
  it('rejects members that are not an array of strings', () => {
    expect(inv(apply({}, mk('a', 1, 1, {}, { ...p, members: 'x' as unknown as string[] })))).toMatch(/non-string member/);
    expect(inv(apply({}, mk('a', 1, 1, {}, { ...p, members: [1] as unknown as string[] })))).toMatch(/non-string member/);
  });
});
