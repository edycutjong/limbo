import { describe, expect, it } from 'vitest';
import { canonical, createOp, newReplica, observe } from '../core/causal.ts';
import type { Op, OpDef } from '../core/types.ts';
import { runShuffle } from './shuffle.ts';
import { groupThousands } from './shuffle-test.tsx';

const add: OpDef = { name: 'add', merge: 'commutes', intent: { kind: 'delta', field: 'sum' } };
const set: OpDef = { name: 'set', merge: 'causal-lww', intent: { kind: 'set', field: 'v' } };

/** Two replicas, concurrent ops, plus a causal chain on one of them. */
function script(): Op[] {
  const a = newReplica('a');
  const b = newReplica('b');
  const ops: Op[] = [];
  for (let i = 0; i < 3; i++) ops.push(createOp(a, add, 't', { by: i + 1 }));
  for (let i = 0; i < 3; i++) ops.push(createOp(b, add, 't', { by: 10 * (i + 1) }));
  observe(b, ops[0]!);
  ops.push(createOp(b, set, 't', { v: 1 }));
  return ops;
}

// Converges: sum is order-independent.
const sum = (ops: readonly Op[]) => ({ sum: ops.reduce((s, o) => s + (o.op === 'add' ? (o.payload as { by: number }).by : 0), 0) });
// Read-modify-write: the result depends on arrival order.
const rmw = (ops: readonly Op[]) => {
  let v = 0;
  for (const o of ops) v = (v * 2 + (o.id.startsWith('a') ? 1 : 2)) % 1_000_003;
  return { v };
};

describe('runShuffle', () => {
  it('converging materialize: all orderings agree, ran = n', () => {
    const r = runShuffle({ ops: script(), n: 100, seed: 1 }, sum);
    expect(r.ran).toBe(100);
    expect(r.disagree).toBe(0);
    expect(r.states).toEqual([canonical(sum(script()))]);
    expect(r.trace).toBeUndefined();
  });

  it('reports progress', () => {
    const seen: number[] = [];
    runShuffle({ ops: script(), n: 5, seed: 1 }, sum, (d) => seen.push(d));
    expect(seen).toEqual([1, 2, 3, 4, 5]);
  });

  it('non-commutative materialize disagrees and yields a shrunk trace no larger than the input', () => {
    const ops = script();
    const r = runShuffle({ ops, n: 200, seed: 1 }, rmw);
    expect(r.disagree).toBeGreaterThan(0);
    expect(r.trace).toContain('replica a:');
    expect(r.trace).toContain('first difference');
    expect(r.shrunk!.length).toBeLessThanOrEqual(ops.length);
    expect(r.shrunk!.length).toBeLessThan(ops.length);
    // the shrunk set still disagrees
    expect(runShuffle({ ops: r.shrunk!, n: 200, seed: 1 }, rmw).disagree).toBeGreaterThan(0);
  });
});

describe('groupThousands', () => {
  it('groups by string slicing', () => {
    expect([0, 999, 1000, 12345, 1234567].map(groupThousands)).toEqual(['0', '999', '1,000', '12,345', '1,234,567']);
  });
});
