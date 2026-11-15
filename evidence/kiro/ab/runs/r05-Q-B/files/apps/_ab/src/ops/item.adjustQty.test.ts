import { describe, expect, it } from 'vitest';
import type { Op } from '../../../../skeleton/src/core/types.ts';
import def, { adjustQtyPayload, qtyOf } from './item.adjustQty.op.ts';

const op = (r: string, n: number, by: number, target = 'i1'): Op =>
  ({ id: `${r}:${n}`, op: 'item.adjustQty', target, payload: adjustQtyPayload({}, target, by), stamp: { l: n, r, n }, deps: {} });
const apply = (s: unknown, o: Op) => def.apply!(s, o);

describe('item.adjustQty', () => {
  it('shows 0 for a never-adjusted item', () => {
    expect(qtyOf({}, 'i1')).toBe(0);
  });

  it('two concurrent +1 adjustments both count, in either order', () => {
    const a = op('a', 1, 1);
    const b = op('b', 1, 1);
    expect(qtyOf(apply(apply({}, a), b), 'i1')).toBe(2);
    expect(qtyOf(apply(apply({}, b), a), 'i1')).toBe(2);
  });

  it('supports negative adjustments and keeps items separate', () => {
    const s = apply(apply(apply({}, op('a', 1, 3)), op('a', 2, -1)), op('a', 3, 5, 'i2'));
    expect(qtyOf(s, 'i1')).toBe(2);
    expect(qtyOf(s, 'i2')).toBe(5);
  });

  it('is idempotent and does not mutate its input', () => {
    const o = op('a', 1, 4);
    const s0 = {};
    const s1 = apply(s0, o);
    expect(s0).toEqual({});
    expect(apply(s1, o)).toEqual(s1);
    expect(qtyOf(apply(s1, o), 'i1')).toBe(4);
  });

  it('payload carries the change only and rejects non-whole numbers', () => {
    expect(adjustQtyPayload({ adjustments: { i1: { 'a:1': 9 } } }, 'i1', 1)).toEqual({ by: 1 });
    expect(() => adjustQtyPayload({}, 'i1', 1.5)).toThrow();
  });
});
