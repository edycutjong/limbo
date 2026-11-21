import { describe, expect, it } from 'vitest';
import { canonical, covers, createOp, newReplica } from '../core/causal.ts';
import { causalLww } from '../core/merges.ts';
import type { Op, OpDef } from '../core/types.ts';
import { materialize as basecampMaterialize } from '../../../apps/basecamp/src/model.ts';
import { ops as basecampOps } from '../../../apps/basecamp/src/ops/registry.gen.ts';
import { createReplica, makeSeedOps } from './replica.ts';
import { openStore, type OpStore } from './store.ts';

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
const twinCount = (): number => 0;

const spyStore = (): { store: OpStore; puts: string[] } => {
  const inner = openStore('replica-test');
  const puts: string[] = [];
  return {
    puts,
    store: { ...inner, put: (op) => (puts.push(op.id), inner.put(op)) },
  };
};

const make = (replicaId: string, seedOps: readonly Op[] = [], store: OpStore = openStore('x')) =>
  createReplica<S>({ app: 't', replicaId, defs, materialize, twinCount, store, seedOps });

/** Ops authored by a peer `p`: p:1 (set), p:2 (delta, covers p:1). */
const peerOps = (): Op[] => {
  const p = newReplica('p');
  const o1 = createOp(p, defs[0]!, 't', 'one');
  const o2 = createOp(p, defs[1]!, 't', 5);
  return [o1, o2];
};

