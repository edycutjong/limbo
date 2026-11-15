import { describe, expect, it } from 'vitest';
import { causalLww, claimOne, orderedMove, resurrect, type ClaimPayload, type LifeOp, type MoveItem } from './merges.ts';
import type { Op, VV } from './types.ts';

const w = (r: string, n: number, l: number, v: string, deps: VV = {}): Op<string> => ({
  id: `${r}:${n}`,
  op: 'x.set',
  target: 'x',
  payload: v,
  stamp: { l, r, n },
  deps,
});

const perms = <T>(xs: T[]): T[][] =>
  xs.length <= 1 ? [xs] : xs.flatMap((x, i) => perms([...xs.slice(0, i), ...xs.slice(i + 1)]).map((p) => [x, ...p]));

describe('causalLww', () => {
  it('concurrent different values: max stamp wins, other is a twin, any order, with duplicates', () => {
    const a = w('a', 1, 1, 'A');
    const b = w('b', 1, 1, 'B');
    const c = w('c', 1, 1, 'C');
    for (const p of perms([a, b, c, a])) {
      const r = causalLww(p);
      expect(r.value).toBe('C');
      expect(r.twins.map((t) => t.payload).sort()).toEqual(['A', 'B']);
    }
  });

  it('equal concurrent values collapse with no twin', () => {
    const r = causalLww([w('a', 1, 1, 'T'), w('b', 1, 1, 'T')]);
    expect(r.value).toBe('T');
    expect(r.twins).toEqual([]);
  });

  it('a write that covers the whole frontier wins alone, even with a lower stamp order of origin', () => {
    const a = w('a', 1, 1, 'A');
    const b = w('b', 1, 1, 'B');
    const d = w('a', 2, 2, 'D', { a: 1, b: 1 });
    for (const p of perms([a, b, d])) {
      const r = causalLww(p);
      expect(r.value).toBe('D');
      expect(r.twins).toEqual([]);
    }
  });

  it('dominance beats a higher replica id and stamp ties break by code unit', () => {
    const z = w('z', 1, 1, 'Z');
    const a = w('a', 1, 2, 'A', { z: 1 });
    expect(causalLww([z, a]).value).toBe('A');
    expect(causalLww([w('B', 1, 1, 'up'), w('a', 1, 1, 'low')]).value).toBe('low');
  });

  it('empty input gives no value', () => {
    expect(causalLww([])).toEqual({ value: undefined, winner: undefined, twins: [] });
  });
});

const life = (kind: LifeOp['kind'], r: string, n: number, l: number, deps: VV = {}): LifeOp => ({
  kind,
  op: { id: `${r}:${n}`, op: `item.${kind}`, target: 'x', payload: null, stamp: { l, r, n }, deps },
});

describe('resurrect', () => {
  const all = (xs: LifeOp[]) => perms(xs).concat(perms([...xs, xs[0]!]));

  it('no deletes: alive', () => {
    expect(resurrect([life('create', 'a', 1, 1)]).life).toBe('alive');
  });

  it('delete concurrent with an edit: twin, in any order and with duplicates', () => {
    const c = life('create', 'a', 1, 1);
    const d = life('delete', 'b', 1, 2, { a: 1 });
    const e = life('edit', 'a', 2, 2, { a: 1 });
    for (const p of all([c, d, e])) {
      const r = resurrect(p);
      expect(r.life).toBe('twin');
      expect(r.resurrecting.map((o) => o.id)).toEqual(['a:2']);
    }
  });

  it('delete that covers every edit it saw: deleted', () => {
    const c = life('create', 'a', 1, 1);
    const e = life('edit', 'a', 2, 2, { a: 1 });
    const d = life('delete', 'b', 1, 3, { a: 2 });
    for (const p of all([c, e, d])) expect(resurrect(p).life).toBe('deleted');
  });

  it('restore covering the active delete (Keep): alive', () => {
    const c = life('create', 'a', 1, 1);
    const d = life('delete', 'b', 1, 2, { a: 1 });
    const r = life('restore', 'a', 2, 3, { a: 1, b: 1 });
    for (const p of all([c, d, r])) expect(resurrect(p).life).toBe('alive');
  });

  it('G05 shape: two restores cover one delete, a second delete stays active, a concurrent restore twins', () => {
    const c = life('create', 's', 1, 1);
    const d1 = life('delete', 'b', 1, 2, { s: 1 });
    const r1 = life('restore', 'a', 1, 3, { s: 1, b: 1 });
    const d2 = life('delete', 'b', 2, 4, { s: 1, b: 1 });
    const r2 = life('restore', 'a', 2, 4, { s: 1, b: 1, a: 1 });
    const res = resurrect([c, d1, r1, d2, r2]);
    expect(res.active.map((o) => o.id)).toEqual(['b:2']);
    expect(res.life).toBe('twin');
  });

  it('an edit that covers every active delete resurrects only if it is not covered; deleted item with no edits', () => {
    const d = life('delete', 'b', 1, 1);
    expect(resurrect([d]).life).toBe('deleted');
    const e = life('edit', 'a', 1, 2, { b: 1 });
    expect(resurrect([d, e]).life).toBe('deleted');
  });
});

