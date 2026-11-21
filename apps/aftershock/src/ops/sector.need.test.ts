import { describe, expect, it } from 'vitest';
import type { Op } from '../../../../skeleton/src/core/types.ts';
import needOp from './sector.need.op.ts';
import unneedOp from './sector.unneed.op.ts';
import { present } from './sector.state.ts';

function mk(r: string, n: number, l: number, deps: Record<string, number>, need = 'water'): Op {
  return { id: `${r}:${n}`, op: 'x', target: 'C3', payload: { need }, stamp: { l, r, n }, deps };
}
const adds = (...os: Op[]) => os.map((op) => ({ need: (op.payload as { need: string }).need, op }));

describe('needs (add-wins)', () => {
  it('declares commutes and add-remove on needs', () => {
    for (const d of [needOp, unneedOp]) {
      expect(d.merge).toBe('commutes');
      expect(d.intent).toEqual({ kind: 'add-remove', field: 'needs' });
    }
    expect(needOp.name).toBe('sector.need');
    expect(unneedOp.name).toBe('sector.unneed');
  });
  it('an unneed that observed the add removes it', () => {
    const a = mk('a', 1, 1, {});
    expect(present(adds(a), adds(mk('b', 1, 2, { a: 1 })))).toEqual([]);
  });
  it('an add concurrent with an unneed survives', () => {
    const a = mk('a', 1, 1, {});
    expect(present(adds(a), adds(mk('b', 1, 1, {})))).toEqual(['water']);
  });
  it('duplicate adds give one entry', () => {
    const a = mk('a', 1, 1, {});
    const a2 = mk('a', 2, 2, { a: 1 });
    expect(present(adds(a, a2), [])).toEqual(['water']);
  });
  it('an unneed before any add does not hide a later add', () => {
    const u = mk('b', 1, 1, {});
    const a = mk('a', 1, 2, { b: 1 });
    expect(present(adds(a), adds(u))).toEqual(['water']);
    expect(present([], adds(u))).toEqual([]);
  });
  it('apply is idempotent', () => {
    const o = mk('a', 1, 1, {});
    const once = needOp.apply!({}, o as never);
    expect(needOp.apply!(once, o as never)).toEqual(once);
  });
});
