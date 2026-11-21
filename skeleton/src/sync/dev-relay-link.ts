// Dev and test only: a Link to the store-and-forward relay (e2e/spike/relay.mjs).
// The poll is client-side (setTimeout, only while a handler is attached). The relay has no timer.
import type { Op, VV } from '../core/types.ts';
import type { Link, Msg } from './link.ts';

export interface DevRelayOptions {
  url: string;
  replicaId: string;
  fetch?: typeof fetch;
  pollMs?: number;
}

export function createDevRelayLink(opts: DevRelayOptions): Link {
  const base = opts.url.replace(/\/+$/, '');
  const doFetch = opts.fetch ?? globalThis.fetch.bind(globalThis);
  const pollMs = opts.pollMs ?? 150;
  const msgs = new Set<(m: Msg) => void>();
  const states = new Set<(s: 'up' | 'down') => void>();
  let up = false;
  let cursor = 0;
  let relayVV: VV = {};
  let timer: ReturnType<typeof setTimeout> | undefined;
  let running = false;

  const own = (o: Op): boolean => o.stamp.r.split('#')[0] === opts.replicaId;
  const note = (ops: readonly Op[]): void => {
    for (const o of ops) if ((relayVV[o.stamp.r] ?? 0) < o.stamp.n) relayVV[o.stamp.r] = o.stamp.n;
  };
  const setState = (s: 'up' | 'down'): void => {
    if ((s === 'up') === up) return;
    up = s === 'up';
    states.forEach((fn) => fn(s));
  };
  const emit = (m: Msg): void => msgs.forEach((fn) => fn(m));
  const active = (): boolean => msgs.size + states.size > 0;

  async function poll(): Promise<void> {
    try {
      const res = await doFetch(`${base}/ops?since=${up ? cursor : 0}`);
      if (!res.ok) throw new Error(`relay ${res.status}`);
      const body = (await res.json()) as { ops: Op[]; cursor: number };
      if (!active()) return;
      const wasDown = !up;
      if (wasDown) relayVV = {};
      note(body.ops);
      cursor = body.cursor;
      if (wasDown) {
        setState('up');
        emit({ t: 'hello', replica: 'relay', vv: { ...relayVV } });
      }
      const fresh = body.ops.filter((o) => !own(o));
      if (fresh.length > 0) emit({ t: 'ops', ops: fresh, vv: { ...relayVV } });
    } catch {
      setState('down');
    }
  }
  function loop(): void {
    if (running || !active()) return;
    running = true;
    const tick = async (): Promise<void> => {
      await poll();
      running = false;
      if (active()) {
        running = true;
        timer = setTimeout(() => void tick(), pollMs);
      }
    };
    void tick();
  }
  const release = (): void => {
    if (!active() && timer !== undefined) {
      clearTimeout(timer);
      timer = undefined;
      running = false;
    }
  };

  return {
    send(m) {
      if (!up || m.t !== 'ops') return; // the relay has no presence; nothing goes out while down
      void (async () => {
        try {
          const res = await doFetch(`${base}/ops`, {
            method: 'POST',
            headers: { 'content-type': 'application/json' },
            body: JSON.stringify(m.ops),
          });
          if (!res.ok) throw new Error(`relay ${res.status}`);
          note(m.ops);
          emit({ t: 'ack', vv: { ...relayVV } });
        } catch {
          setState('down');
        }
      })();
    },
    onMessage(cb) {
      msgs.add(cb);
      loop();
      return () => {
        msgs.delete(cb);
        release();
      };
    },
    onState(cb) {
      states.add(cb);
      loop();
      return () => {
        states.delete(cb);
        release();
      };
    },
    isUp: () => up,
  };
}
