// Pair harness: two replicas `a` and `b` joined by an in-page link (simulated; browser offline does
// not affect it). `view` derives every sync number from live protocol state.
import type { Op, OpDef } from '../core/types.ts';
import { createInPageLink, type InPageLink, type LinkStats } from './inpage-link.ts';
import { attachLink, type Session } from './link.ts';
import { createReplica, type Replica } from './replica.ts';
import {
  countBehind,
  countUnacked,
  createExchangeLog,
  deriveSync,
  initialFixed,
  nextFixed,
  type Crossing,
  type FixedState,
  type SyncView,
} from './status.ts';
import { openStore, type OpStore } from './store.ts';

export interface PairConfig<S> {
  app: string;
  defs: readonly OpDef[];
  materialize(ops: readonly Op[]): S;
  twinCount(s: S): number;
  seedOps: readonly Op[];
  /** Opens the store for a database name (`limbo:<app>:a` / `:b`). Default `openStore`. */
  store?: (name: string) => OpStore;
  chaos?: { seed: number };
  /** Delivery scheduler; default `setTimeout`. A test passes a no-op and calls `settle`. */
  schedule?: (fn: () => void, delay: number) => void;
  /** Pump cap for `settle`; a resend loop fails instead of hanging. Default 10,000. */
  maxPumps?: number;
}

export interface PairView extends SyncView {
  /** FIXED is showing: LIVE and CLEAR was reached after a FOGGED or CONFLICT. */
  fixed: boolean;
  /** How many times FIXED has fired. */
  fixedCount: number;
}

export interface Pair<S> {
  a: Replica<S>;
  b: Replica<S>;
  sessions: { a: Session; b: Session };
  /** The in-page link, for tests that reload one side by hand. */
  link: InPageLink;
  cut(): void;
  restore(): void;
  settle(): Promise<void>;
  view(id: 'a' | 'b'): PairView;
  exchanges(): { last: Crossing[][]; open: Crossing[] };
  stats(): LinkStats;
  close(): void;
}

export async function createPair<S>(cfg: PairConfig<S>): Promise<Pair<S>> {
  const open = cfg.store ?? openStore;
  const stores = { a: open(`limbo:${cfg.app}:a`), b: open(`limbo:${cfg.app}:b`) };
  const make = (id: 'a' | 'b'): Promise<Replica<S>> =>
    createReplica<S>({
      app: cfg.app,
      replicaId: id,
      defs: cfg.defs,
      materialize: cfg.materialize,
      twinCount: cfg.twinCount,
      store: stores[id],
      seedOps: cfg.seedOps,
    });
  const [a, b] = await Promise.all([make('a'), make('b')]);
  const link = createInPageLink({ schedule: cfg.schedule, chaos: cfg.chaos });
  const sessions = { a: attachLink(a, link.a), b: attachLink(b, link.b) };
  const replicas = { a, b };
  const log = createExchangeLog(cfg.defs);
  const fixed: Record<'a' | 'b', { s: FixedState; count: number }> = {
    a: { s: initialFixed, count: 0 },
    b: { s: initialFixed, count: 0 },
  };

  const derive = (id: 'a' | 'b'): SyncView => {
    const r = replicas[id];
    const s = sessions[id];
    return deriveSync({
      link: s.link(),
      unacked: countUnacked(r.log(), s.peerAckVV(), s.peerId()),
      behind: countBehind(r.vv(), s.peerVV()),
      buffered: r.buffered().length,
      twins: r.twins(),
    });
  };
  const tick = (id: 'a' | 'b'): void => {
    const n = nextFixed(fixed[id].s, derive(id));
    fixed[id] = { s: n.state, count: fixed[id].count + (n.fired ? 1 : 0) };
  };
  const tickAll = (): void => {
    tick('a');
    tick('b');
    const [va, vb] = [derive('a'), derive('b')];
    log.settle(va.unacked + va.behind + vb.unacked + vb.behind === 0);
  };

  // The first connect is not an event: FIXED and the exchange log start after it.
  link.restore();
  await settle();
  for (const id of ['a', 'b'] as const) {
    sessions[id].onCross((ops) => log.cross(id, ops));
    replicas[id].subscribe(tickAll);
    sessions[id].subscribe(tickAll);
  }

  async function settle(): Promise<void> {
    const cap = cfg.maxPumps ?? 10_000;
    let pumps = 0;
    for (;;) {
      while (link.pump()) if (++pumps > cap) throw new Error(`settle: pump cap ${cap} exceeded (resend loop?)`);
      // Flushes every issued write. A store the caller closed (a hand-made reload) has none left to wait for.
      await Promise.all([stores.a, stores.b].map((s) => s.meta.write({}).catch(() => undefined)));
      if (link.pending() === 0) return;
    }
  }

  return {
    a,
    b,
    sessions,
    link,
    cut: () => link.cut(),
    restore: () => link.restore(),
    settle,
    view(id) {
      tick(id);
      return { ...derive(id), fixed: fixed[id].s.visible, fixedCount: fixed[id].count };
    },
    exchanges: () => ({ last: log.last(), open: log.open() }),
    stats: () => link.stats(),
    close() {
      for (const id of ['a', 'b'] as const) {
        sessions[id].detach();
        replicas[id].close();
      }
    },
  };
}
