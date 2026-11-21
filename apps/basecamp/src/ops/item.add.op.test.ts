import { describe, expect, it } from 'vitest';
import type { Op } from '../../../../skeleton/src/core/types.ts';
 import def from './item.add.op.ts';
import type { AddPayload } from './item.add.op.ts';

function mk<P>(r: string, n: number, l: number, deps: Record<string, number>, payload: P, target = 't'): Op<P> {
  return { id: `${r}:${n}`, op: 'x', target, payload, stamp: { l, r, n }, deps };
}

const p: AddPayload = { name: 'Tent', units: 2, key: 'a0' };
const apply = def.apply!;
const inv = def.invariant!;

describe('item.add', () => {
  it('declares commutes with the create intent', () => {
    expect([def.merge, def.intent]).toEqual(['commutes', { kind: 'create' }]);
  });
  it('keeps two adds and applying one twice gives the same state', () => {
    const a = mk('a', 1, 1, {}, p, 'i1');
    const b = mk('b', 1, 1, {}, { ...p, name: 'Pan' }, 'i2');
    const s = apply(apply({}, a), b);
    expect(Object.keys((s as { adds: object }).adds)).toEqual(['a:1', 'b:1']);
    expect(apply(s, a)).toEqual(s);
    expect(apply(apply({}, b), a)).toEqual(s);
  });
  it('accepts an empty state and a valid add', () => {
    expect(inv({})).toBe(true);
    expect(inv(apply({}, mk('a', 1, 1, {}, p)))).toBe(true);
  });
  it('rejects units that are zero or not an integer', () => {
    expect(inv(apply({}, mk('a', 1, 1, {}, { ...p, units: 0 })))).toMatch(/units 0/);
    expect(inv(apply({}, mk('a', 1, 1, {}, { ...p, units: 1.5 })))).toMatch(/units 1.5/);
  });
  it('rejects a non-string name or key', () => {
    expect(inv(apply({}, mk('a', 1, 1, {}, { ...p, name: 3 as unknown as string })))).toMatch(/non-string name or key/);
    expect(inv(apply({}, mk('a', 1, 1, {}, { ...p, key: 3 as unknown as string })))).toMatch(/non-string name or key/);
  });
});
