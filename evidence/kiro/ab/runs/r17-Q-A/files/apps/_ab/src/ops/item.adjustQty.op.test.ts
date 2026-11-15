import fc from 'fast-check';
import { describe, expect, it } from 'vitest';
import type { Op } from '../../../../skeleton/src/core/types.ts';
import def, { adjustQtyPayload, qtyOf } from './item.adjustQty.op.ts';

function mk(r: string, n: number, target: string, by: number): Op {
  return {
    id: `${r}:${n}`,
    op: 'item.adjustQty',
    target,
    payload: adjustQtyPayload({}, target, by),
    stamp: { l: n, r, n },
    deps: {},
  };
}
const run = (ops: Op[]) => ops.reduce((s, o) => def.apply!(s, o), {} as unknown);

describe('item.adjustQty', () => {
  it('shows 0 for a never-adjusted item', () => {
    expect(qtyOf({}, 'i1')).toBe(0);
  });

  it('two concurrent +1 both count', () => {
    const s = run([mk('a', 1, 'i1', 1), mk('b', 1, 'i1', 1)]);
    expect(qtyOf(s, 'i1')).toBe(2);
  });

  it('does not mutate its input', () => {
    const s0 = run([mk('a', 1, 'i1', 3)]);
    const snap = JSON.stringify(s0);
    def.apply!(s0, mk('b', 1, 'i1', 1));
    expect(JSON.stringify(s0)).toBe(snap);
  });

  it('rejects non-whole numbers', () => {
    expect(() => adjustQtyPayload({}, 'i1', 0.5)).toThrow();
  });

  it('any order gives the same quantity (sum of deltas)', () => {
    fc.assert(
      fc.property(fc.array(fc.integer({ min: -50, max: 50 }), { maxLength: 12 }), (bys) => {
        const ops = bys.map((b, i) => mk(i % 2 ? 'a' : 'b', i + 1, 'i1', b));
        const fwd = run(ops);
        const rev = run([...ops].reverse());
        const expected = bys.reduce((x, y) => x + y, 0);
        expect(qtyOf(fwd, 'i1')).toBe(expected);
        expect(qtyOf(rev, 'i1')).toBe(expected);
      }),
    );
  });
});
