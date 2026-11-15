import fc from 'fast-check';
import { describe, expect, it } from 'vitest';
import type { Op } from '../../../../skeleton/src/core/types.ts';
import def, { adjustQtyPayload, qtyOf } from './item.adjustQty.op.ts';

let seq = 0;
function mk(r: string, item: string, by: number): Op {
  seq += 1;
  return { id: `${r}:${seq}`, op: 'item.adjustQty', target: item, payload: adjustQtyPayload({}, item, by), stamp: { l: seq, r, n: seq }, deps: {} };
}
const fold = (ops: Op[]) => ops.reduce((s, o) => def.apply!(s, o), {} as unknown);

describe('item.adjustQty', () => {
  it('shows 0 for a never-adjusted item', () => {
    expect(qtyOf({}, 'a')).toBe(0);
  });

  it('adjusts up and down', () => {
    const s = fold([mk('A', 'a', 3), mk('A', 'a', 1), mk('A', 'a', -2)]);
    expect(qtyOf(s, 'a')).toBe(2);
  });

  it('keeps both concurrent +1 adjustments', () => {
    const s = fold([mk('A', 'a', 3), mk('A', 'a', 1), mk('B', 'a', 1)]);
    expect(qtyOf(s, 'a')).toBe(5);
  });

  it('does not mutate its input and keeps items separate', () => {
    const s0 = fold([mk('A', 'a', 1)]);
    const snap = JSON.stringify(s0);
    const s1 = def.apply!(s0, mk('A', 'b', 4));
    expect(JSON.stringify(s0)).toBe(snap);
    expect(qtyOf(s1, 'a')).toBe(1);
    expect(qtyOf(s1, 'b')).toBe(4);
  });

  it('rejects non-whole numbers', () => {
    expect(() => adjustQtyPayload({}, 'a', 1.5)).toThrow(RangeError);
    expect(() => adjustQtyPayload({}, 'a', NaN)).toThrow(RangeError);
  });

  it('converges for any order (property)', () => {
    fc.assert(
      fc.property(
        fc.array(fc.tuple(fc.constantFrom('A', 'B', 'C'), fc.constantFrom('x', 'y'), fc.integer({ min: -50, max: 50 })), { maxLength: 20 }),
        fc.nat(),
        (specs, k) => {
          const ops = specs.map(([r, i, by]) => mk(r, i, by));
          const shuffled = [...ops].sort((a, b) => ((a.stamp.n * 31 + k) % 7) - ((b.stamp.n * 31 + k) % 7));
          const a = fold(ops);
          const b = fold(shuffled.reverse());
          for (const i of ['x', 'y']) expect(qtyOf(b, i)).toBe(qtyOf(a, i));
          expect(def.invariant!(a)).toBe(true);
        },
      ),
    );
  });
});
