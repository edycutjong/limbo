// Unit tests for the golden helpers (R14): enumerator counts, dedup by applied set, pending files.
import { describe, expect, it } from 'vitest';
import type { Op } from '../../skeleton/src/core/types.ts';
import { countOrders, enumerateOrders, loadGoldens, partialMatch } from './golden.ts';

function op(r: string, n: number, l: number, deps: Record<string, number>): Op {
  return { id: `${r}:${n}`, op: 'x', target: 't', payload: {}, stamp: { l, r, n }, deps };
}

// s:1 -> (a:1 | b:1) -> c:1 covering both
const diamond = [op('s', 1, 1, {}), op('a', 1, 2, { s: 1 }), op('b', 1, 2, { s: 1 }), op('c', 1, 3, { s: 1, a: 1, b: 1 })];

describe('enumerateOrders', () => {
  it('yields both orders of a 3-op diamond', () => {
    const orders = [...enumerateOrders(diamond.slice(0, 3))].map((o) => o.map((x) => x.id).join(','));
    expect(orders.sort()).toEqual(['s:1,a:1,b:1', 's:1,b:1,a:1'].sort());
  });
  it('every order is causal and duplicates collapse', () => {
    const orders = [...enumerateOrders([...diamond, diamond[1]!])];
    expect(orders).toHaveLength(2);
    for (const o of orders) expect(o.map((x) => x.id)[0]).toBe('s:1');
  });
  it('dedups by applied set when counting (the set {s,a,b} is reached twice, visited once)', () => {
    expect(countOrders(diamond)).toEqual({ orders: 2, sets: 5 });
  });
  it('throws on unmet deps', () => {
    expect(() => [...enumerateOrders([op('a', 1, 1, { z: 1 })])]).toThrow(/unmet deps/);
  });
});

describe('partialMatch', () => {
  it('matches subsets of objects, exact arrays', () => {
    expect(partialMatch({ a: 1, b: [1, 2] }, { b: [1, 2] })).toBe(true);
    expect(partialMatch({ b: [1, 2] }, { b: [1] })).not.toBe(true);
    expect(partialMatch({}, { a: 1 })).toContain('$.a');
  });
});

describe('golden files', () => {
  it('loads G01..G21 with tuple stamps converted; G20 and G21 are pending', () => {
    const gs = loadGoldens();
    expect(gs).toHaveLength(21);
    expect(gs[0]!.ops[0]!.stamp).toEqual({ l: 1, r: 's', n: 1 });
    expect(gs.filter((g) => g.pending !== undefined).map((g) => g.file)).toEqual(['G20.json', 'G21.json']);
  });
  it('every history has at least one complete causal order', () => {
    for (const g of loadGoldens()) expect(countOrders(g.ops).orders, g.file).toBeGreaterThan(0);
  });
});
