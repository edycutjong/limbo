import { describe, expect, it } from 'vitest';
import type { Op } from '../../../../skeleton/src/core/types.ts';
 import def from './item.tick.op.ts';

function mk<P>(r: string, n: number, l: number, deps: Record<string, number>, payload: P, target = 't'): Op<P> {
  return { id: `${r}:${n}`, op: 'x', target, payload, stamp: { l, r, n }, deps };
}

const apply = def.apply!;
const inv = def.invariant!;
type S = { ticks: Record<string, { ticked: boolean }> };

describe('item.tick', () => {
  it('declares causal-lww with the set intent on ticked', () => {
    expect([def.merge, def.intent]).toEqual(['causal-lww', { kind: 'set', field: 'ticked' }]);
  });
  it('a tick that observed another wins, and applying it twice gives the same state', () => {
    const t1 = mk('a', 1, 1, {}, { ticked: true });
    const t2 = mk('b', 1, 2, { a: 1 }, { ticked: false });
    const s = apply(apply({}, t1), t2) as S;
    expect(s.ticks.t!.ticked).toBe(false);
    expect(apply(s, t2)).toEqual(s);
    expect(apply(apply({}, t2), t1)).toEqual(s);
  });
  it('accepts an empty state and a valid tick', () => {
    expect(inv({})).toBe(true);
    expect(inv(apply({}, mk('a', 1, 1, {}, { ticked: true })))).toBe(true);
  });
  it('rejects a converged value that is not a boolean', () => {
    expect(inv({ ticks: { t: { ticked: 1 as unknown as boolean, writes: {} } } })).toBe('target t has a non-boolean ticked');
  });
  it('rejects a recorded write whose value is not a boolean', () => {
    const bad = mk('a', 1, 1, {}, { ticked: 'yes' as unknown as boolean });
    expect(inv({ ticks: { t: { ticked: true, writes: { [bad.id]: bad } } } })).toBe('write a:1 is not a boolean');
  });
});
