import { describe, expect, it } from 'vitest';
import count from './sector.count.op.ts';
import note from './sector.note.op.ts';
import type { Op } from '../../../../skeleton/src/core/types.ts';

const mk = (id: string, target: string, payload: unknown, l: number): Op => ({
  id, op: 'x', target, payload, stamp: { l, r: 'a#1', n: l }, deps: {},
});
// Built by hand: apply cannot hold a float (canonical rejects it), so the invariant is checked on the state shape directly.
const inv = (def: typeof count, target: string, payload: { count?: number; note?: string }) => {
  const w = mk('a#1:1', target, payload, 1);
  const key = 'count' in payload ? 'counts' : 'notes';
  const field = 'count' in payload ? 'count' : 'note';
  return def.invariant!({ [key]: { [target]: { writes: { [w.id]: w }, [field]: (payload as Record<string, unknown>)[field] } } });
};

describe('sector.count / sector.note', () => {
  it('re-derives the value by stamp, ignoring order and duplicates', () => {
    const w1 = mk('a#1:1', 'C3#sari', { count: 2 }, 1);
    const w2 = mk('b#1:1', 'C3#sari', { count: 3 }, 2);
    let s: unknown = {};
    for (const o of [w2, w1, w2]) s = count.apply!(s, o);
    expect((s as { counts: Record<string, { count: number }> }).counts['C3#sari']!.count).toBe(3);
  });
  it('count invariant rejects a float, a negative and 100001, accepts the bounds', () => {
    for (const bad of [2.5, -1, 100001]) expect(inv(count, 'C3#sari', { count: bad })).not.toBe(true);
    for (const ok of [0, 100000]) expect(inv(count, 'C3#sari', { count: ok })).toBe(true);
  });
  it('note invariant rejects 281 characters, accepts 280', () => {
    expect(inv(note, 'C3', { note: 'x'.repeat(281) })).not.toBe(true);
    expect(inv(note, 'C3', { note: 'x'.repeat(280) })).toBe(true);
  });
});
