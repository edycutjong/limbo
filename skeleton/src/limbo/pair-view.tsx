// ReplicaPair and LinkCord: two cards over one simulated link. The cord and lever follow `view('a').link`; they keep no state.
import { useEffect, useState, type ReactNode } from 'react';
import type { Pair } from '../sync/pair.ts';
import { FixedStamp, Fog, StatusChip, Wisps } from './marks.tsx';
import { Inspector } from './inspector.tsx';
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
function Lever(p: { pair: Pair<any> }): ReactNode {
  const { view } = useLimbo('a');
  const up = view.link !== 'down';
  return (
    <button type="button" className="limbo-button limbo-lever" onClick={() => (up ? p.pair.cut() : p.pair.restore())}>
      {up ? 'Cut link' : 'Restore link'}
    </button>
  );
}

export function LinkCord(p: { pair: Pair<any> }): ReactNode {
  const { view } = useLimbo('a');
  const up = view.link !== 'down';
  return (
    <div className="limbo-cord" data-cord={up ? 'intact' : 'severed'}>
      <svg className="limbo-cord-line" viewBox="0 0 100 10" aria-hidden="true" preserveAspectRatio="none">
        {up ? <path d="M0 5H100" /> : <path d="M0 5H42M58 5H100" strokeDasharray="3 3" />}
      </svg>
      <Lever pair={p.pair} />
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
  onAdd?(): void;
  /** Query string for the `?replicas=1|2` override. Defaults to `location.search`. */
  search?: string;
}): ReactNode {
  const narrow = '(max-width: 639px)';
  const forced = new URLSearchParams(p.search ?? (typeof location === 'undefined' ? '' : location.search)).get('replicas');
  const [wide, setWide] = useState(() => !window.matchMedia(narrow).matches);
  const [two, setTwo] = useState(false);
  useEffect(() => {
    const m = window.matchMedia(narrow);
    const on = (e: { matches: boolean }): void => setWide(!e.matches);
    m.addEventListener('change', on);
    return () => m.removeEventListener('change', on);
  }, []);
  const single = !two && (forced === '1' || (forced !== '2' && !wide));
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
  if (single) {
    return (
      <div className="limbo-single">
        {card('a')}
        <div className="limbo-bar" role="toolbar" aria-label="Actions">
          <button type="button" className="limbo-button" onClick={p.onAdd}>
            Add
          </button>
          <Inspector id="a" lever={<Lever pair={p.pair} />} />
          <button type="button" className="limbo-button" onClick={() => setTwo(true)}>
            Try two replicas
          </button>
        </div>
      </div>
    );
  }
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
