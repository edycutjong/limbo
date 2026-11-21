// The sync protocol: a session attaches one replica to one Link. hello / ops / ack only.
// Every vv sent is the sender's applied frontier; held ops never appear in it.
import type { Op, VV } from '../core/types.ts';
import type { Replica } from './replica.ts';

export type Msg =
  | { t: 'hello'; replica: string; vv: VV }
  | { t: 'ops'; ops: Op[]; vv: VV }
  | { t: 'ack'; vv: VV };

export interface Link {
  /** Drops the message when the link is down. */
  send(m: Msg): void;
  onMessage(cb: (m: Msg) => void): () => void;
  onState(cb: (s: 'up' | 'down') => void): () => void;
  isUp(): boolean;
}

export interface Session {
  link(): 'up' | 'down' | 'connecting';
  peerId(): string | undefined;
  /** `vv` of the peer's latest hello or ack; the last value is kept after the link goes down. */
  peerAckVV(): VV;
  /** `vv` of the peer's latest message of any kind in this link session. */
  peerVV(): VV | undefined;
  /** Ops newly applied by a receive, for the exchange log. */
  onCross(cb: (ops: Op[]) => void): () => void;
  subscribe(fn: () => void): () => void;
  detach(): void;
}

const same = (x: VV, y: VV | undefined): boolean => {
  if (!y) return false;
  for (const k of new Set([...Object.keys(x), ...Object.keys(y)])) if ((x[k] ?? 0) !== (y[k] ?? 0)) return false;
  return true;
};
const byDot = (a: Op, b: Op): number =>
  a.stamp.r !== b.stamp.r ? (a.stamp.r < b.stamp.r ? -1 : 1) : a.stamp.n - b.stamp.n;

export function attachLink<S>(replica: Replica<S>, link: Link, opts: { chunk?: number } = {}): Session {
  const chunk = Math.max(1, opts.chunk ?? 50);
  let helloSent = false;
  let helloSeen = false;
  let peer: string | undefined;
  let lastSeen: VV | undefined;
  let peerVV: VV | undefined;
  let ignoredEarly = false;
  let inHandler = false;
  const sent = new Set<string>();
  const subs = new Set<() => void>();
  const crossSubs = new Set<(ops: Op[]) => void>();
  const notify = (): void => subs.forEach((fn) => fn());

  const reset = (): void => {
    helloSent = helloSeen = ignoredEarly = false;
    lastSeen = peerVV = undefined;
    sent.clear();
  };
  const sendHello = (): void => {
    helloSent = true;
    link.send({ t: 'hello', replica: replica.id, vv: replica.vv() });
  };
  /** Send applied ops `vv` does not cover. `fresh` skips ops already sent in this link session. */
  const sendMissing = (vv: VV, fresh = false): void => {
    if (!link.isUp()) return;
    const missing = replica
      .applied()
      .filter((o) => (vv[o.stamp.r] ?? 0) < o.stamp.n && !(fresh && sent.has(o.id)))
      .sort(byDot);
    for (let i = 0; i < missing.length; i += chunk) {
      const ops = missing.slice(i, i + chunk);
      ops.forEach((o) => sent.add(o.id));
      link.send({ t: 'ops', ops, vv: replica.vv() });
    }
  };
  /** Record the peer's vv; re-serve when it differs from the last one seen in this session. */
  const observeVV = (vv: VV): void => {
    peerVV = vv;
    const changed = !same(vv, lastSeen);
    lastSeen = vv;
    if (changed) sendMissing(vv);
  };

  const onMsg = (m: Msg): void => {
    if (m.t === 'hello') {
      helloSeen = true;
      peer = m.replica;
      replica.peerAck.set(peer, m.vv);
      peerVV = lastSeen = m.vv;
      // A reordered link can deliver the peer's ops before its hello. Those were ignored, so
      // say hello again; the peer re-serves from the fresh vv.
      if (!helloSent || ignoredEarly) sendHello();
      ignoredEarly = false;
      sendMissing(m.vv);
    } else if (!helloSeen) {
      ignoredEarly = true;
      return; // before hello: ignored
    } else if (m.t === 'ops') {
      peerVV = m.vv;
      const res = replica.receive(m.ops);
      if (res.applied.length > 0) crossSubs.forEach((fn) => fn(res.applied));
      link.send({ t: 'ack', vv: replica.vv() });
      observeVV(m.vv);
    } else {
      if (peer !== undefined) replica.peerAck.set(peer, m.vv);
      observeVV(m.vv);
    }
  };

  const offs = [
    link.onMessage((m) => {
      inHandler = true;
      try {
        onMsg(m);
      } finally {
        inHandler = false;
      }
      notify();
    }),
    link.onState((s) => {
      reset();
      if (s === 'up') sendHello();
      notify();
    }),
    replica.subscribe(() => {
      // A local op while up: send what the peer lacks and we have not sent yet.
      if (!inHandler && helloSeen && link.isUp()) sendMissing(peerVV ?? {}, true);
    }),
  ];
  if (link.isUp()) sendHello();

  return {
    link: () => (!link.isUp() ? 'down' : helloSeen ? 'up' : 'connecting'),
    peerId: () => peer,
    peerAckVV: () => (peer === undefined ? {} : replica.peerAck.get(peer)),
    peerVV: () => (peerVV ? { ...peerVV } : undefined),
    onCross(cb) {
      crossSubs.add(cb);
      return () => void crossSubs.delete(cb);
    },
    subscribe(fn) {
      subs.add(fn);
      return () => void subs.delete(fn);
    },
    detach() {
      offs.forEach((off) => off());
      subs.clear();
      crossSubs.clear();
    },
  };
}
