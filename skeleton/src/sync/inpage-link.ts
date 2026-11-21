// An in-memory link between two replicas in one page. The cut is explicit: browser-level
// offline does not affect it, so any UI must label it as simulated.
import { makeRand } from '../core/simulate.ts';
import type { Link, Msg } from './link.ts';

export interface InPageLinkOptions {
  /** Called once per sent message to schedule a `pump`. Default `setTimeout`. A test passes a no-op and pumps by hand. */
  schedule?: (fn: () => void, delay: number) => void;
  /** Seeded chaos: `pump` picks a random pending message of either direction and each send draws a random delay (ms). Never drops or duplicates. */
  chaos?: { seed: number };
}

export interface DirStats {
  ab: number;
  ba: number;
}
export interface LinkStats {
  sent: DirStats;
  delivered: DirStats;
  dropped: DirStats;
}

export interface InPageLink {
  a: Link;
  b: Link;
  cut(): void;
  restore(): void;
  /** Messages queued and not yet delivered. */
  pending(): number;
  /** Deliver the oldest pending message (a random one under chaos). False when empty or cut. */
  pump(): boolean;
  stats(): LinkStats;
}

type Dir = 'ab' | 'ba';

/** The link starts down; `restore()` brings it up and starts a link session. */
export function createInPageLink(opts: InPageLinkOptions = {}): InPageLink {
  const schedule = opts.schedule ?? ((fn, delay) => void setTimeout(fn, delay));
  const rand = opts.chaos ? makeRand(opts.chaos.seed) : undefined;
  let up = false;
  let queue: { to: Dir; msg: Msg }[] = [];
  const stats: LinkStats = {
    sent: { ab: 0, ba: 0 },
    delivered: { ab: 0, ba: 0 },
    dropped: { ab: 0, ba: 0 },
  };
  // Handlers per receiving end, keyed by the direction that reaches them.
  const msgCbs: Record<Dir, Set<(m: Msg) => void>> = { ab: new Set(), ba: new Set() };
  const stateCbs: Record<'a' | 'b', Set<(s: 'up' | 'down') => void>> = { a: new Set(), b: new Set() };

  const pump = (): boolean => {
    if (!up || queue.length === 0) return false;
    const next = queue.splice(rand ? rand.int(queue.length) : 0, 1)[0]!;
    stats.delivered[next.to]++;
    for (const cb of [...msgCbs[next.to]]) cb(structuredClone(next.msg));
    return true;
  };
  const end = (me: 'a' | 'b'): Link => {
    const out: Dir = me === 'a' ? 'ab' : 'ba';
    const inbound: Dir = me === 'a' ? 'ba' : 'ab';
    return {
      send(msg) {
        if (!up) {
          stats.dropped[out]++;
          return;
        }
        stats.sent[out]++;
        queue.push({ to: out, msg: structuredClone(msg) });
        schedule(pump, rand ? rand.int(20) : 0);
      },
      onMessage(cb) {
        msgCbs[inbound].add(cb);
        return () => void msgCbs[inbound].delete(cb);
      },
      onState(cb) {
        stateCbs[me].add(cb);
        return () => void stateCbs[me].delete(cb);
      },
      isUp: () => up,
    };
  };
  const emit = (s: 'up' | 'down'): void => {
    for (const side of ['a', 'b'] as const) for (const cb of [...stateCbs[side]]) cb(s);
  };

  return {
    a: end('a'),
    b: end('b'),
    cut() {
      if (!up) return;
      up = false;
      for (const q of queue) stats.dropped[q.to]++;
      queue = [];
      emit('down');
    },
    restore() {
      if (up) return;
      up = true;
      emit('up');
    },
    pending: () => queue.length,
    pump,
    stats: () => ({
      sent: { ...stats.sent },
      delivered: { ...stats.delivered },
      dropped: { ...stats.dropped },
    }),
  };
}
