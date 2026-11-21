import { describe, expect, it } from 'vitest';
import { canonical, createOp, newReplica } from '../core/causal.ts';
import { causalLww } from '../core/merges.ts';
import type { Op, OpDef } from '../core/types.ts';
import { createInPageLink } from './inpage-link.ts';
import { attachLink, type Link, type Msg } from './link.ts';
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
const make = (id: string): Promise<Replica<S>> =>
  createReplica<S>({ app: 't', replicaId: id, defs, materialize, twinCount: () => 0, store: openStore(`link-${id}`), seedOps: [] });

const manual = { schedule: () => undefined };
const settle = (link: { pump(): boolean }, cap = 1000): number => {
  let n = 0;
  while (link.pump()) if (++n > cap) throw new Error('resend loop');
  return n;
};
const canon = (r: Replica<S>): string => canonical(r.state());
const spy = (end: Link, log: Msg[], drop?: (m: Msg) => boolean): Link => ({
  ...end,
  send: (m) => {
    log.push(structuredClone(m));
    if (!drop?.(m)) end.send(m);
  },
});

async function rig() {
  const link = createInPageLink(manual);
  const a = await make('a');
  const b = await make('b');
  const sa = attachLink(a, link.a);
  const sb = attachLink(b, link.b);
  return { link, a, b, sa, sb };
}

describe('in-page link', () => {
  it('starts down, drops sends while down, and delivers nothing while cut', async () => {
    const { link, a, b } = await rig();
    expect(link.a.isUp()).toBe(false);
    link.a.send({ t: 'ack', vv: {} });
    expect(link.stats().dropped.ab).toBe(1);
    expect(link.pending()).toBe(0);
    link.restore();
    settle(link);
    link.cut();
    a.local('delta', 't', 1);
    b.local('delta', 't', 2);
    const before = link.stats().delivered;
    expect(link.pump()).toBe(false);
    expect(link.stats().delivered).toEqual(before);
    expect(link.stats().delivered).toEqual({ ab: before.ab, ba: before.ba });
  });

  it('cut() drops in-flight messages in both directions', async () => {
    const { link } = await rig();
    link.restore(); // both hellos in flight
    expect(link.pending()).toBe(2);
    link.cut();
    expect(link.pending()).toBe(0);
    expect(link.stats().dropped).toEqual({ ab: 1, ba: 1 });
    expect(link.stats().delivered).toEqual({ ab: 0, ba: 0 });
    expect(link.pump()).toBe(false);
  });

  it('delivers through the default setTimeout scheduler', async () => {
    const link = createInPageLink();
    const a = await make('a');
    const b = await make('b');
    attachLink(a, link.a);
    attachLink(b, link.b);
    a.local('set', 't', 'x');
    link.restore();
    await new Promise((r) => setTimeout(r, 30));
    expect(canon(b)).toBe(canon(a));
    expect(b.state().v).toBe('x');
  });
});

