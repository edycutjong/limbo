// The duplicate flag in simulate() and in the shuffle replay asks the causal buffer whether the delivered op is still
// held: a delivery that applies nothing is a duplicate only if the op is not waiting for a dependency. Both replays
// deliver in causal order, so their buffers never hold an op and the check is defensive; here the buffer is wrapped to
// report extra held ops. Written outside Kiro (claude-direct) with the Vitest 4 upgrade; no product file changed.
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { Op, OpDef } from '../../skeleton/src/core/types.ts';

const held = vi.hoisted(() => ({ extra: [] as Op[] }));
vi.mock('../../skeleton/src/core/causal.ts', async (importOriginal) => {
  const m = await importOriginal<typeof import('../../skeleton/src/core/causal.ts')>();
  return {
    ...m,
    // Delivery buffers are created without a frontier; script-generation buffers (with one) are left alone.
    causalBuffer: (...args: Parameters<typeof m.causalBuffer>) => {
      const b = m.causalBuffer(...args);
      if (args.length > 0) return b;
      return { ...b, held: () => [...b.held(), ...held.extra] };
    },
  };
});

const { simulate } = await import('../../skeleton/src/core/simulate.ts');
const { runShuffle } = await import('../../skeleton/src/limbo/shuffle.ts');

const defs: OpDef[] = [
  { name: 'add', merge: 'commutes', intent: { kind: 'delta', field: 'n' }, apply: (s, o) => ({ n: ((s as { n?: number }).n ?? 0) + (o.payload as number) }) },
];
const input = { defs, replicas: 3, seed: 7, steps: 10, dupRate: 0.5, init: () => ({ n: 0 }), gen: () => ({ target: 't', payload: 1 }) };
const stranger: Op = { id: 'z:9', op: 'add', target: 't', payload: 1, stamp: { l: 9, r: 'z', n: 9 }, deps: { z: 8 } };

beforeEach(() => {
  held.extra = [];
});

describe('simulate duplicate flag', () => {
  it('an unrelated held op changes no duplicate flag', () => {
    const base = simulate(input);
    held.extra = [stranger];
    const run = simulate(input);
    expect(run.trace).toEqual(base.trace);
    expect(run.trace.some((s) => s.duplicate)).toBe(true);
  });

  it('a delivery of an op the buffer still holds is not counted as a duplicate', () => {
    const base = simulate(input);
    const dup = base.trace.find((s) => s.duplicate)!;
    held.extra = [base.ops.find((o) => o.id === dup.opId)!];
    const run = simulate(input);
    const flagged = run.trace.filter((s) => s.opId === dup.opId && s.duplicate);
    expect(flagged).toEqual([]);
    expect(run.states).toEqual(base.states);
  });
});

describe('shuffle replay duplicate flag', () => {
  it('an unrelated held op changes nothing the shuffle test reports', () => {
    const ops = simulate(input).ops;
    const m = (xs: readonly Op[]) => xs.length;
    const base = runShuffle({ ops, n: 20, seed: 3, dupRate: 0.5 }, m);
    held.extra = [stranger];
    expect(runShuffle({ ops, n: 20, seed: 3, dupRate: 0.5 }, m)).toEqual(base);
    expect(base).toMatchObject({ ran: 20, disagree: 0 });
  });
});