const cl = (op: string, r: string, n: number, l: number, who: string, deps: VV = {}): Op<ClaimPayload> => ({
  id: `${r}:${n}`,
  op,
  target: 'y',
  payload: { who },
  stamp: { l, r, n },
  deps,
});
const ids = (os: Op[]) => os.map((o) => o.id);

describe('claimOne', () => {
  it('concurrent claims: lowest stamp wins, other is a loser, any order, with duplicates', () => {
    const a = cl('item.claim', 'a', 1, 1, 'ann');
    const b = cl('item.claim', 'b', 1, 1, 'bob');
    for (const p of perms([a, b, a])) {
      const r = claimOne(p, [], 1, 'alive');
      expect(ids(r.winners)).toEqual(['a:1']);
      expect(ids(r.losers)).toEqual(['b:1']);
    }
  });

  it('units 2 gives two winners and the rest lose', () => {
    const cs = [cl('item.claim', 'c', 1, 1, 'cy'), cl('item.claim', 'a', 1, 1, 'ann'), cl('item.claim', 'b', 1, 1, 'bob')];
    const r = claimOne(cs, [], 2, 'twin');
    expect(ids(r.winners)).toEqual(['a:1', 'b:1']);
    expect(ids(r.losers)).toEqual(['c:1']);
  });

  it('a duplicate claimant keeps one claim, the lowest stamp', () => {
    const r = claimOne([cl('item.claim', 'b', 1, 3, 'ann'), cl('item.claim', 'a', 1, 1, 'ann')], [], 1, 'alive');
    expect(ids(r.winners)).toEqual(['a:1']);
    expect(r.losers).toEqual([]);
  });

  it('a winner releasing hands the claim to the next eligible claim', () => {
    const a = cl('item.claim', 'a', 1, 1, 'ann');
    const b = cl('item.claim', 'b', 1, 1, 'bob');
    const rel = cl('item.release', 'a', 2, 2, 'ann', { a: 1 });
    for (const p of perms([a, b, rel])) {
      const r = claimOne(
        p.filter((o) => o.op === 'item.claim'),
        p.filter((o) => o.op === 'item.release'),
        1,
        'alive',
      );
      expect(ids(r.winners)).toEqual(['b:1']);
      expect(r.losers).toEqual([]);
    }
  });

  it('release then reclaim: the new claim stands; an unseen claim is not released', () => {
    const c1 = cl('item.claim', 'a', 1, 1, 'ann');
    const rel = cl('item.release', 'a', 2, 2, 'ann', { a: 1 });
    const c2 = cl('item.claim', 'a', 3, 3, 'ann', { a: 2 });
    expect(ids(claimOne([c1, c2], [rel], 1, 'alive').winners)).toEqual(['a:3']);
    const unseen = cl('item.claim', 'b', 1, 1, 'ann');
    expect(ids(claimOne([unseen], [rel], 1, 'alive').winners)).toEqual(['b:1']);
  });

  it('a release by a different who does not release the claim', () => {
    const c = cl('item.claim', 'a', 1, 1, 'ann');
    const rel = cl('item.release', 'b', 1, 2, 'bob', { a: 1 });
    expect(ids(claimOne([c], [rel], 1, 'alive').winners)).toEqual(['a:1']);
  });

  it('a claim that covers another never beats it, even from a lower replica id', () => {
    const z = cl('item.claim', 'z', 1, 1, 'zed');
    const a = cl('item.claim', 'a', 1, 2, 'ann', { z: 1 });
    expect(ids(claimOne([a, z], [], 1, 'alive').winners)).toEqual(['z:1']);
  });

  it('a deleted item has no winners and no losers', () => {
    const r = claimOne([cl('item.claim', 'a', 1, 1, 'ann')], [], 1, 'deleted');
    expect(r).toEqual({ winners: [], losers: [] });
  });
});

describe('orderedMove', () => {
  const k = (r: string, n: number, l: number, key: string, deps: VV = {}): Op<{ key: string }> => ({
    id: `${r}:${n}`,
    op: 'item.move',
    target: 'x',
    payload: { key },
    stamp: { l, r, n },
    deps,
  });

  it('orders by key, then id by code unit, for any item order', () => {
    const items: MoveItem[] = [
      { id: 'y', writes: [k('a', 1, 1, 'a1')] },
      { id: 'x', writes: [k('a', 2, 2, 'a2')] },
      { id: 'B', writes: [k('a', 3, 3, 'a1')] },
    ];
    for (const p of perms(items)) expect(orderedMove(p).map((i) => i.id)).toEqual(['B', 'y', 'x']);
  });

  it('a covering move replaces the create key; concurrent moves pick max stamp and surface a twin', () => {
    const create = k('a', 1, 1, 'a0');
    const m1 = k('a', 2, 2, 'a1', { a: 1 });
    const m2 = k('b', 1, 2, 'a2', { a: 1 });
    const writes = [create, m1, m2, m1];
    for (const p of perms(writes)) {
      const [pl] = orderedMove([{ id: 'i', writes: p }]);
      expect(pl?.key).toBe('a2');
      expect(pl?.twins.map((t) => t.payload.key)).toEqual(['a1']);
    }
    const [only] = orderedMove([{ id: 'i', writes: [create, m1] }]);
    expect(only?.key).toBe('a1');
    expect(only?.twins).toEqual([]);
  });

  it('drops items with no writes', () => {
    expect(orderedMove([{ id: 'i', writes: [] }])).toEqual([]);
  });
});