describe('link protocol', () => {
  it('after restore both canonical states deep-equal', async () => {
    const { link, a, b, sa, sb } = await rig();
    a.local('delta', 't', 1);
    b.local('delta', 't', 2);
    a.local('set', 't', 'from-a');
    b.local('set', 't', 'from-b');
    link.restore();
    expect(sa.link()).toBe('connecting');
    settle(link);
    expect(sa.link()).toBe('up');
    expect(sb.link()).toBe('up');
    expect(canon(a)).toBe(canon(b));
    expect(a.state().n).toBe(3);
  });

  it('a hello re-serves what the peer vv lacks', async () => {
    const { link, a, b } = await rig();
    const o1 = a.local('delta', 't', 1);
    const o2 = a.local('delta', 't', 1);
    link.restore();
    settle(link);
    expect(b.applied().map((o) => o.id)).toEqual([o1.id, o2.id]);
  });

  it('a stalled buffer heals via the next ack', async () => {
    const link = createInPageLink(manual);
    const a = await make('a');
    const b = await make('b');
    const aLog: Msg[] = [];
    const bLog: Msg[] = [];
    // B's ops messages are lost once; the protocol must still heal through an ack.
    let lost = false;
    attachLink(
      a,
      spy(link.a, aLog, (m) => !lost && m.t === 'ops' && m.ops.some((o) => o.id === 'a#1:1') && (lost = true)),
    );
    const sb = attachLink(b, spy(link.b, bLog, (m) => m.t === 'ops'));
    link.restore();
    settle(link);
    a.local('delta', 't', 1); // a#1:1: dropped on the wire
    const a2 = a.local('delta', 't', 1); // a#1:2: delivered, held at B
    settle(link);
    expect(b.buffered().map((o) => o.id)).toEqual([a2.id]);
    b.local('delta', 't', 5); // b#1:1: its ops message is dropped
    settle(link);
    expect(b.buffered()).toHaveLength(1);
    link.b.send({ t: 'ack', vv: b.vv() }); // vv changed since hello: A re-serves
    settle(link);
    expect(b.buffered()).toEqual([]);
    expect(b.state().n).toBe(7);
    expect(sb.peerId()).toBe('a');
  });

  it('a reloaded peer is re-served; peerAckVV goes down and the lost op is re-sent', async () => {
    const { link, a, b, sa, sb } = await rig();
    const op = a.local('delta', 't', 3);
    link.restore();
    settle(link);
    expect(b.applied()).toHaveLength(1);
    expect(sa.peerAckVV()[a.ns]).toBe(1);
    const unacked = (): Op[] => a.log().filter((o) => (sa.peerAckVV()[o.stamp.r] ?? 0) < o.stamp.n);
    expect(unacked()).toEqual([]);

    // B reloads and lost the op: a fresh store, same member id.
    sb.detach();
    b.close();
    const b2 = await make('b');
    const sb2 = attachLink(b2, link.b);
    link.cut();
    link.restore();
    expect(b2.applied()).toEqual([]);
    link.pump(); // one hello (a to b)
    link.pump(); // b2 hello (b to a) replaces peerAckVV
    expect(sa.peerAckVV()[a.ns]).toBeUndefined();
    expect(unacked().map((o) => o.id)).toEqual([op.id]); // unacked again
    settle(link);
    expect(b2.applied().map((o) => o.id)).toEqual([op.id]);
    expect(unacked()).toEqual([]);
    expect(sb2.link()).toBe('up');
  });

  it('an ack or ops with an unchanged vv causes no resend', async () => {
    const { link, a, b } = await rig();
    a.local('delta', 't', 1);
    link.restore();
    settle(link);
    const before = link.stats().sent;
    link.b.send({ t: 'ack', vv: b.vv() }); // same vv as the last one A saw
    settle(link);
    expect(link.stats().sent).toEqual({ ab: before.ab, ba: before.ba + 1 }); // only the ack itself
    // Duplicate ops with an unchanged vv: one ack back, no ops.
    link.b.send({ t: 'ops', ops: b.applied(), vv: b.vv() });
    link.a.send({ t: 'ops', ops: a.applied(), vv: a.vv() });
    const sentBefore = link.stats().sent;
    settle(link);
    const s = link.stats().sent;
    expect(s.ab - sentBefore.ab).toBe(1); // A acks B's duplicate ops
    expect(s.ba - sentBefore.ba).toBe(1);
    expect(link.pending()).toBe(0);
  });

  it('the message count after quiet is bounded', async () => {
    const { link, a, b } = await rig();
    for (let i = 0; i < 5; i++) {
      a.local('delta', 't', 1);
      b.local('delta', 't', 1);
    }
    link.restore();
    settle(link);
    expect(canon(a)).toBe(canon(b));
    const s = link.stats().sent;
    expect(s.ab + s.ba).toBeLessThanOrEqual(2 + 2 * 10); // hellos + at most an ops and an ack per op
    expect(link.pending()).toBe(0);
    a.local('delta', 't', 1);
    settle(link);
    const t = link.stats().sent;
    expect(t.ab + t.ba - (s.ab + s.ba)).toBeLessThanOrEqual(2); // one ops, one ack
  });

  it('chunks ops and each chunk carries the applied frontier', async () => {
    const link = createInPageLink(manual);
    const a = await make('a');
    const b = await make('b');
    const aLog: Msg[] = [];
    attachLink(a, spy(link.a, aLog), { chunk: 2 });
    attachLink(b, link.b);
    for (let i = 0; i < 5; i++) a.local('delta', 't', 1);
    link.restore();
    settle(link);
    const chunks = aLog.filter((m): m is Extract<Msg, { t: 'ops' }> => m.t === 'ops');
    expect(chunks.slice(0, 3).map((m) => m.ops.length)).toEqual([2, 2, 1]); // later chunks are re-serves of in-flight ops
    expect(chunks.every((m) => m.ops.length <= 2)).toBe(true);
    expect(b.state().n).toBe(5);
  });

  it('messages before hello are ignored', async () => {
    const link = createInPageLink(manual);
    const a = await make('a');
    const sa = attachLink(a, link.a);
    link.restore(); // A's hello queued; no peer session attached
    const x = await make('x');
    const op = x.local('delta', 't', 9);
    link.b.send({ t: 'ops', ops: [op], vv: x.vv() });
    link.b.send({ t: 'ack', vv: x.vv() });
    link.pump(); // A's own hello to nobody
    link.pump(); // ops
    link.pump(); // ack
    expect(a.applied()).toEqual([]);
    expect(sa.link()).toBe('connecting');
    expect(sa.peerVV()).toBeUndefined();
    expect(sa.peerAckVV()).toEqual({});
    expect(link.pending()).toBe(0); // no ack answered
  });

  it('every vv sent excludes held ops', async () => {
    const link = createInPageLink(manual);
    const a = await make('a');
    const b = await make('b');
    attachLink(a, link.a);
    const bLog: Msg[] = [];
    const bSeen: { m: Msg; vv: Record<string, number> }[] = [];
    attachLink(
      b,
      spy(link.b, bLog, (m) => (bSeen.push({ m, vv: b.vv() }), false)),
    );
    const a1 = a.local('delta', 't', 1);
    const a2 = a.local('delta', 't', 1);
    b.receive([a2]); // a2 held: a1 missing
    expect(b.buffered()).toHaveLength(1);
    link.restore();
    settle(link);
    expect(bSeen.length).toBeGreaterThan(0);
    for (const s of bSeen) {
      const vv = (s.m as { vv: Record<string, number> }).vv;
      expect(vv).toEqual(s.vv);
    }
    const hello = bSeen[0]!.m as Extract<Msg, { t: 'hello' }>;
    expect(hello.vv[a.ns]).toBeUndefined();
    expect(b.applied().map((o) => o.id)).toEqual([a1.id, a2.id]); // healed by the hello
  });
});

