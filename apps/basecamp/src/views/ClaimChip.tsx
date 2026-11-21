// ClaimChip (R4.2): what the claim on one item looks like to one viewer. No timer: "waiting"
// comes from the queued ops the caller passes in. Loser twins render in `ItemTwins`.
import type { ReactNode } from 'react';
import { displayName } from '../members.ts';
import type { Item } from '../model.ts';
import { TARGET } from './target.ts';

export interface ClaimChipProps {
  item: Item;
  /** The viewer's member id. */
  me: string;
  /** The viewer's own `item.claim` for this item is still queued (not acknowledged). */
  queued: boolean;
  /** The viewer moved from losers to winners (tracked by `ItemTwins`, which stays mounted across the twin). */
  promoted?: boolean;
  onClaim(): void;
  onRelease(): void;
}

export function ClaimChip(p: ClaimChipProps): ReactNode {
  const { item, me } = p;
  const { winners } = item.claims;
  const isWinner = winners.some((c) => c.who === me);
  const role = isWinner ? 'winner' : item.claims.losers.some((c) => c.who === me) ? 'loser' : 'none';
  const promoted = p.promoted === true;

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
