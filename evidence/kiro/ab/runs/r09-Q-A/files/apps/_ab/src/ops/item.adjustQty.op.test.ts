import { describe, expect, it } from 'vitest';
import type { Op } from '../../../../skeleton/src/core/types.ts';
import def, { adjustQtyPayload, qtyOf } from './item.adjustQty.op.ts';

function mk(r: string, n: number, target: string, by: number): Op {
  return { id: `${r}:${n}`, op: 'item.adjustQty', target, payload: adjustQtyPayload({}, target, by), stamp: { l: n, r, n }, deps: {} };
}
const run = (ops: Op[]) => ops.reduce((s, o) => def.apply!(s, o), {} as unknown);

describe('item.adjustQty', () => {
  it('shows 0 for a never-adjusted item', () => {
    expect(qtyOf({}, 'a')).toBe(0);
  });

  it('applies up and down adjustments', () => {
    expect(qtyOf(run([mk('A', 1, 'a', 3), mk('A', 2, 'a', 1), mk('A', 3, 'a', -2)]), 'a')).toBe(2);
  });

  it('keeps concurrent +1 taps from two devices', () => {
    const x = mk('A', 1, 'a', 1);
    const y = mk('B', 1, 'a', 1);
    expect(qtyOf(run([x, y]), 'a')).toBe(2);
    expect(qtyOf(run([y, x]), 'a')).toBe(2);
  });

  it('ignores a redelivered op and does not mutate input', () => {
    const x = mk('A', 1, 'a', 1);
    const s1 = run([x]);
    const snap = JSON.stringify(s1);
    const s2 = def.apply!(s1, x);
    expect(JSON.stringify(s1)).toBe(snap);
    expect(qtyOf(s2, 'a')).toBe(1);
  });

  it('rejects fractional deltas', () => {
    expect(() => adjustQtyPayload({}, 'a', 0.5)).toThrow();
  });
});