/** A hand-driven Link: the test chooses when it reads up and what the session receives. */
function fakeLink(initiallyUp: boolean) {
  let up = initiallyUp;
  let onMsg: ((m: Msg) => void) | undefined;
  const sent: Msg[] = [];
  const link: Link = {
    send: (m) => void sent.push(structuredClone(m)),
    onMessage: (cb) => ((onMsg = cb), () => undefined),
    onState: () => () => undefined,
    isUp: () => up,
  };
  return { link, sent, deliver: (m: Msg) => onMsg!(m), setUp: (v: boolean) => (up = v) };
}
const peerDelta = (id: string, n: number): Op[] => {
  const p = newReplica(id);
  return Array.from({ length: n }, () => createOp(p, defs[1]!, 't', 1));
};

describe('link serving', () => {
  it('serves missing ops ordered by replica id then counter, whatever order they arrived in', async () => {
    for (const arrival of [['p', 'q'], ['q', 'p']]) {
      const b = await make('b');
      for (const id of arrival) b.receive(peerDelta(id, 2));
      const f = fakeLink(true);
      attachLink(b, f.link);
      f.deliver({ t: 'hello', replica: 'z', vv: {} });
      const served = f.sent.filter((m) => m.t === 'ops').flatMap((m) => (m as Extract<Msg, { t: 'ops' }>).ops);
      expect(served.map((o) => o.id)).toEqual(['p:1', 'p:2', 'q:1', 'q:2']);
    }
  });

  it('serves nothing while the link reads down, then serves once it reads up', async () => {
    const b = await make('b');
    b.receive(peerDelta('p', 1));
    const f = fakeLink(false);
    attachLink(b, f.link);
    f.deliver({ t: 'hello', replica: 'z', vv: {} });
    expect(f.sent.filter((m) => m.t === 'ops')).toHaveLength(0);
    f.setUp(true);
    f.deliver({ t: 'ack', vv: { z: 1 } });
    expect(f.sent.filter((m) => m.t === 'ops')).toHaveLength(1);
  });
});
