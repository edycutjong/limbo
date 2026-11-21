import 'fake-indexeddb/auto';
import { describe, expect, it } from 'vitest';
import { causalLww } from '../core/merges.ts';
import type { Op, OpDef } from '../core/types.ts';
import { attachLink } from './link.ts';
import { createPair } from './pair.ts';
import { createReplica } from './replica.ts';
import { openStore } from './store.ts';

const defs: OpDef[] = [
  { name: 'set', merge: 'causal-lww', intent: { kind: 'set', field: 'v' } },
  { name: 'delta', merge: 'commutes', intent: { kind: 'delta', field: 'n' } },
];
interface S {
  v: string | undefined;
  n: number;
  twins: number;
}
const materialize = (ops: readonly Op[]): S => {
  const r = causalLww(ops.filter((o) => o.op === 'set') as Op<string>[]);
  return {
    v: r.value,
    n: ops.filter((o) => o.op === 'delta').reduce((a, o) => a + (o.payload as number), 0),
    twins: r.twins.length,
  };
};
const twinCount = (s: S): number => s.twins;

let uid = 0;
const make = (extra: { store?: (name: string) => ReturnType<typeof openStore> } = {}) =>
  createPair<S>({
    app: `pair-${uid++}`,
    defs,
    materialize,
    twinCount,
    seedOps: [],
    schedule: () => undefined, // manual: `settle` delivers
    ...extra,
  });

