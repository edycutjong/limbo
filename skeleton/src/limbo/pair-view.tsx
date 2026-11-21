// ReplicaPair and LinkCord: two cards over one simulated link. The cord and lever follow `view('a').link`; they keep no state.
import type { ReactNode } from 'react';
import type { Pair } from '../sync/pair.ts';
import { FixedStamp, Fog, StatusChip, Wisps } from './marks.tsx';
import { useLimbo, type Id } from './shell.tsx';

export const LINK_CAPTION = 'SIMULATED LINK — DevTools offline does not cut it; use the lever';

/** The card's single polite live region. It shows the announcement the hook derived. */
export function LiveRegion(p: { id: Id }): ReactNode {
  const { announce } = useLimbo(p.id);
  return (
    <div className="limbo-sr" aria-live="polite">
      {announce}
    </div>
  );
}

/** A line between the cards with a lever. Label and drawn state come from `view('a').link`. */
export function LinkCord(p: { pair: Pair<any> }): ReactNode {
  const { view } = useLimbo('a');
  const up = view.link !== 'down';
  return (
    <div className="limbo-cord" data-cord={up ? 'intact' : 'severed'}>
      <svg className="limbo-cord-line" viewBox="0 0 100 10" aria-hidden="true" preserveAspectRatio="none">
        {up ? <path d="M0 5H100" /> : <path d="M0 5H42M58 5H100" strokeDasharray="3 3" />}
      </svg>
      <button type="button" className="limbo-button limbo-lever" onClick={() => (up ? p.pair.cut() : p.pair.restore())}>
        {up ? 'Cut link' : 'Restore link'}
      </button>
      <p className="limbo-cord-caption">{LINK_CAPTION}</p>
    </div>
  );
}

/** Both replicas as mounted cards with a cord between them. The app supplies rows (`renderReplica`) and `onReset`. */
export function ReplicaPair(p: {
  pair: Pair<any>;
  names: { a: string; b: string };
  plate: { a: number | string; b: number | string };
  onReset(): void;
  renderReplica?(id: Id): ReactNode;
}): ReactNode {
  const card = (id: Id): ReactNode => (
    <section className="limbo-card limbo-pair-card" aria-label={`Replica ${id.toUpperCase()}`} data-replica={id}>
      <StatusChip id={id} />
      <FixedStamp id={id} />
      <Fog id={id}>{p.renderReplica?.(id)}</Fog>
      <Wisps id={id} plate={p.plate[id]} />
      <LiveRegion id={id} />
      <p className="limbo-imprint">{`REPLICA ${id.toUpperCase()} — ${p.names[id]}`}</p>
    </section>
  );
  return (
    <div className="limbo-pair">
      {card('a')}
      <LinkCord pair={p.pair} />
      {card('b')}
      <button type="button" className="limbo-button limbo-reset" onClick={p.onReset}>
        Reset demo
      </button>
    </div>
  );
}
