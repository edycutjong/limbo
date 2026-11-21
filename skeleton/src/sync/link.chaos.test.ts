import { describe, expect, it } from 'vitest';
import { canonical } from '../core/causal.ts';
import { causalLww } from '../core/merges.ts';
import type { Op, OpDef } from '../core/types.ts';
import { createInPageLink } from './inpage-link.ts';
import { attachLink, type Msg } from './link.ts';
import { createReplica, type Replica } from './replica.ts';
import { openStore } from './store.ts';

const defs: OpDef[] = [
  { name: 'set', merge: 'causal-lww', intent: { kind: 'set', field: 'v' } },
  { name: 'delta', merge: 'commutes', intent: { kind: 'delta', field: 'n' } },
];
interface S {
  v: string | undefined;
  n: number;
}
const materialize = (ops: readonly Op[]): S => ({
  v: causalLww(ops.filter((o) => o.op === 'set') as Op<string>[]).value,
  n: ops.filter((o) => o.op === 'delta').reduce((a, o) => a + (o.payload as number), 0),
});
const make = (id: string, tag: string): Promise<Replica<S>> =>
  createReplica<S>({ app: 't', replicaId: id, defs, materialize, twinCount: () => 0, store: openStore(`chaos-${tag}-${id}`), seedOps: [] });

const delays: number[] = [];
async function run(seed: number, tag: string) {
  const link = createInPageLink({ chaos: { seed }, schedule: (_f, d) => void delays.push(d) });
  const a = await make('a', tag);
  const b = await make('b', tag);
  const order: string[] = [];
  const tap = (name: string, end: typeof link.a) =>
    end.onMessage((m: Msg) => order.push(`${name}:${m.t}:${JSON.stringify(m.t === 'ops' ? m.ops.map((o) => o.id) : m.vv)}`));
  tap('a', link.a);
  tap('b', link.b);
  attachLink(a, link.a);
  attachLink(b, link.b);
  for (let i = 0; i < 4; i++) {
    a.local('delta', 't', 1);
    b.local('delta', 't', 2);
  }
  a.local('set', 't', 'from-a');
  b.local('set', 't', 'from-b');
  link.restore();
  let pumps = 0;
  while (link.pump()) if (++pumps > 500) throw new Error('resend loop');
  return { link, a, b, order, pumps };
}

describe('chaos link', () => {
  it('same seed gives the same delivery order and delays', async () => {
    delays.length = 0;
    const r1 = await run(7, 'r1');
    const d1 = [...delays];
    delays.length = 0;
    const r2 = await run(7, 'r2');
    expect(r2.order).toEqual(r1.order);
    expect(delays).toEqual(d1);
    expect(d1.every((d) => Number.isInteger(d) && d >= 0 && d < 20)).toBe(true);
  });

  it('different seeds reorder deliveries', async () => {
    const orders = new Set<string>();
    for (const seed of [1, 2, 3, 4, 5]) orders.add((await run(seed, `d${seed}`)).order.join('|'));
    expect(orders.size).toBeGreaterThan(1);
  });

  it.each([1, 2, 3, 42, 1337, 99999])('seed %i converges with no drop or duplicate', async (seed) => {
    const { link, a, b, pumps } = await run(seed, `c${seed}`);
    expect(canonical(a.state())).toBe(canonical(b.state()));
    expect(a.state().n).toBe(12);
    expect(a.applied().length).toBe(10);
    expect(b.applied().length).toBe(10);
    const st = link.stats();
    expect(st.dropped).toEqual({ ab: 0, ba: 0 });
    expect(st.delivered).toEqual(st.sent);
    expect(link.pending()).toBe(0);
    expect(pumps).toBe(st.delivered.ab + st.delivered.ba);
    // Bounded: far fewer messages than a resend loop would produce.
    expect(pumps).toBeLessThan(60);
  });
});
