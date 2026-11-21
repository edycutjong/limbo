// ClaimChip (R4.2): what the claim on one item looks like to one viewer. No timer: "waiting"
// comes from the queued ops the caller passes in. Loser twins render in task 13.
import { useEffect, useRef, useState, type ReactNode } from 'react';
import { displayName } from '../members.ts';
import type { Item } from '../model.ts';
import { TARGET } from './target.ts';

export interface ClaimChipProps {
  item: Item;
  /** The viewer's member id. */
  me: string;
  /** The viewer's own `item.claim` for this item is still queued (not acknowledged). */
  queued: boolean;
  onClaim(): void;
  onRelease(): void;
}

type Role = 'winner' | 'loser' | 'none';

export function ClaimChip(p: ClaimChipProps): ReactNode {
  const { item, me } = p;
  const { winners, losers } = item.claims;
  const isWinner = winners.some((c) => c.who === me);
  const role: Role = isWinner ? 'winner' : losers.some((c) => c.who === me) ? 'loser' : 'none';

  // "Now you're bringing it": the viewer moved from losers to winners. Presentation state only.
  const prev = useRef<Role>(role);
  const [promoted, setPromoted] = useState(false);
  useEffect(() => {
    if (prev.current === 'loser' && role === 'winner') setPromoted(true);
    else if (role !== 'winner') setPromoted(false);
    prev.current = role;
  }, [role]);

  const who = winners.map((c) => displayName(c.who)).join(', ');
  const stop = isWinner && !p.queued && (
    <button type="button" style={TARGET} onClick={p.onRelease}>
      Stop bringing it
    </button>
  );
  const claim = (
    <button type="button" style={TARGET} onClick={p.onClaim}>
      I'll bring it
    </button>
  );
  const count = item.units > 1 && <span>{`${winners.length} of ${item.units} claimed`}</span>;
  const note = promoted && <span role="status">Now you're bringing it</span>;

  if (item.units > 1) {
    return (
      <span className="bc-claim" data-claim>
        {count}
        {p.queued ? <span>Yours? waiting</span> : winners.length > 0 && <span>{who}</span>}
        {note}
        {stop}
        {role === 'none' && !p.queued && winners.length < item.units && claim}
      </span>
    );
  }
  return (
    <span className="bc-claim" data-claim>
      {p.queued ? (
        <span>Yours? waiting</span>
      ) : winners.length > 0 ? (
        <span>{`${who} is bringing it`}</span>
      ) : (
        claim
      )}
      {note}
      {stop}
    </span>
  );
}
