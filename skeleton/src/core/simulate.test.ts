import { describe, expect, it } from 'vitest';
import { explainTrace, simulate, withSkew, type SimInput, type Step } from './simulate.ts';
import type { OpDef } from './types.ts';

type S = { v?: number; n?: number };
const setDef: OpDef<S, { v: number }> = {
  name: 'stub.set',
  merge: 'causal-lww',
  intent: { kind: 'set', field: 'v' },
  apply: (s, op) => ({ ...s, v: op.payload.v }),
};
const incDef: OpDef<S, { by: number }> = {
  name: 'stub.inc',
  merge: 'commutes',
  intent: { kind: 'delta', field: 'n' },
  apply: (s, op) => ({ ...s, n: (s.n ?? 0) + op.payload.by }),
};
const input = (seed: number): SimInput => ({
  defs: [setDef, incDef] as unknown as OpDef[],
  replicas: 3,
  seed,
  steps: 14,
  gen: (def, rand) => ({ target: 't', payload: def.name === 'stub.set' ? { v: rand.int(5) } : { by: 1 + rand.int(3) } }),
});

describe('simulate', () => {
  it('same seed gives the same trace', () => {
    expect(simulate(input(7))).toEqual(simulate(input(7)));
    expect(simulate(input(7)).trace).not.toEqual(simulate(input(8)).trace);
  });

  it('every delivery order is causal and reaches every op', () => {
    for (let seed = 1; seed <= 25; seed++) {
      const res = simulate(input(seed));
      const byId = new Map(res.ops.map((o) => [o.id, o] as const));
      for (const [r, order] of Object.entries(res.orders)) {
        const applied = new Set<string>();
        const vv: Record<string, number> = {};
        const rows = res.trace.filter((s) => s.replica === r);
        expect(rows.map((s) => s.opId)).toEqual(order);
        for (const s of rows) {
          if (s.duplicate) {
            expect(applied.has(s.opId)).toBe(true);
            continue;
          }
          const op = byId.get(s.opId)!;
          expect(vv[op.stamp.r] ?? 0).toBe(op.stamp.n - 1);
          for (const [dr, dn] of Object.entries(op.deps)) expect(vv[dr] ?? 0).toBeGreaterThanOrEqual(dn);
          vv[op.stamp.r] = op.stamp.n;
          applied.add(s.opId);
        }
        expect(applied.size).toBe(res.ops.length);
      }
    }
  });

  it('delivers some ops twice', () => {
    for (let seed = 1; seed <= 10; seed++) {
      expect(simulate(input(seed)).trace.some((s) => s.duplicate)).toBe(true);
    }
  });

  it('the script has concurrent ops', () => {
    const res = simulate(input(3));
    const concurrentFound = res.ops.some((x) =>
      res.ops.some((y) => x.id !== y.id && (x.deps[y.stamp.r] ?? 0) < y.stamp.n && (y.deps[x.stamp.r] ?? 0) < x.stamp.n),
    );
    expect(concurrentFound).toBe(true);
  });

  it('skews the clock inside withSkew and restores it after a throw', () => {
    const dateNow = Date.now;
    const perfNow = performance.now;
    const H = 3_600_000;
    const seen = withSkew(2 * H, () => Date.now() - dateNow());
    expect(seen).toBeGreaterThanOrEqual(2 * H);
    expect(() =>
      withSkew(-3 * H, () => {
        throw new Error('boom');
      }),
    ).toThrow('boom');
    expect(Date.now).toBe(dateNow);
    expect(performance.now).toBe(perfNow);
  });

  it('restores the clocks when a reducer throws inside simulate', () => {
    const dateNow = Date.now;
    const perfNow = performance.now;
    const bad: OpDef = {
      name: 'stub.bad',
      merge: 'commutes',
      intent: { kind: 'create' },
      apply: () => {
        throw new Error('reducer');
      },
    };
    expect(() => simulate({ defs: [bad], replicas: 2, seed: 1, steps: 3 })).toThrow('reducer');
    expect(Date.now).toBe(dateNow);
    expect(performance.now).toBe(perfNow);
  });
});

describe('explainTrace', () => {
  it('names the first step where replicas holding the same ops differ', () => {
    const step = (replica: string, opId: string, stateAfter: string, duplicate = false): Step => ({ replica, opId, stateAfter, duplicate });
    const trace: Step[] = [
      step('a', 'x:1', '{"v":1}'),
      step('a', 'y:1', '{"v":2}'),
      step('b', 'y:1', '{"v":2}'),
      step('b', 'x:1', '{"v":1}'),
    ];
    const text = explainTrace({ trace, seed: 9 });
    expect(text).toContain('seed 9');
    expect(text).toContain('first difference at step 1');
    expect(text).toContain('x:1,y:1');
    expect(text).toContain('a: {"v":2}');
    expect(text).toContain('b: {"v":1}');
  });

  it('reports no difference for a converged trace', () => {
    const res = simulate({ defs: [incDef] as unknown as OpDef[], replicas: 3, seed: 4, steps: 8, gen: () => ({ target: 't', payload: { by: 1 } }) });
    expect(new Set(Object.values(res.states)).size).toBe(1);
    expect(explainTrace(res)).toContain('no difference');
  });
});
