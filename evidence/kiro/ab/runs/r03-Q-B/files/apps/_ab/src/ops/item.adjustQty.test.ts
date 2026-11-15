import { describe, expect, it } from 'vitest';
import type { Op } from '../../../../skeleton/src/core/types.ts';
import def, { adjustQtyPayload, qtyOf } from './item.adjustQty.op.ts';

const mk = (r: string, n: number, target: string, by: number): Op => ({
  id: `${r}:${n}`,
  op: 'item.adjustQty',
  target,
  payload: adjustQtyPayload({}, target, by),
  stamp: { l: n, r, n },
  deps: {},
});

describe('item.adjustQty', () => {
  it('shows 0 for an item never adjusted (R1.3)', () => {
    expect(qtyOf({}, 'i1')).toBe(0);
  });

  it('two concurrent +1 adjustments count twice, in either order (R1.2, R1.3)', () => {
    const a = mk('a', 1, 'i1', 1);
    const b = mk('b', 1, 'i1', 1);
    const ab = def.apply!(def.apply!({}, a), b);
    const ba = def.apply!(def.apply!({}, b), a);
    expect(qtyOf(ab, 'i1')).toBe(2);
    expect(ab).toEqual(ba);
  });

  it('supports negative adjustments and keeps items separate (R1.1)', () => {
    let s: unknown = {};
    s = def.apply!(s, mk('a', 1, 'i1', 3));
    s = def.apply!(s, mk('a', 2, 'i1', -1));
    s = def.apply!(s, mk('a', 3, 'i2', 5));
    expect(qtyOf(s, 'i1')).toBe(2);
    expect(qtyOf(s, 'i2')).toBe(5);
  });

  it('is idempotent and does not mutate its input', () => {
    const op = mk('a', 1, 'i1', 4);
    const s0 = {};
    const s1 = def.apply!(s0, op);
    expect(s0).toEqual({});
    expect(def.apply!(s1, op)).toEqual(s1);
    expect(qtyOf(def.apply!(s1, op), 'i1')).toBe(4);
  });

  it('rejects a non-whole-number adjustment', () => {
    expect(() => adjustQtyPayload({}, 'i1', 1.5)).toThrow();
    expect(() => adjustQtyPayload({}, 'i1', NaN)).toThrow();
  });
});
