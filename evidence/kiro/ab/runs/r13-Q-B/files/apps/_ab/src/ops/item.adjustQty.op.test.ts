import { describe, expect, it } from 'vitest';
import def, { adjustQtyPayload, qtyOf } from './item.adjustQty.op.ts';
import type { Op } from '../../../../skeleton/src/core/types.ts';

const mk = (r: string, n: number, target: string, payload: unknown): Op => ({
  id: `${r}:${n}`,
  op: 'item.adjustQty',
  target,
  payload,
  stamp: { l: n, r, n },
  deps: {},
});
const run = (ops: Op[]) => ops.reduce((s, o) => def.apply!(s, o), {} as unknown);

describe('item.adjustQty', () => {
  it('declares commutes + delta matching intents.json', () => {
    expect(def.merge).toBe('commutes');
    expect(def.intent).toEqual({ kind: 'delta', field: 'qty' });
  });

  it('shows 0 for an item never adjusted', () => {
    expect(qtyOf({}, 'i1')).toBe(0);
  });

  it('two concurrent +1 both count, in either order', () => {
    const a = mk('a', 1, 'i1', adjustQtyPayload({}, 'i1', 1));
    const b = mk('b', 1, 'i1', adjustQtyPayload({}, 'i1', 1));
    expect(qtyOf(run([a, b]), 'i1')).toBe(2);
    expect(qtyOf(run([b, a]), 'i1')).toBe(2);
  });

  it('supports up and down, and keeps items separate', () => {
    const s = run([mk('a', 1, 'i1', { by: 3 }), mk('a', 2, 'i1', { by: -1 }), mk('a', 3, 'i2', { by: 5 })]);
    expect(qtyOf(s, 'i1')).toBe(2);
    expect(qtyOf(s, 'i2')).toBe(5);
  });

  it('is idempotent and does not mutate its input', () => {
    const o = mk('a', 1, 'i1', { by: 2 });
    const s1 = def.apply!({}, o);
    const frozen = JSON.stringify(s1);
    const s2 = def.apply!(s1, o);
    expect(qtyOf(s2, 'i1')).toBe(2);
    expect(JSON.stringify(s1)).toBe(frozen);
  });

  it('payload carries only the delta and rejects non-integers', () => {
    expect(adjustQtyPayload({ qtys: { i1: { applied: {}, qty: 9 } } }, 'i1', 1)).toEqual({ by: 1 });
    expect(() => adjustQtyPayload({}, 'i1', 0.5)).toThrow(RangeError);
  });

  it('invariant holds after applying ops', () => {
    expect(def.invariant!(run([mk('a', 1, 'i1', { by: 4 }), mk('b', 1, 'i1', { by: -7 })]))).toBe(true);
  });
});
