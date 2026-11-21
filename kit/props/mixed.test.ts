// The mixed-script properties must fail on a wrong fold (mutation check for the mixed block).
import { describe, expect, it } from 'vitest';
import type { Op, OpDef } from '../../skeleton/src/core/types.ts';
import { loadConfig } from './config.ts';
import { checkMixedRun, type AppProps } from './mixed.ts';
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
