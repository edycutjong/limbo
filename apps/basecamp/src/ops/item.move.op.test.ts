import { describe, expect, it } from 'vitest';
import type { Op } from '../../../../skeleton/src/core/types.ts';
 import def from './item.move.op.ts';

function mk<P>(r: string, n: number, l: number, deps: Record<string, number>, payload: P, target = 't'): Op<P> {
  return { id: `${r}:${n}`, op: 'x', target, payload, stamp: { l, r, n }, deps };
}

const apply = def.apply!;
const inv = def.invariant!;
type S = { moves: Record<string, { key: string }> };

describe('item.move', () => {
  it('declares ordered-move with the move intent', () => {
    expect([def.merge, def.intent]).toEqual(['ordered-move', { kind: 'move' }]);
  });
  it('a move that observed another wins, and applying it twice gives the same state', () => {
    const m1 = mk('a', 1, 1, {}, { key: 'a0a' });
    const m2 = mk('b', 1, 2, { a: 1 }, { key: 'a1b' });
    const s = apply(apply({}, m1), m2) as S;
    expect(s.moves.t!.key).toBe('a1b');
    expect(apply(s, m2)).toEqual(s);
    expect(apply(apply({}, m2), m1)).toEqual(s);
  });
  it('accepts an empty state and a valid move', () => {
    expect(inv({})).toBe(true);
    expect(inv(apply({}, mk('a', 1, 1, {}, { key: 'a0' })))).toBe(true);
  });
  it('rejects a converged key that is not a string', () => {
    expect(inv(apply({}, mk('a', 1, 1, {}, { key: 7 as unknown as string })))).toBe('target t has a non-string key');
  });
  it('rejects a recorded write whose key is not a string', () => {
    const bad = mk('a', 1, 1, {}, { key: null as unknown as string });
    expect(inv({ moves: { t: { key: 'a0', writes: { [bad.id]: bad } } } })).toBe('move a:1 has a non-string key');
  });
});
