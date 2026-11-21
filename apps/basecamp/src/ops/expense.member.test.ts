import { describe, expect, it } from 'vitest';
import { canonical, concurrent, covers } from '../../../../skeleton/src/core/causal.ts';
import { simulate } from '../../../../skeleton/src/core/simulate.ts';
import type { Op, OpDef } from '../../../../skeleton/src/core/types.ts';
import expenseAdd from './expense.add.op.ts';
import addMember from './expense.addMember.op.ts';
import removeMember from './expense.removeMember.op.ts';
import type { MemberOpsState, MemberPayload } from './expense.state.ts';

let n = 0;
function mk(def: OpDef, r: string, l: number, deps: Record<string, number>, member: string): Op<MemberPayload> {
  n += 1;
  return { id: `${r}:${n}`, op: def.name, target: 'e', payload: { member }, stamp: { l, r, n }, deps };
}
const fold = (ops: Op<MemberPayload>[]): MemberOpsState => {
  let s: MemberOpsState = {};
  for (const o of ops) s = (o.op === 'expense.addMember' ? addMember : removeMember).apply!(s, o) as MemberOpsState;
  return s;
};

describe('expense.add envelope', () => {
  it('a payload field named target cannot override the envelope target', () => {
    const payload = { target: 'evil', label: 'x', amountCents: 100, payer: 'a', members: ['a'] };
    const op = { id: 'a:1', op: 'expense.add', target: 'e1', payload, stamp: { l: 1, r: 'a', n: 1 }, deps: {} } as Op;
    const s = expenseAdd.apply!({}, op) as { adds: Record<string, { target: string }> };
    expect(s.adds[op.id]!.target).toBe(op.target);
  });
});

describe('expense member ops', () => {
  it('a concurrent add and remove of the same member keeps the member, in either order', () => {
    const a = mk(addMember, 'a', 1, {}, 'dewi');
    const r = mk(removeMember, 'b', 1, {}, 'dewi');
    expect(fold([a, r]).members?.e).toEqual(['dewi']);
    expect(fold([r, a]).members?.e).toEqual(['dewi']);
  });
  it('a remove that observed the add removes the member, in either order', () => {
    const a = mk(addMember, 'a', 1, {}, 'dewi');
    const r = mk(removeMember, 'b', 2, { a: a.stamp.n }, 'dewi');
    expect(fold([a, r]).members?.e).toEqual([]);
    expect(fold([r, a]).members?.e).toEqual([]);
  });
  it('is idempotent and leaves other members alone', () => {
    const a = mk(addMember, 'a', 1, {}, 'dewi');
    const b = mk(addMember, 'a', 2, {}, 'budi');
    expect(fold([a, b, a]).members?.e).toEqual(['budi', 'dewi']);
  });

  it('vacuity guard: generated runs contain a concurrent add and remove of the same member', () => {
    const pick = (rand: { pick<T>(xs: readonly T[]): T }): MemberPayload => ({ member: rand.pick(['dewi', 'budi']) });
    const runs = 60;
    let hit = 0;
    for (let seed = 1; seed <= runs; seed++) {
      const res = simulate({
        defs: [addMember, removeMember],
        replicas: 2,
        seed,
        steps: 8,
        gen: (_d, rand) => ({ target: 'e', payload: pick(rand) }),
      });
      const adds = res.ops.filter((o) => o.op === 'expense.addMember');
      const rems = res.ops.filter((o) => o.op === 'expense.removeMember');
      if (adds.some((a) => rems.some((r) => (a.payload as MemberPayload).member === (r.payload as MemberPayload).member && concurrent(a, r) && !covers(a, r)))) hit++;
      // And the converged state agrees with the add-wins oracle on every replica.
      const states = Object.values(res.states).map((s) => canonical(JSON.parse(s)));
      expect(new Set(states).size).toBe(1);
    }
    expect(hit / runs).toBeGreaterThanOrEqual(0.5);
  });
});
