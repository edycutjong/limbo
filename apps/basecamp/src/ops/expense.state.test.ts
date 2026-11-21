import { describe, expect, it } from 'vitest';
import type { Op } from '../../../../skeleton/src/core/types.ts';
import { amountOf, firstAdd, initialMembers, memberInvariant, present, sharesOf, type AddPayload } from './expense.state.ts';

let n = 0;
function mk<P>(r: string, l: number, deps: Record<string, number>, payload: P, op = 'x'): Op<P> {
  n += 1;
  return { id: `${r}:${n}`, op, target: 'e', payload, stamp: { l, r, n }, deps };
}
const add = (member: string, op: Op) => ({ member, op });

describe('present', () => {
  it('drops an add that a remove observed', () => {
    const a = mk('a', 1, {}, {});
    const r = mk('b', 2, { a: a.stamp.n }, {});
    expect(present([add('dewi', a)], [add('dewi', r)])).toEqual([]);
  });
  it('keeps an add concurrent with a remove', () => {
    const a = mk('a', 1, {}, {});
    const r = mk('b', 1, {}, {});
    expect(present([add('dewi', a)], [add('dewi', r)])).toEqual(['dewi']);
  });
  it('collapses duplicate adds and sorts', () => {
    const a1 = mk('a', 1, {}, {});
    const a2 = mk('b', 1, {}, {});
    expect(present([add('sari', a1), add('budi', a1), add('sari', a2)], [])).toEqual(['budi', 'sari']);
  });
  it('a remove before an add (not observed) does not remove it', () => {
    const r = mk('b', 1, {}, {});
    const a = mk('a', 2, {}, {});
    expect(present([add('dewi', a)], [add('dewi', r)])).toEqual(['dewi']);
  });
  it('a remove of one member leaves the others', () => {
    const a = mk('a', 1, {}, {});
    const r = mk('a', 2, { a: a.stamp.n }, {});
    expect(present([add('sari', a), add('dewi', a)], [add('dewi', r)])).toEqual(['sari']);
  });
});

describe('amount and shares', () => {
  it('uses the lowest-stamp expense.add and an observing setAmount beats it', () => {
    const first = mk<AddPayload>('seed', 1, {}, { label: 'Gas', amountCents: 1200, payer: 'sari', members: ['sari', 'budi'] });
    const later = mk<AddPayload>('b', 5, {}, { label: 'X', amountCents: 1, payer: 'b', members: [] });
    expect(firstAdd([later, first])).toBe(first);
    const set = mk('a', 0, { seed: first.stamp.n }, { amountCents: 2600 });
    expect(amountOf(first, [set]).value?.amountCents).toBe(2600);
    expect(present(initialMembers(first), [])).toEqual(['budi', 'sari']);
  });
  it('splits cents and reports the unallocated amount with no members', () => {
    expect(sharesOf(2500, ['budi', 'dewi', 'sari']).shares).toEqual({ budi: 834, dewi: 833, sari: 833 });
    expect(sharesOf(2500, [])).toEqual({ shares: {}, unallocated: 2500 });
  });
});

describe('memberInvariant', () => {
  it('accepts an empty state and string members', () => {
    const a = mk('a', 1, {}, { member: 'sari' });
    expect(memberInvariant({})).toBe(true);
    expect(memberInvariant({ memberAdds: { [a.id]: a }, memberRemoves: {} })).toBe(true);
  });
  it('rejects a non-string member in an add or a remove', () => {
    const bad = mk('a', 1, {}, { member: 5 as unknown as string });
    expect(memberInvariant({ memberAdds: { [bad.id]: bad } })).toBe(`op ${bad.id} has a non-string member`);
    expect(memberInvariant({ memberRemoves: { [bad.id]: bad } })).toBe(`op ${bad.id} has a non-string member`);
  });
});