describe('pair harness', () => {
  it('starts LIVE with no FIXED and no exchange', async () => {
    const p = await make();
    for (const id of ['a', 'b'] as const) {
      const v = p.view(id);
      expect(v).toMatchObject({ axis: 'LIVE', conflict: 'CLEAR', chip: 'Live', fixed: false, fixedCount: 0 });
    }
    expect(p.exchanges()).toEqual({ last: [], open: [] });
    p.close();
  });

  it('edits on both sides while cut give FOGGED with unacked equal to the op count', async () => {
    const p = await make();
    p.cut();
    p.a.local('delta', 't', 1);
    p.a.local('delta', 't', 1);
    p.b.local('delta', 't', 5);
    const before = p.stats().delivered;
    await p.settle();
    expect(p.stats().delivered).toEqual(before); // nothing crosses while cut
    expect(p.view('a')).toMatchObject({ axis: 'FOGGED', unacked: 2, behind: 0, chip: 'Offline — 2 waiting' });
    expect(p.view('b')).toMatchObject({ axis: 'FOGGED', unacked: 1, behind: 0, chip: 'Offline — 1 waiting' });
    p.close();
  });

  it('after restore the view passes through connecting and DEVELOPING, then LIVE', async () => {
    const p = await make();
    p.cut();
    p.a.local('delta', 't', 1);
    p.b.local('delta', 't', 5);
    p.restore();
    expect(p.sessions.a.link()).toBe('connecting');
    expect(p.view('a').axis).toBe('FOGGED');
    // Deliver one message at a time and record each axis.
    const axes = new Set<string>();
    while (p.link.pump()) axes.add(p.view('a').axis);
    expect(axes.has('DEVELOPING')).toBe(true);
    await p.settle();
    expect(p.view('a')).toMatchObject({ axis: 'LIVE', unacked: 0, behind: 0, chip: 'Live' });
    expect(p.view('b')).toMatchObject({ axis: 'LIVE', unacked: 0, behind: 0, chip: 'Live' });
    expect(p.a.state().n).toBe(6);
    expect(p.b.state().n).toBe(6);
    p.close();
  });

  it('a conflicting edit gives CONFLICT and the chip with the count; FIXED waits for the fix', async () => {
    const p = await make();
    p.cut();
    p.a.local('set', 't', 'from-a');
    p.b.local('set', 't', 'from-b');
    p.restore();
    await p.settle();
    expect(p.view('a')).toMatchObject({ axis: 'LIVE', conflict: 'CONFLICT', twins: 1, chip: 'Live · 1 conflict', fixed: false });
    expect(p.view('b').chip).toBe('Live · 1 conflict');
    expect(p.view('a').fixedCount).toBe(0);
    // The user resolves by writing a value that covers both.
    p.a.local('set', 't', 'resolved');
    await p.settle();
    expect(p.view('a')).toMatchObject({ conflict: 'CLEAR', chip: 'Live', fixed: true, fixedCount: 1 });
    expect(p.view('b')).toMatchObject({ conflict: 'CLEAR', fixed: true, fixedCount: 1 });
    p.close();
  });

  it('FIXED fires once after a partition and not at start', async () => {
    const p = await make();
    expect(p.view('a').fixedCount).toBe(0);
    p.cut();
    p.a.local('delta', 't', 1);
    expect(p.view('a').fixedCount).toBe(0);
    p.restore();
    await p.settle();
    expect(p.view('a')).toMatchObject({ fixed: true, fixedCount: 1 });
    expect(p.view('a').fixedCount).toBe(1); // reading again does not fire again
    expect(p.view('b')).toMatchObject({ fixed: true, fixedCount: 1 });
    // A later online edit goes DEVELOPING and back: hides, never fires again.
    p.a.local('delta', 't', 1);
    expect(p.view('a').fixed).toBe(false);
    await p.settle();
    expect(p.view('a')).toMatchObject({ axis: 'LIVE', fixedCount: 1 });
    p.close();
  });

  it('the exchange holds the partition-era ops with declared merge names and counts no duplicate', async () => {
    const p = await make();
    p.cut();
    p.a.local('delta', 't', 1);
    p.a.local('set', 't', 'x');
    p.b.local('delta', 't', 2);
    p.restore();
    await p.settle();
    const { last, open } = p.exchanges();
    expect(open).toEqual([]);
    expect(last).toHaveLength(1);
    const ex = last[0]!;
    expect(ex).toHaveLength(3); // each op crossed exactly once, re-sends not counted
    expect(ex.map((c) => `${c.side}:${c.name}:${c.merge}`).sort()).toEqual([
      'a:delta:commutes', // received by a (b's op)
      'b:delta:commutes',
      'b:set:causal-lww',
    ]);
    expect(ex.every((c) => c.stamp.r.length > 0 && typeof c.deps === 'object')).toBe(true);
    p.close();
  });

  it('a reload of one replica mid-session leaves no false ack: peerAckVV drops and ops are re-sent', async () => {
    const p = await make();
    const op = p.a.local('delta', 't', 3);
    await p.settle();
    expect(p.view('a').unacked).toBe(0);
    expect(p.b.applied().map((o) => o.id)).toEqual([op.id]);

    // B reloads and its disk lost the op: a fresh store, same member id.
    p.sessions.b.detach();
    p.b.close();
    const b2 = await createReplica<S>({
      app: 'reload',
      replicaId: 'b',
      defs,
      materialize,
      twinCount,
      store: openStore(`reload-${uid++}`),
      seedOps: [],
    });
    const sb2 = attachLink(b2, p.link.b);
    p.cut();
    p.restore();
    p.link.pump(); // a's hello reaches b2
    p.link.pump(); // b2's hello replaces a's peerAckVV
    expect(p.sessions.a.peerAckVV()[p.a.ns]).toBeUndefined();
    expect(p.view('a').unacked).toBe(1); // unacked again
    await p.settle();
    expect(b2.applied().map((o) => o.id)).toEqual([op.id]); // re-sent
    expect(p.view('a')).toMatchObject({ axis: 'LIVE', unacked: 0 });
    expect(sb2.link()).toBe('up');
    p.close();
  });

  it('settle fails on a resend loop instead of hanging', async () => {
    const p = await createPair<S>({
      app: `pair-${uid++}`,
      defs,
      materialize,
      twinCount,
      seedOps: [],
      schedule: () => undefined,
      maxPumps: 3,
    });
    p.a.local('delta', 't', 1);
    p.a.local('delta', 't', 1);
    await expect(p.settle()).rejects.toThrow(/pump cap/);
    p.close();
  });

  it('queued(id) matches view(id).unacked while cut and after restore', async () => {
    const p = await make();
    p.cut();
    p.a.local('delta', 't', 1);
    p.a.local('set', 't', 'x');
    p.b.local('delta', 't', 5);
    for (const id of ['a', 'b'] as const) expect(p.queued(id)).toHaveLength(p.view(id).unacked);
    expect(p.queued('a').map((o) => o.op)).toEqual(['delta', 'set']);
    p.restore();
    await p.settle();
    for (const id of ['a', 'b'] as const) {
      expect(p.queued(id)).toEqual([]);
      expect(p.view(id).unacked).toBe(0);
    }
    p.close();
  });

  it('an exchange stays open while a side holds a buffered op and settles once the missing op arrives', async () => {
    const p = await make();
    const z = (n: number): Op => ({ id: `seed:${n}`, op: 'delta', target: 't', payload: 1, stamp: { l: 5 + n, r: 'seed', n }, deps: n > 1 ? { seed: n - 1 } : {} });
    p.a.receive([z(2)]); // held: its predecessor is missing
    expect(p.view('a').buffered).toBe(1);
    p.cut();
    p.a.local('delta', 't', 1);
    p.restore();
    await p.settle();
    expect(p.view('a')).toMatchObject({ unacked: 0, behind: 0, buffered: 1 });
    expect(p.view('b')).toMatchObject({ unacked: 0, behind: 0 });
    expect(p.exchanges().open.length).toBeGreaterThan(0);
    expect(p.exchanges().last).toHaveLength(0);
    p.a.receive([z(1)]);
    await p.settle();
    expect(p.view('a').buffered).toBe(0);
    expect(p.exchanges().open).toEqual([]);
    expect(p.exchanges().last.length).toBeGreaterThan(0);
    p.close();
  });

  it('crossing records carry id and target', async () => {
    const p = await make();
    p.cut();
    const o = p.a.local('delta', 'item-7', 1);
    p.restore();
    await p.settle();
    const all = [...p.exchanges().last.flat(), ...p.exchanges().open];
    const rec = all.find((c) => c.id === o.id);
    expect(rec).toMatchObject({ id: o.id, target: 'item-7', name: 'delta' });
    p.close();
  });
});
