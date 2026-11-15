import { describe, expect, it } from 'vitest';
import fc from 'fast-check';
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
const run = (ops: Op[]) => ops.reduce<unknown>((s, o) => def.apply!(s, o), {});

describe('item.adjustQty', () => {
  it('shows 0 for a never-adjusted item', () => {
    expect(qtyOf({}, 'a')).toBe(0);
  });

  it('adjusts up and down', () => {
    expect(qtyOf(run([mk('A', 1, 'a', 3), mk('A', 2, 'a', 1), mk('A', 3, 'a', -2)]), 'a')).toBe(2);
  });

  it('keeps concurrent +1s from two devices', () => {
    expect(qtyOf(run([mk('A', 1, 'a', 1), mk('B', 1, 'a', 1)]), 'a')).toBe(2);
  });

  it('does not mutate its input and ignores a redelivered op', () => {
    const s0 = run([mk('A', 1, 'a', 1)]);
    const snap = JSON.stringify(s0);
    const s1 = def.apply!(s0, mk('B', 1, 'a', 1));
    expect(JSON.stringify(s0)).toBe(snap);
    expect(qtyOf(def.apply!(s1, mk('B', 1, 'a', 1)), 'a')).toBe(2);
  });

  it('rejects non-integer adjustments', () => {
    expect(() => adjustQtyPayload({}, 'a', 1.5)).toThrow();
  });

  it('converges in any order', () => {
    fc.assert(
      fc.property(fc.array(fc.integer({ min: -5, max: 5 }), { maxLength: 8 }), (bys) => {
        const ops = bys.map((b, i) => mk(i % 2 ? 'A' : 'B', i + 1, 'a', b));
        expect(qtyOf(run([...ops].reverse()), 'a')).toBe(qtyOf(run(ops), 'a'));
        expect(qtyOf(run(ops), 'a')).toBe(bys.reduce((a, b) => a + b, 0));
      }),
    );
  });
});
