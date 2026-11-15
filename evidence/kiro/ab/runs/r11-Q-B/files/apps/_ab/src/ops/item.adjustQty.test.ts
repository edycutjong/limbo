import { describe, expect, it } from 'vitest';
import def, { adjustQtyPayload, qtyOf } from './item.adjustQty.op.ts';
import type { Op } from '../../../../skeleton/src/core/types.ts';

const mk = (r: string, n: number, target: string, by: number): Op =>
  ({ id: `${r}:${n}`, op: 'item.adjustQty', target, payload: adjustQtyPayload({}, target, by), stamp: { l: n, r, n }, deps: {} }) as Op;

describe('item.adjustQty', () => {
  it('declares commutes + delta qty', () => {
    expect(def.merge).toBe('commutes');
    expect(def.intent).toEqual({ kind: 'delta', field: 'qty' });
  });
  it('shows 0 for a never-adjusted item', () => {
    expect(qtyOf({}, 'x')).toBe(0);
  });
  it('two concurrent +1 give +2, in either order', () => {
    const a = mk('a', 1, 'x', 1);
    const b = mk('b', 1, 'x', 1);
    const ab = def.apply!(def.apply!({}, a), b);
    const ba = def.apply!(def.apply!({}, b), a);
    expect(qtyOf(ab, 'x')).toBe(2);
    expect(qtyOf(ba, 'x')).toBe(2);
  });
  it('negative adjustments subtract; targets are independent', () => {
    let s = def.apply!({}, mk('a', 1, 'x', 3));
    s = def.apply!(s, mk('a', 2, 'x', -1));
    s = def.apply!(s, mk('a', 3, 'y', 4));
    expect(qtyOf(s, 'x')).toBe(2);
    expect(qtyOf(s, 'y')).toBe(4);
  });
  it('is idempotent and does not mutate its input', () => {
    const s0 = def.apply!({}, mk('a', 1, 'x', 1));
    const snap = JSON.stringify(s0);
    const o = mk('b', 1, 'x', 2);
    const s1 = def.apply!(s0, o);
    expect(JSON.stringify(s0)).toBe(snap);
    expect(qtyOf(def.apply!(s1, o), 'x')).toBe(3);
    expect(def.invariant!(s1)).toBe(true);
  });
  it('rejects non-integer adjustments', () => {
    expect(() => adjustQtyPayload({}, 'x', 0.5)).toThrow();
    expect(() => def.apply!({}, { ...mk('a', 1, 'x', 1), payload: { by: 1.5 } })).toThrow();
  });
});
