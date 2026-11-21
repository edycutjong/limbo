import { describe, expect, it } from 'vitest';
import type { Op } from '../../../../skeleton/src/core/types.ts';
 import def from './item.rename.op.ts';

function mk<P>(r: string, n: number, l: number, deps: Record<string, number>, payload: P, target = 't'): Op<P> {
  return { id: `${r}:${n}`, op: 'x', target, payload, stamp: { l, r, n }, deps };
}

const apply = def.apply!;
const inv = def.invariant!;
type S = { names: Record<string, { name: string | undefined }> };

describe('item.rename', () => {
  it('declares causal-lww with the set intent on name', () => {
    expect([def.merge, def.intent]).toEqual(['causal-lww', { kind: 'set', field: 'name' }]);
  });
  it('a rename that observed another wins, and applying it twice gives the same state', () => {
    const r1 = mk('a', 1, 1, {}, { name: 'Tent' });
    const r2 = mk('b', 1, 2, { a: 1 }, { name: 'Big tent' });
    const s = apply(apply({}, r1), r2) as S;
    expect(s.names.t!.name).toBe('Big tent');
    expect(apply(s, r2)).toEqual(s);
    expect(apply(apply({}, r2), r1)).toEqual(s);
  });
  it('accepts an empty state and a valid name', () => {
    expect(inv({})).toBe(true);
    expect(inv(apply({}, mk('a', 1, 1, {}, { name: 'Tent' })))).toBe(true);
  });
  it('rejects a converged name that is not a string', () => {
    expect(inv(apply({}, mk('a', 1, 1, {}, { name: 4 as unknown as string })))).toBe('target t has a non-string name');
  });
  it('rejects a recorded write whose name is not a string', () => {
    const bad = mk('a', 1, 1, {}, { name: 4 as unknown as string });
    expect(inv({ names: { t: { name: 'ok', writes: { [bad.id]: bad } } } })).toBe('write a:1 is not a string');
  });
});
