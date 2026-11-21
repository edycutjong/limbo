// Solo page over the dev relay (design §8). Dev and test only: main.tsx reaches this file through a
// dynamic import behind a guard that a production build replaces with `false`, so it is not shipped.
// One replica, text output, no `LimboShell` (a remote peer cannot be a `Pair`). Demo data only.
import { canonical } from '../../../skeleton/src/core/causal.ts';
import type { Op } from '../../../skeleton/src/core/types.ts';
import { createDevRelayLink } from '../../../skeleton/src/sync/dev-relay-link.ts';
import { attachLink } from '../../../skeleton/src/sync/link.ts';
import { createReplica } from '../../../skeleton/src/sync/replica.ts';
import { countBehind, countUnacked, deriveSync, unackedOps } from '../../../skeleton/src/sync/status.ts';
import { openStore, type OpStore } from '../../../skeleton/src/sync/store.ts';
import * as config from '../app.config.ts';
import { reportSector, setCount, setNote } from './actions.ts';
import type { State } from './model.ts';
import type { Severity } from './sectors.ts';

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
  report(sector: string, severity: Severity): Op;
  count(sector: string, n: number): Op;
  note(sector: string, text: string): Op;
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
      h.textContent = `AFTERSHOCK · solo ${o.r}`;
      const status = document.createElement('p');
      status.setAttribute('data-status', '');
      status.textContent = view.chip;
      const ul = document.createElement('ul');
      for (const id of Object.keys(s.sectors)) {
        const sec = s.sectors[id]!;
        if (sec.severity === undefined && sec.total === 0 && sec.note === undefined) continue;
        const li = document.createElement('li');
        li.setAttribute('data-sector', id);
        const by = sec.counts.map((c) => `${c.who} ${c.value}`).join(', ');
        li.textContent = `${id} · ${sec.severity ?? 'no report'} · ${sec.total}${by ? ` (${by})` : ''} · ${sec.note ?? ''}`;
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
      report: (sector, severity) => reportSector(replica, sector, severity),
      count: (sector, n) => setCount(replica, sector, n),
      note: (sector, text) => setNote(replica, sector, text),
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
