import { describe, expect, it } from 'vitest';
import type { Op } from '../../../../skeleton/src/core/types.ts';
 import { applyLife, lifeInvariant, type LifeState } from './item.life.ts';

function mk<P>(r: string, n: number, l: number, deps: Record<string, number>, payload: P, target = 't'): Op<P> {
  return { id: `${r}:${n}`, op: 'x', target, payload, stamp: { l, r, n }, deps };
}

describe('item.life', () => {
  it('delete then an unobserved restore is alive, and applying a delete twice gives the same state', () => {
    const d = mk('a', 1, 1, {}, {});
    const once = applyLife({}, 'delete', d);
    expect(once.life!.t!.life).toBe('deleted');
    expect(applyLife(once, 'delete', d)).toEqual(once);
    const back = applyLife(once, 'restore', mk('a', 2, 2, { a: 1 }, {}));
    expect(back.life!.t!.life).toBe('alive');
  });
  it('accepts an empty state and every known life value', () => {
    expect(lifeInvariant({})).toBe(true);
    for (const life of ['alive', 'deleted', 'twin'] as const) {
      expect(lifeInvariant({ life: { t: { ops: {}, life } } })).toBe(true);
    }
  });
  it('rejects an unknown life value', () => {
    const s = { life: { t: { ops: {}, life: 'gone' } } } as unknown as LifeState;
    expect(lifeInvariant(s)).toBe('target t has life gone');
  });
});
