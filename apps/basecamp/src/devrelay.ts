// Solo page over the dev relay (design §9). Dev and test only: main.tsx reaches this file through a
// dynamic import behind a guard that a production build replaces with `false`, so it is not shipped.
// One replica, text output, no `LimboShell` (a remote peer cannot be a `Pair`).
import { canonical } from '../../../skeleton/src/core/causal.ts';
import type { Op } from '../../../skeleton/src/core/types.ts';
import { attachLink } from '../../../skeleton/src/sync/link.ts';
import { createReplica } from '../../../skeleton/src/sync/replica.ts';
import { countBehind, countUnacked, deriveSync, unackedOps } from '../../../skeleton/src/sync/status.ts';
import { openStore, type OpStore } from '../../../skeleton/src/sync/store.ts';
import { createDevRelayLink } from '../../../skeleton/src/sync/dev-relay-link.ts';
import * as config from '../app.config.ts';
import { claimItem, deleteItem, tickItem } from './actions.ts';
import type { State } from './model.ts';

export interface SoloOptions {
  url: string;
  r: string;
  el?: HTMLElement;
  fetch?: typeof fetch;
  pollMs?: number;
  store?: OpStore;
}

export interface SoloDebug {
  ready: Promise<void>;
  state(): string;
  ops(): Op[];
  queued(): Op[];
  tick(id: string, ticked?: boolean): Op;
  delete(id: string): Op;
  claim(id: string): Op;
}

export function mountSolo(o: SoloOptions): { ready: Promise<void>; close(): void } {
  const el = o.el ?? document.getElementById('root')!;
  let close = (): void => undefined;
  const ready = (async (): Promise<void> => {
    const store = o.store ?? openStore(`limbo:${config.name}:solo-${o.r}`);
    const replica = await createReplica<State>({
      app: config.name,
      replicaId: o.r,
      defs: config.defs,
      materialize: config.materialize,
      twinCount: config.twinCount,
      store,
      seedOps: config.seedOps,
    });
    const link = createDevRelayLink({
      url: o.url,
      replicaId: o.r,
      ...(o.fetch ? { fetch: o.fetch } : {}),
      ...(o.pollMs === undefined ? {} : { pollMs: o.pollMs }),
    });
    const session = attachLink(replica, link);

    const render = (): void => {
      const s = replica.state();
      const view = deriveSync({
        link: session.link(),
        unacked: countUnacked(replica.log(), session.peerAckVV(), session.peerId()),
        behind: countBehind(replica.vv(), session.peerVV()),
        buffered: replica.buffered().length,
        twins: replica.twins(),
      });
      el.replaceChildren();
      const h = document.createElement('h1');
      h.textContent = `BASECAMP · solo ${o.r}`;
      const status = document.createElement('p');
      status.setAttribute('data-status', '');
      status.textContent = view.chip;
      const ul = document.createElement('ul');
      for (const id of s.order) {
        const it = s.items[id]!;
        const li = document.createElement('li');
        li.setAttribute('data-item', id);
        li.textContent = `${it.name} · ${it.ticked ? 'ticked' : 'open'} · ${it.life} · ${it.winners.join(', ')}`;
        ul.append(li);
      }
      el.append(h, status, ul);
    };
    const unsub = [replica.subscribe(render), session.subscribe(render)];
    render();

    const debug: SoloDebug = {
      ready: Promise.resolve(),
      state: () => canonical(replica.state()),
      ops: () => replica.log(),
      queued: () => unackedOps(replica.log(), session.peerAckVV(), session.peerId()),
      tick: (id, ticked = true) => tickItem(replica, id, ticked),
      delete: (id) => deleteItem(replica, id),
      claim: (id) => claimItem(replica, id),
    };
    (window as unknown as { limbo: SoloDebug }).limbo = debug;
    close = (): void => {
      unsub.forEach((u) => u());
      session.detach();
      replica.close();
    };
  })();
  (window as unknown as { limbo: Partial<SoloDebug> }).limbo = { ready };
  return { ready, close: () => close() };
}
