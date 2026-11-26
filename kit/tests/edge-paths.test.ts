// Edge paths in skeleton/ and apps/ that Vitest 4's AST-aware v8 coverage counts and Vitest 3's line-based remapping
// credited to their line: a trace printed without a seed, a failed peer-ack write, an ack from a peer that never named
// itself, a store write that produces new traffic during settle, and AFTERSHOCK's tie-break between off-roster surveyors.
// Each test drives the public module API. Written outside Kiro (claude-direct) with the Vitest 4 upgrade; no product file changed.
import 'fake-indexeddb/auto';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { causalLww } from '../../skeleton/src/core/merges.ts';
import { explainTrace } from '../../skeleton/src/core/simulate.ts';
import type { Op, OpDef } from '../../skeleton/src/core/types.ts';
import { attachLink, type Link, type Msg } from '../../skeleton/src/sync/link.ts';
import { createPair } from '../../skeleton/src/sync/pair.ts';
import { createReplica } from '../../skeleton/src/sync/replica.ts';
import { openStore, type OpStore } from '../../skeleton/src/sync/store.ts';
import { materialize as aftershock } from '../../apps/aftershock/src/model.ts';

const defs: OpDef[] = [{ name: 'set', merge: 'causal-lww', intent: { kind: 'set', field: 'v' } }];
interface S {
  v: string | undefined;
}
const materialize = (ops: readonly Op[]): S => ({ v: causalLww(ops.filter((o) => o.op === 'set') as Op<string>[]).value });
let uid = 0;

afterEach(() => vi.restoreAllMocks());

describe('explainTrace', () => {
  it('prints no seed line when the trace carries no seed', () => {
    const out = explainTrace({ trace: [{ replica: 'a', opId: 'a:1', stateAfter: '{"v":1}', duplicate: false }] });
    expect(out.split('\n')[0]).toBe('replica a:');
    expect(out).not.toMatch(/^seed /m);
    expect(out).toContain('step 0: a:1 -> {"v":1}');
  });
});

describe('replica peer ack', () => {
  it('a failed meta write is swallowed and the ack stays in memory (the write need not be awaited)', async () => {
    const inner = openStore(`edge-ack-${uid++}`);
    let failing = false; // startup writes (the incarnation id) succeed; the peer-ack write after them fails
    const store: OpStore = {
      ...inner,
      meta: { read: inner.meta.read, write: (patch) => (failing ? Promise.reject(new Error('quota exceeded')) : inner.meta.write(patch)) },
    };
    const r = await createReplica<S>({ app: 'edge', replicaId: 'a', defs, materialize, twinCount: () => 0, store, seedOps: [] });
    failing = true;
    r.peerAck.set('b', { b: 3 });
    await new Promise((ok) => setTimeout(ok, 0)); // let the rejected write settle; an unhandled rejection would fail the run
    expect(r.peerAck.get('b')).toEqual({ b: 3 });
    r.close();
  });
});

describe('link session', () => {
  it('an ack from a peer whose hello named no replica records no peer ack', async () => {
    const r = await createReplica<S>({ app: 'edge', replicaId: 'a', defs, materialize, twinCount: () => 0, store: openStore(`edge-link-${uid++}`), seedOps: [] });
    let deliver: (m: Msg) => void = () => undefined;
    const sent: Msg[] = [];
    const link: Link = {
      send: (m) => void sent.push(m),
      onMessage: (cb) => ((deliver = cb), () => undefined),
      onState: () => () => undefined,
      isUp: () => true,
    };
    const s = attachLink(r, link);
    deliver({ t: 'hello', replica: undefined as unknown as string, vv: {} });
    deliver({ t: 'ack', vv: { b: 1 } });
    expect(s.peerId()).toBeUndefined();
    expect(s.peerAckVV()).toEqual({});
    expect(s.peerVV()).toEqual({ b: 1 });
    s.detach();
    r.close();
  });
});

describe('pair settle', () => {
  it('keeps pumping when a store write produces new traffic, until the link is empty', async () => {
    let armed = false;
    let pair: Awaited<ReturnType<typeof createPair<S>>> | undefined;
    const store = (name: string): OpStore => {
      const inner = openStore(name);
      return {
        ...inner,
        meta: {
          read: inner.meta.read,
          async write(patch) {
            await inner.meta.write(patch);
            if (armed && name.endsWith(':a')) {
              armed = false;
              pair!.a.local('set', 't', 'written during settle'); // queued on the link while settle awaits the writes
            }
          },
        },
      };
    };
    pair = await createPair<S>({ app: `edge-pair-${uid++}`, defs, materialize, twinCount: () => 0, seedOps: [], schedule: () => undefined, store });
    armed = true;
    await pair.settle();
    expect(armed).toBe(false);
    expect(pair.link.pending()).toBe(0);
    expect(pair.b.state().v).toBe('written during settle');
    pair.close();
  });
});

describe('AFTERSHOCK counts order', () => {
  const op = (n: number, target: string, count: number): Op => ({
    id: `s:${n}`,
    op: 'sector.count',
    target,
    payload: { count },
    stamp: { l: n, r: 's', n },
    deps: n > 1 ? { s: n - 1 } : {},
  });

  it('off-roster surveyors follow the roster, ordered by id, and the comparator is a consistent total order', () => {
    const sort = vi.spyOn(Array.prototype, 'sort');
    const ops = [op(1, 'D4#zed', 1), op(2, 'D4#amy', 2), op(3, 'D4#rina', 3), op(4, 'D4#kai', 4)];
    const counts = aftershock(ops).sectors.D4!.counts;
    expect(counts.map((c) => c.who)).toEqual(['rina', 'amy', 'kai', 'zed']);
    // The comparator the fold handed to sort; both replicas must list counts the same way, so it must be a total order.
    const call = sort.mock.calls.find((_, i) => sort.mock.contexts[i] === counts);
    const cmp = call?.[0] as ((a: unknown, b: unknown) => number) | undefined;
    expect(cmp).toBeTypeOf('function');
    for (const a of counts) {
      expect(cmp!(a, a)).toBe(0);
      for (const b of counts) if (a !== b) expect(Math.sign(cmp!(a, b))).toBe(-Math.sign(cmp!(b, a)));
    }
  });
});