describe('replica', () => {
  it('a local op changes state and vv', async () => {
    const r = await make('a');
    const op = r.local('delta', 't', 2);
    expect(op.id).toBe('a#1:1');
    expect(r.state()).toEqual({ v: undefined, n: 2 });
    expect(r.vv()).toEqual({ 'a#1': 1 });
    expect(r.applied()).toEqual([op]);
  });

  it('local with an unknown name throws and creates no op', async () => {
    const r = await make('a');
    expect(() => r.local('nope', 't', 1)).toThrow();
    expect(r.log()).toEqual([]);
    expect(r.vv()).toEqual({});
  });

  it('out-of-order receive is held, then applied; vv omits held ops', async () => {
    const r = await make('b');
    const [o1, o2] = peerOps();
    const first = r.receive([o2!]);
    expect(first.applied).toEqual([]);
    expect(first.held).toBe(1);
    expect(r.buffered()).toEqual([o2]);
    expect(r.vv()).toEqual({});
    expect(r.state().n).toBe(0);
    const second = r.receive([o1!]);
    expect(second.applied.map((o) => o.id)).toEqual(['p:1', 'p:2']);
    expect(r.buffered()).toEqual([]);
    expect(r.vv()).toEqual({ p: 2 });
    expect(r.state()).toEqual({ v: 'one', n: 5 });
  });

  it('a duplicate is ignored and not counted in applied', async () => {
    const r = await make('b');
    const [o1] = peerOps();
    expect(r.receive([o1!]).applied).toHaveLength(1);
    const again = r.receive([o1!]);
    expect(again.applied).toEqual([]);
    expect(again.duplicates).toBe(1);
    expect(r.applied()).toHaveLength(1);
  });

  it('an unknown op is rejected, logged, and never reaches the store', async () => {
    const { store, puts } = spyStore();
    const r = await make('b', [], store);
    const bad: Op = { id: 'p:1', op: 'ghost', target: 't', payload: 1, stamp: { l: 1, r: 'p', n: 1 }, deps: {} };
    const res = r.receive([bad]);
    expect(res.rejected).toEqual([{ id: 'p:1', reason: 'unknown-op' }]);
    expect(res.applied).toEqual([]);
    expect(r.rejected()).toEqual([{ id: 'p:1', reason: 'unknown-op' }]);
    expect(r.log()).toEqual([]);
    expect(puts).toEqual([]);
  });

  it('malformed ops are rejected', async () => {
    const r = await make('b');
    const base = peerOps()[0]!;
    const res = r.receive([
      { ...base, id: 'wrong:1' },
      { ...base, stamp: { ...base.stamp, n: 0 }, id: 'p:0' },
      { ...base, stamp: { ...base.stamp, l: 1.5 } },
    ]);
    expect(res.rejected.map((x) => x.reason)).toEqual(['malformed', 'malformed', 'malformed']);
    expect(r.log()).toEqual([]);
  });

  it('rejects bad deps, target, op and payload as malformed without throwing or persisting', async () => {
    const { store, puts } = spyStore();
    const r = await make('b', [], store);
    const base = peerOps()[0]!;
    const bad = (i: number, patch: Record<string, unknown>): Op => ({ ...base, id: `p:${i}`, stamp: { ...base.stamp, n: i }, ...patch }) as Op;
    const ops = [
      bad(1, { deps: null }),
      bad(2, { deps: { x: 1.5 } }),
      bad(3, { deps: { x: -1 } }),
      bad(4, { deps: [] }),
      bad(5, { target: 7 }),
      bad(6, { op: 7 }),
      bad(7, { payload: undefined }),
    ];
    let res: ReturnType<typeof r.receive> | undefined;
    expect(() => (res = r.receive(ops))).not.toThrow();
    expect(res!.rejected).toEqual(ops.map((o) => ({ id: o.id, reason: 'malformed' })));
    expect(res!.applied).toEqual([]);
    expect(r.log()).toEqual([]);
    expect(puts).toEqual([]);
  });

  it('accepts valid ops: deps {}, payload {} and null, and a seed op', async () => {
    const r = await make('b');
    const base = peerOps()[0]!;
    const mk = (n: number, payload: unknown, deps: Record<string, number> = {}): Op =>
      ({ ...base, id: `q:${n}`, stamp: { l: n, r: 'q', n }, payload, deps }) as Op;
    const res = r.receive([mk(1, {}), mk(2, null, { q: 1 }), mk(3, 'x', { q: 2, z: 0 })]);
    expect(res.rejected).toEqual([]);
    expect(res.applied.map((o) => o.id)).toEqual(['q:1', 'q:2', 'q:3']);
    const seed = makeSeedOps(defs, [{ name: 'set', target: 't', payload: 's' }]);
    const r2 = await make('c');
    expect(r2.receive(seed).rejected).toEqual([]);
    expect(r2.applied()).toEqual(seed);
  });

  it('starts with a bad stored op: applies the valid one and records the bad one', async () => {
    const inner = openStore('stored-bad');
    const good = peerOps()[0]!;
    const badOp = { ...good, id: 'z:1', stamp: { l: 1, r: 'z', n: 1 }, deps: null } as unknown as Op;
    const store: OpStore = { ...inner, all: () => [good, badOp] };
    const r = await make('a', [], store);
    expect(r.applied().map((o) => o.id)).toEqual([good.id]);
    expect(r.rejected()).toEqual([{ id: 'z:1', reason: 'malformed' }]);
    expect(r.saved('z:1')).toBe(false);
    expect(r.saved(good.id)).toBe(true);
  });

  it('keeps only the last 50 rejections', async () => {
    const r = await make('b');
    const base = peerOps()[0]!;
    for (let i = 0; i < 60; i++) r.receive([{ ...base, id: `bad${i}` }]);
    expect(r.rejected()).toHaveLength(50);
    expect(r.rejected()[0]!.id).toBe('bad10');
  });

  it('two replicas from the same seedOps have equal seed ops and states', async () => {
    const script = [
      { name: 'set', target: 't', payload: 'seeded' },
      { name: 'delta', target: 't', payload: 3 },
    ];
    const seedA = makeSeedOps(defs, script);
    const seedB = makeSeedOps(defs, script);
    expect(canonical(seedA)).toBe(canonical(seedB));
    expect(seedA.map((o) => o.id)).toEqual(['seed:1', 'seed:2']);
    expect(covers(seedA[1]!, seedA[0]!)).toBe(true);
    const a = await make('a', seedA);
    const b = await make('b', seedB);
    expect(canonical(a.applied())).toBe(canonical(b.applied()));
    expect(canonical(a.state())).toBe(canonical(b.state()));
    expect(a.state()).toEqual({ v: 'seeded', n: 3 });
    expect(a.vv()).toEqual({ seed: 2 });
  });

  it('seed ops are not written to the store and a later local op depends on them', async () => {
    const { store, puts } = spyStore();
    const r = await make('a', makeSeedOps(defs, [{ name: 'set', target: 't', payload: 's' }]), store);
    const op = r.local('set', 't', 'mine');
    expect(puts).toEqual(['a#1:1']);
    expect(op.deps).toEqual({ seed: 1 });
    expect(op.stamp.l).toBe(2);
    expect(r.state().v).toBe('mine');
  });

  it('subscribers fire once per change, and saved flips after the put resolves', async () => {
    const r = await make('b');
    let calls = 0;
    const off = r.subscribe(() => calls++);
    const [o1, o2] = peerOps();
    r.local('delta', 't', 1);
    expect(calls).toBe(1);
    r.receive([o2!, o1!]); // one call, two applied
    expect(calls).toBe(2);
    r.receive([o1!]); // duplicate: no change
    expect(calls).toBe(2);
    expect(r.saved('b#1:1')).toBe(false);
    await new Promise((res) => setTimeout(res, 20));
    expect(r.saved('b#1:1')).toBe(true);
    expect(r.saved('p:2')).toBe(true);
    const before = calls;
    off();
    r.local('delta', 't', 1);
    expect(calls).toBe(before);
  });

  it('BASECAMP: a local item.add shows in the folded state', async () => {
    const r = await createReplica({
      app: 'basecamp',
      replicaId: 'a',
      defs: basecampOps as OpDef[],
      materialize: basecampMaterialize,
      twinCount: (s) => Object.values(s.items).filter((i) => i.twins.fields.length > 0).length,
      store: openStore('bc'),
      seedOps: [],
    });
    r.local('item.add', 'i1', { name: 'Tent', key: 'a0', units: 1 });
    expect(r.state().items.i1?.name).toBe('Tent');
    expect(r.state().order).toEqual(['i1']);
    expect(r.twins()).toBe(0);
  });
});

describe('makeSeedOps', () => {
  it('throws on a script step whose op is not defined', () => {
    expect(() => makeSeedOps(defs, [{ name: 'nope', target: 't', payload: 1 }])).toThrow('unknown op: nope');
  });
});
