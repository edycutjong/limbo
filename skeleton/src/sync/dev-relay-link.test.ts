import { readFileSync } from 'node:fs';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { causalLww } from '../core/merges.ts';
import type { Op, OpDef } from '../core/types.ts';
import { createDevRelayLink } from './dev-relay-link.ts';
import { attachLink, type Session } from './link.ts';
import { createReplica, type Replica } from './replica.ts';
import { countUnacked } from './status.ts';
import { openStore } from './store.ts';

const defs: OpDef[] = [{ name: 'set', merge: 'causal-lww', intent: { kind: 'set', field: 'v' } }];
const materialize = (ops: readonly Op[]) => ({ v: causalLww(ops as Op<string>[]).value });
let seq = 0;
const make = (id: string): Promise<Replica<{ v: string | undefined }>> =>
  createReplica({
    app: 't',
    replicaId: id,
    defs,
    materialize,
    twinCount: () => 0,
    store: openStore(`relay-${id}-${seq++}`),
    seedOps: [],
  });

/** An in-memory relay with the wire shape of e2e/spike/relay.mjs. `reachable = false` rejects like offline fetch. */
function fakeRelay() {
  const log: Op[] = [];
  const ids = new Set<string>();
  const s = { reachable: true, failPosts: 0, posts: 0 };
  const fetchFn = (async (input: string, init?: { method?: string; body?: string }) => {
    if (!s.reachable) throw new TypeError('offline');
    const url = new URL(input);
    const json = (body: unknown): Response => new Response(JSON.stringify(body), { status: 200 });
    if (init?.method === 'POST') {
      s.posts++;
      if (s.failPosts > 0) {
        s.failPosts--;
        throw new TypeError('post failed');
      }
      for (const op of JSON.parse(init.body ?? '[]') as Op[]) {
        if (ids.has(op.id)) continue;
        ids.add(op.id);
        log.push(op);
      }
      return json({ cursor: log.length });
    }
    const since = Number(url.searchParams.get('since') ?? 0);
    return json({ ops: log.slice(since), cursor: log.length });
  }) as unknown as typeof fetch;
  return { log, s, fetch: fetchFn };
}

type R = Replica<{ v: string | undefined }>;
const unacked = (r: R, sess: Session): number => countUnacked(r.log(), sess.peerAckVV(), sess.peerId());
const tick = (): Promise<unknown> => vi.advanceTimersByTimeAsync(200);
const ticks = async (n = 4): Promise<void> => {
  for (let i = 0; i < n; i++) await tick();
};

async function rig(id: string, relay: ReturnType<typeof fakeRelay>) {
  const r = await make(id);
  const link = createDevRelayLink({ url: 'http://relay.test', replicaId: id, fetch: relay.fetch, pollMs: 100 });
  const sess = attachLink(r, link);
  return { r, link, sess };
}

beforeEach(() => vi.useFakeTimers());
afterEach(() => vi.useRealTimers());

describe('DevRelayLink', () => {
  it('reads down while fetch rejects and up after', async () => {
    const relay = fakeRelay();
    relay.s.reachable = false;
    const { sess, link } = await rig('a', relay);
    await ticks();
    expect(link.isUp()).toBe(false);
    expect(sess.link()).toBe('down');
    relay.s.reachable = true;
    await ticks();
    expect(link.isUp()).toBe(true);
    expect(sess.link()).toBe('up');
    relay.s.reachable = false;
    await ticks();
    expect(sess.link()).toBe('down');
    sess.detach();
  });

  it('ops cross only while up, in both directions', async () => {
    const relay = fakeRelay();
    const a = await rig('a', relay);
    const b = await rig('b', relay);
    relay.s.reachable = false;
    await ticks();
    a.r.local('set', 't', 'from-a');
    await ticks();
    expect(relay.log).toHaveLength(0);
    expect(b.r.applied()).toHaveLength(0);
    expect(unacked(a.r, a.sess)).toBe(1);
    relay.s.reachable = true;
    await ticks(6);
    expect(relay.log.map((o) => o.id)).toEqual([a.r.log()[0]!.id]);
    expect(b.r.state().v).toBe('from-a');
    expect(unacked(a.r, a.sess)).toBe(0);
    a.sess.detach();
    b.sess.detach();
  });

  it('a failed POST leaves unacked unchanged and the retry works after the next up', async () => {
    const relay = fakeRelay();
    const a = await rig('a', relay);
    await ticks();
    expect(a.sess.link()).toBe('up');
    relay.s.failPosts = 1;
    a.r.local('set', 't', 'x');
    await vi.advanceTimersByTimeAsync(10);
    expect(relay.s.posts).toBe(1);
    expect(relay.log).toHaveLength(0);
    expect(unacked(a.r, a.sess)).toBe(1);
    expect(a.sess.link()).toBe('down');
    await ticks(6);
    expect(relay.log).toHaveLength(1);
    expect(unacked(a.r, a.sess)).toBe(0);
    expect(a.sess.link()).toBe('up');
    a.sess.detach();
  });

  it('duplicates change nothing and the link skips ops authored by its own replica', async () => {
    const relay = fakeRelay();
    const a = await rig('a', relay);
    const b = await rig('b', relay);
    await ticks();
    a.r.local('set', 't', 'one');
    await ticks(6);
    const before = JSON.stringify(b.r.log());
    const seen: Op[][] = [];
    const own: Op[][] = [];
    const probe = createDevRelayLink({ url: 'http://relay.test', replicaId: 'a', fetch: relay.fetch, pollMs: 100 });
    probe.onMessage((m) => {
      if (m.t === 'ops') own.push(m.ops);
    });
    const probeB = createDevRelayLink({ url: 'http://relay.test', replicaId: 'b', fetch: relay.fetch, pollMs: 100 });
    probeB.onMessage((m) => {
      if (m.t === 'ops') seen.push(m.ops);
    });
    await ticks();
    expect(own).toEqual([]); // the only op in the relay is a's own
    expect(seen.flat()).toHaveLength(1);
    // Re-deliver and re-post the same op: nothing changes.
    expect(b.r.receive(relay.log).applied).toHaveLength(0);
    await relay.fetch('http://relay.test/ops', { method: 'POST', body: JSON.stringify(relay.log) });
    expect(relay.log).toHaveLength(1);
    expect(JSON.stringify(b.r.log())).toBe(before);
    a.sess.detach();
    b.sess.detach();
  });

  it('stops polling when the last handler leaves', async () => {
    const relay = fakeRelay();
    const spy = vi.fn(relay.fetch);
    const link = createDevRelayLink({ url: 'http://relay.test', replicaId: 'a', fetch: spy, pollMs: 100 });
    const off = link.onState(() => undefined);
    await ticks(2);
    off();
    const n = spy.mock.calls.length;
    await ticks(4);
    expect(spy.mock.calls.length).toBe(n);
  });

  it('source has no BroadcastChannel, SharedWorker, Date.now, Math.random, React or DOM import', () => {
    const src = readFileSync(new URL('./dev-relay-link.ts', import.meta.url), 'utf8');
    for (const banned of ['BroadcastChannel', 'SharedWorker', 'Date.now', 'Math.random', 'react', 'document.', 'window.']) {
      expect(src.includes(banned), banned).toBe(false);
    }
    expect(src).not.toMatch(/from\s+['"](react|react-dom|[^'"]*\/limbo\/)/);
  });
});
