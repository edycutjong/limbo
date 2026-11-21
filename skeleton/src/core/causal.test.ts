import fc from 'fast-check';
import { generateKeyBetween } from 'fractional-indexing';
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

describe('allocKey with a dot', () => {
  const B62 = '0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz';
  const un62 = (d: string): number => [...d].reduce((a, c) => a * 62 + B62.indexOf(c), 0);
  /** Test-side decoder: strip the final `1`, read 3 digits of length L, then 3L digits of the dot string. */
  function decode(key: string): { r: string; n: number } {
    const body = key.slice(0, -1);
    const len = un62(body.slice(-3));
    const enc = body.slice(-3 - 3 * len, -3);
    let s = '';
    for (let i = 0; i < enc.length; i += 3) s += String.fromCharCode(un62(enc.slice(i, i + 3)));
    const at = s.lastIndexOf(':');
    return { r: s.slice(0, at), n: Number(s.slice(at + 1)) };
  }
  const L = 'a0';
  const R = 'a1';

  it('gives distinct keys for different n, incarnations and dashed ids', () => {
    const ks = [
      allocKey(L, R, { r: 'a#1', n: 1 }),
      allocKey(L, R, { r: 'a#1', n: 2 }),
      allocKey(L, R, { r: 'a#2', n: 1 }),
      allocKey(L, R, { r: 'a-b#1', n: 1 }),
      allocKey(L, R, { r: 'ab#1', n: 1 }),
    ];
    expect(new Set(ks).size).toBe(ks.length);
  });
  it('decodes to the dot, stays inside the gap and within the length bound', () => {
    for (const dot of [{ r: 'a#1', n: 1 }, { r: 'a-b#2', n: 40 }, { r: 'seed', n: 7 }]) {
      for (const [l, r] of [[L, R], [null, null], [null, 'a0'], ['a0', 'a0V']] as const) {
        const k = allocKey(l, r, dot);
        expect(decode(k)).toEqual(dot);
        if (l !== null) expect(k > l).toBe(true);
        if (r !== null) expect(k < r).toBe(true);
      }
    }
  });
  it('length is at most len(k) + 3 * len(dotString) + 4 for the generated key k', () => {
    const dot = { r: 'a#1', n: 12 };
    const k = allocKey(L, R, dot);
    const base = generateKeyBetween(L, R);
    expect(k.length).toBeLessThanOrEqual(base.length + 3 * `${dot.r}:${dot.n}`.length + 4);
  });
  it('never equals the seed key', () => {
    const seedKey = allocKey(null, null, 'seed');
    expect(allocKey(null, null, { r: 'seed', n: 1 })).not.toBe(seedKey);
    expect(allocKey(null, null, { r: 'seed#1', n: 1 })).not.toBe(seedKey);
  });
  it('keeps the legacy string form', () => {
    expect(allocKey(L, R, 'a#1')).toBe(allocKey(L, R, 'a#2'));
    expect(() => allocKey('K', 'K', 'b#1')).toThrow();
  });
  it('property: keys are pairwise distinct for distinct dots, inside the gap, and decode', () => {
    const dot = fc.record({ r: fc.stringMatching(/^[a-z0-9#-]{1,6}$/), n: fc.integer({ min: 1, max: 5000 }) });
    const gap = fc.integer({ min: 0, max: 12 }).chain((len) =>
      fc.tuple(fc.constant(len), fc.nat(len)).map(([m, i]) => {
        const keys: string[] = [];
        let prev: string | null = null;
        for (let j = 0; j < m; j++) keys.push((prev = generateKeyBetween(prev, null)));
        return [keys[i - 1] ?? null, keys[i] ?? null] as const;
      }),
    );
    fc.assert(
      fc.property(gap, fc.uniqueArray(dot, { minLength: 2, maxLength: 12, selector: (d) => `${d.r}:${d.n}` }), ([l, r], dots) => {
        const keys = dots.map((d) => allocKey(l, r, d));
        expect(new Set(keys).size).toBe(keys.length);
        keys.forEach((k, i) => {
          if (l !== null) expect(k > l).toBe(true);
          if (r !== null) expect(k < r).toBe(true);
          expect(decode(k)).toEqual(dots[i]);
        });
      }),
    );
  });
});
