// The mixed-script properties must fail on a wrong fold (mutation check for the mixed block).
import { describe, expect, it } from 'vitest';
import type { Op, OpDef } from '../../skeleton/src/core/types.ts';
import { loadConfig } from './config.ts';
import { expectedOrder } from './intent/index.ts';
import { checkMixedRun, checkedOps, type AppProps } from './mixed.ts';
import { mixedGen, simulateMixed } from './vacuity.ts';

const defs: OpDef[] = ['x.add', 'x.set'].map((name) => ({ name, merge: 'causal-lww', intent: { kind: 'set', field: 'v' } }) as OpDef);
const cfg = loadConfig({ LIMBO_PROPS_TIER: 'fast' });
const gen = mixedGen(new Map([['x.set', { gen: (_d, r) => ({ target: 't0', payload: { v: r.int(3) } }) }]]));

// Last arrival wins: replicas that deliver in different orders disagree.
const arrival: AppProps = {
  materialize: (ops: readonly Op[]) => ({ v: [...ops].reverse().find((o) => o.op === 'x.set')?.payload ?? null }),
};
const sound: AppProps = {
  materialize: (ops: readonly Op[]) => ({ n: new Set(ops.map((o) => o.id)).size }),
};

describe('mixed properties', () => {
  it('flag an arrival-order fold', () => {
    const names = new Set<string>();
    for (let i = 0; i < 40; i++) for (const f of checkMixedRun(simulateMixed(defs, gen, cfg, i), arrival, cfg)) names.add(f.property);
    expect(names.has('app convergence')).toBe(true);
    expect(names.has('app replay equivalence')).toBe(true);
  });
  it('pass an order-free fold', () => {
    for (let i = 0; i < 20; i++) expect(checkMixedRun(simulateMixed(defs, gen, cfg, i), sound, cfg)).toEqual([]);
  });
});

// Move order: a fold that ignores every move and lists items by id converges, so only the ordered oracle catches it.
const moveDefs: OpDef[] = [
  { name: 'm.add', merge: 'commutes', intent: { kind: 'create' } },
  { name: 'm.move', merge: 'ordered-move', intent: { kind: 'move' } },
] as OpDef[];
const moveGen = mixedGen(
  new Map([
    ['m.add', { gen: (_d, r) => ({ target: 't0', payload: { key: r.pick(['a0', 'a1', 'a2']) } }) }],
    ['m.move', { gen: (_d, r) => ({ target: 't0', payload: { key: r.pick(['a0', 'a1', 'a2']) } }) }],
  ]),
);
const keyOf = (o: Op): string | undefined => (o.op === 'm.add' || o.op === 'm.move' ? (o.payload as { key: string }).key : undefined);
const moveApp = (fold: (ops: readonly Op[]) => string[]): AppProps => ({
  materialize: (ops) => ({ order: fold([...new Map(ops.map((o) => [o.id, o] as const)).values()]) }),
  life: { kind: (o) => (o.op === 'm.add' ? 'create' : undefined), read: () => 'alive' },
  move: { read: (s) => (s as { order: string[] }).order, key: keyOf },
});
const byKey = moveApp((ops) => expectedOrder(ops, keyOf));
const byId = moveApp((ops) => [...new Set(ops.filter((o) => o.op === 'm.add').map((o) => o.target))].sort());

describe('mixed move order', () => {
  it('flags a fold that ignores moves', () => {
    const names = new Set<string>();
    for (let i = 0; i < 40; i++) for (const f of checkMixedRun(simulateMixed(moveDefs, moveGen, cfg, i), byId, cfg)) names.add(f.property);
    expect(names.has('intent:move')).toBe(true);
  });
  it('passes a fold that orders by the winning keys', () => {
    for (let i = 0; i < 20; i++) expect(checkMixedRun(simulateMixed(moveDefs, moveGen, cfg, i), byKey, cfg)).toEqual([]);
  });
});

describe('checkedOps', () => {
  it('keeps only ops on targets with a create op', () => {
    const res = simulateMixed(moveDefs, moveGen, cfg, 3);
    const created = new Set(res.ops.filter((o) => o.op === 'm.add').map((o) => o.target));
    const kept = checkedOps(res.ops, byKey);
    expect(kept.every((o) => created.has(o.target))).toBe(true);
    expect(kept.length).toBe(res.ops.filter((o) => created.has(o.target)).length);
    expect(checkedOps(res.ops, undefined)).toEqual(res.ops);
  });
});
