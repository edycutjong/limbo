import fc from 'fast-check';
import { describe, expect, it } from 'vitest';
import type { Op } from '../../../../skeleton/src/core/types.ts';
import def, { adjustQtyPayload, qtyOf } from './item.adjustQty.op.ts';

function mk(r: string, n: number, by: number, target = 'i1'): Op {
  return { id: `${r}:${n}`, op: 'item.adjustQty', target, payload: adjustQtyPayload({}, target, by), stamp: { l: n, r, n }, deps: {} };
}
const run = (ops: Op[]) => ops.reduce((s, o) => def.apply!(s, o), {} as unknown);

describe('item.adjustQty', () => {
  it('shows 0 for a never-adjusted item', () => {
    expect(qtyOf({}, 'i1')).toBe(0);
  });

  it('applies +3 then -1', () => {
    expect(qtyOf(run([mk('a', 1, 3), mk('a', 2, -1)]), 'i1')).toBe(2);
  });

  it('keeps both concurrent +1 adjustments', () => {
    expect(qtyOf(run([mk('a', 1, 1), mk('b', 1, 1)]), 'i1')).toBe(2);
  });

  it('does not mutate its input and keeps items separate', () => {
    const s0 = run([mk('a', 1, 2)]);
    const snap = JSON.stringify(s0);
    const s1 = def.apply!(s0, mk('a', 2, 5, 'i2'));
    expect(JSON.stringify(s0)).toBe(snap);
    expect(qtyOf(s1, 'i1')).toBe(2);
    expect(qtyOf(s1, 'i2')).toBe(5);
  });

  it('rejects non-integer deltas', () => {
    expect(() => adjustQtyPayload({}, 'i1', 0.5)).toThrow();
  });

  it('converges for any order and duplicates', () => {
    fc.assert(
      fc.property(fc.array(fc.integer({ min: -50, max: 50 }), { maxLength: 12 }), fc.nat(), (deltas, seed) => {
        const ops = deltas.map((d, i) => mk(i % 2 ? 'a' : 'b', i + 1, d));
        const shuffled = [...ops, ...ops.slice(0, seed % (ops.length + 1))].sort(
          (x, y) => ((x.stamp.n * 7919 + seed) % 13) - ((y.stamp.n * 7919 + seed) % 13),
        );
        const sum = deltas.reduce((a, b) => a + b, 0);
        expect(qtyOf(run(ops), 'i1')).toBe(sum);
        expect(qtyOf(run(shuffled), 'i1')).toBe(sum);
      }),
    );
  });
});
