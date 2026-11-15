import { describe, expect, it } from 'vitest';
import { allocKey, canonical, causalBuffer, compareStamp, concurrent, covers, createOp, newReplica, observe } from './causal.ts';
import type { Op, VV } from './types.ts';

const mk = (r: string, n: number, l: number, deps: VV = {}): Op => ({
  id: `${r}:${n}`,
  op: 'x',
  target: 't',
  payload: null,
  stamp: { l, r, n },
  deps,
});

describe('compareStamp', () => {
  it('orders by l, then r, then n', () => {
    expect(compareStamp({ l: 1, r: 'z', n: 9 }, { l: 2, r: 'a', n: 1 })).toBeLessThan(0);
    expect(compareStamp({ l: 2, r: 'a', n: 9 }, { l: 2, r: 'b', n: 1 })).toBeLessThan(0);
    expect(compareStamp({ l: 2, r: 'a', n: 1 }, { l: 2, r: 'a', n: 2 })).toBeLessThan(0);
    expect(compareStamp({ l: 2, r: 'a', n: 2 }, { l: 2, r: 'a', n: 2 })).toBe(0);
  });
  it('compares r by UTF-16 code unit', () => {
    expect(compareStamp({ l: 1, r: 'B', n: 1 }, { l: 1, r: 'a', n: 1 })).toBeLessThan(0);
    // U+1F600 is the surrogate pair D83D DE00, which sorts below U+FF5E by code unit.
    expect(compareStamp({ l: 1, r: '\u{1F600}', n: 1 }, { l: 1, r: '\uFF5E', n: 1 })).toBeLessThan(0);
  });
});

describe('covers / concurrent', () => {
  const a1 = mk('a', 1, 1);
  const b1 = mk('b', 1, 1);
  const a2 = mk('a', 2, 2, { a: 1, b: 1 });
  it('truth table', () => {
    expect(covers(a2, a1)).toBe(true);
    expect(covers(a2, b1)).toBe(true);
    expect(covers(a1, a2)).toBe(false);
    expect(covers(a1, b1)).toBe(false);
    expect(concurrent(a1, b1)).toBe(true);
    expect(concurrent(a2, b1)).toBe(false);
    expect(concurrent(b1, a2)).toBe(false);
    expect(concurrent(a1, a1)).toBe(false);
  });
});

describe('createOp', () => {
  it('sets l, n, deps and id', () => {
    const rep = newReplica('a');
    const o1 = createOp(rep, { name: 'x' }, 't', 1);
    expect(o1).toMatchObject({ id: 'a:1', stamp: { l: 1, r: 'a', n: 1 }, deps: {} });
    observe(rep, mk('b', 1, 7));
    rep.vv['b'] = 1;
    const o2 = createOp(rep, { name: 'x' }, 't', 2);
    expect(o2.stamp).toEqual({ l: 8, r: 'a', n: 2 });
    expect(o2.deps).toEqual({ a: 1, b: 1 });
    expect(o1.deps).toEqual({});
  });
});

describe('canonical', () => {
  it('sorts keys, drops undefined, keeps array order', () => {
    expect(canonical({ b: 1, a: [3, 1], c: undefined, 'B': { y: 1, x: 2 } })).toBe('{"B":{"x":2,"y":1},"a":[3,1],"b":1}');
  });
  it('rejects floats', () => {
    expect(() => canonical({ a: 1.5 })).toThrow();
    expect(() => canonical(NaN)).toThrow();
  });
});

describe('causalBuffer', () => {
  const a1 = mk('a', 1, 1);
  const a2 = mk('a', 2, 2, { a: 1 });
  const b1 = mk('b', 1, 3, { a: 2 });
  it('holds and releases out-of-order ops', () => {
    const buf = causalBuffer();
    expect(buf.offer(b1)).toEqual([]);
    expect(buf.offer(a2)).toEqual([]);
    expect(buf.vv).toEqual({});
    expect(buf.offer(a1).map((o) => o.id)).toEqual(['a:1', 'a:2', 'b:1']);
    expect(buf.vv).toEqual({ a: 2, b: 1 });
    expect(buf.held()).toEqual([]);
  });
  it('ignores duplicates, applied or held', () => {
    const buf = causalBuffer();
    expect(buf.offer(a2)).toEqual([]);
    expect(buf.offer(a2)).toEqual([]);
    expect(buf.held()).toHaveLength(1);
    expect(buf.offer(a1)).toHaveLength(2);
    expect(buf.offer(a1)).toEqual([]);
    expect(buf.offer(a2)).toEqual([]);
    expect(buf.vv).toEqual({ a: 2 });
  });
  it('keeps vv contiguous when a gap exists', () => {
    const buf = causalBuffer();
    buf.offer(a1);
    buf.offer(mk('a', 3, 3, { a: 2 }));
    expect(buf.vv).toEqual({ a: 1 });
  });
});

describe('allocKey', () => {
  it('gives distinct keys for two replicas in one gap', () => {
    const ka = allocKey('a0', 'a1', 'ra-1');
    const kb = allocKey('a0', 'a1', 'rb-2');
    expect(ka).not.toBe(kb);
    for (const k of [ka, kb]) {
      expect(k > 'a0' && k < 'a1').toBe(true);
    }
  });
  it('loops when right starts with the generated key', () => {
    // generateKeyBetween('a0', 'a0V') yields 'a0G' style keys; a prefix right forces another round.
    const k = allocKey('a0', 'a0V', 'r#x');
    expect(k > 'a0' && k < 'a0V').toBe(true);
    const k2 = allocKey(null, 'a0', 'r');
    expect(k2 < 'a0').toBe(true);
  });
  it('uses only the part before # and drops dashes', () => {
    expect(allocKey(null, null, 'a-b#1')).toBe(allocKey(null, null, 'ab#2'));
  });
});
