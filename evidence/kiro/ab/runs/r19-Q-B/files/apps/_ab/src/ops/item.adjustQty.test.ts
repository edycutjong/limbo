import { describe, expect, it } from 'vitest';
import type { Op } from '../../../../skeleton/src/core/types.ts';
import def, { adjustQtyPayload, qtyOf, type AdjustQtyPayload } from './item.adjustQty.op.ts';

const mk = (r: string, n: number, by: number, target = 'i1'): Op<AdjustQtyPayload> => ({
  id: `${r}:${n}`,
  op: 'item.adjustQty',
  target,
  payload: { by },
  stamp: { l: n, r, n },
  deps: {},
});
const run = (ops: Op<AdjustQtyPayload>[]): unknown => {
  let s: unknown = {};
  for (const o of ops) s = def.apply!(s, o as Op);
  return s;
};

describe('item.adjustQty', () => {
  it('shows 0 for an item never adjusted (R1.3)', () => {
    expect(qtyOf({}, 'i1')).toBe(0);
  });

  it('two concurrent +1 give +2, in either order (R1.2, R1.3)', () => {
    const a = mk('a', 1, 1);
    const b = mk('b', 1, 1);
    expect(qtyOf(run([a, b]), 'i1')).toBe(2);
    expect(qtyOf(run([b, a]), 'i1')).toBe(2);
  });

  it('adjusts up and down by whole numbers and does not mutate input (R1.1)', () => {
    const s0 = {};
    const s1 = def.apply!(s0, mk('a', 1, 3) as Op);
    expect(s0).toEqual({});
    expect(qtyOf(def.apply!(s1, mk('a', 2, -1) as Op), 'i1')).toBe(2);
  });

  it('payload carries the change, not the shown quantity, and rejects non-integers (R1.1)', () => {
    expect(adjustQtyPayload({ qty: { i1: 5 } }, 'i1', 1)).toEqual({ by: 1 });
    expect(() => adjustQtyPayload({}, 'i1', 0.5)).toThrow();
  });
});
