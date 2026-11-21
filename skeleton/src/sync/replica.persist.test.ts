import 'fake-indexeddb/auto';
import { describe, expect, it } from 'vitest';
import { causalLww } from '../core/merges.ts';
import { createOp, newReplica } from '../core/causal.ts';
import type { Op, OpDef } from '../core/types.ts';
import { createReplica, makeSeedOps, type Replica } from './replica.ts';
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

let uid = 0;
const dbName = (): string => `persist-${uid++}`;
const wait = (): Promise<void> => new Promise((r) => setTimeout(r, 30));

const open = (
  name: string,
  replicaId = 'a',
  seedOps: readonly Op[] = [],
  wrap: (s: OpStore) => OpStore = (s) => s,
): Promise<Replica<S>> =>
  createReplica<S>({ app: 't', replicaId, defs, materialize, twinCount: () => 0, store: wrap(openStore(name)), seedOps });

describe('replica persistence', () => {
  it('reload restores state, log, vv and saved; k increments per load', async () => {
    const name = dbName();
    const r1 = await open(name);
    expect(r1.ns).toBe('a#1');
    r1.local('set', 't', 'x');
    r1.local('delta', 't', 4);
    await wait();
    const log1 = r1.log().map((o) => o.id);
    const state1 = r1.state();
    r1.close();

    const r2 = await open(name);
    expect(r2.ns).toBe('a#2');
    expect(r2.state()).toEqual(state1);
    expect(r2.log().map((o) => o.id).sort()).toEqual([...log1].sort());
    expect(r2.vv()).toEqual({ 'a#1': 2 });
    expect(log1.every((id) => r2.saved(id))).toBe(true);
    const next = r2.local('delta', 't', 1);
    expect(next.id).toBe('a#2:1');
    expect(next.stamp.l).toBe(3); // Lamport restarts from the stored maximum
    expect(next.deps).toEqual({ 'a#1': 2 });
    await wait();
    r2.close();

    const r3 = await open(name);
    expect(r3.ns).toBe('a#3');
    expect(r3.state().n).toBe(5);
    r3.close();
  });

  it('persists peerAck across reload', async () => {
    const name = dbName();
    const r1 = await open(name);
    r1.peerAck.set('b', { 'b#1': 3 });
    await wait();
    r1.close();
    const r2 = await open(name);
    expect(r2.peerAck.get('b')).toEqual({ 'b#1': 3 });
    expect(r2.peerAck.get('zz')).toEqual({});
    r2.close();
  });

  it('a dropped write never reuses a dot; the stalled own op heals when a peer supplies it', async () => {
    const name = dbName();
    const drop = (s: OpStore): OpStore => ({
      ...s,
      put: (op) => (op.id === 'a#1:2' ? Promise.resolve() : s.put(op)),
    });
    const r1 = await open(name, 'a', [], drop);
    const o1 = r1.local('delta', 't', 1);
    const o2 = r1.local('delta', 't', 10); // lost
    const o3 = r1.local('delta', 't', 100);
    await wait();
    r1.close();

    const r2 = await open(name);
    expect(r2.log().map((o) => o.id)).toEqual(['a#1:1', 'a#1:3']);
    expect(r2.buffered().map((o) => o.id)).toEqual(['a#1:3']);
    expect(r2.vv()).toEqual({ 'a#1': 1 });
    expect(r2.stalledOwn()).toBe(1);
    const fresh = r2.local('delta', 't', 1000);
    expect(fresh.id).toBe('a#2:1');
    expect(fresh.stamp.r).not.toBe(o1.stamp.r);
    expect([o1.id, o2.id, o3.id]).not.toContain(fresh.id);
    expect(r2.stalledOwn()).toBe(1);

    // a peer that holds the lost op supplies it
    const res = r2.receive([o2]);
    expect(res.applied.map((o) => o.id)).toEqual(['a#1:2', 'a#1:3']);
    expect(r2.stalledOwn()).toBe(0);
    expect(r2.state().n).toBe(1111);
    r2.close();
  });

  it('saved(id) is false until put resolves', async () => {
    let release!: () => void;
    const gate = new Promise<void>((r) => (release = r));
    const r = await open(dbName(), 'a', [], (s) => ({ ...s, put: (op) => gate.then(() => s.put(op)) }));
    const op = r.local('delta', 't', 1);
    await wait();
    expect(r.saved(op.id)).toBe(false);
    release();
    await wait();
    expect(r.saved(op.id)).toBe(true);
    r.close();
  });

  it('saved(id) stays false when put fails, and the failure is recorded', async () => {
    const r = await open(dbName(), 'a', [], (s) => ({ ...s, put: () => Promise.reject(new Error('disk')) }));
    const op = r.local('delta', 't', 1);
    await wait();
    expect(r.saved(op.id)).toBe(false);
    expect(r.rejected()).toEqual([{ id: op.id, reason: 'store-failed' }]);
    expect(r.log()).toEqual([op]);
    r.close();
  });

  it('a held op survives reload; its dependency then applies it, with no vv entry in between', async () => {
    const name = dbName();
    const p = newReplica('p#1');
    const dep = createOp(p, defs[1]!, 't', 2);
    const x = createOp(p, defs[1]!, 't', 3); // p#1:2 needs p#1:1
    const r1 = await open(name, 'b');
    expect(r1.receive([x]).held).toBe(1);
    await wait();
    r1.close();

    const r2 = await open(name, 'b');
    expect(r2.buffered().map((o) => o.id)).toEqual(['p#1:2']);
    expect(r2.vv()).toEqual({});
    expect(r2.state().n).toBe(0);
    const res = r2.receive([dep]);
    expect(res.applied.map((o) => o.id)).toEqual(['p#1:1', 'p#1:2']);
    expect(r2.vv()).toEqual({ 'p#1': 2 });
    expect(r2.state().n).toBe(5);
    r2.close();
  });

  it('a changed seed version rejects with seed-version-changed', async () => {
    const name = dbName();
    const seedA = makeSeedOps(defs, [{ name: 'set', target: 't', payload: 'one' }]);
    const seedB = makeSeedOps(defs, [{ name: 'set', target: 't', payload: 'two' }]);
    const r1 = await open(name, 'a', seedA);
    await wait();
    r1.close();
    await expect(open(name, 'a', seedB)).rejects.toMatchObject({ name: 'seed-version-changed' });
    const r3 = await open(name, 'a', seedA);
    expect(r3.ns).toBe('a#2');
    r3.close();
  });
});
