// ItemTwins (R3.2, R3.3, R4.3 to R4.7): the twin variants of one item, through the layer's `Twin`.
// Precedence when one item has several twins: life, then name, then ticked, then the viewer's claim loss.
// A winner whose claim beat another sees a quiet note and no buttons. Pure presentation over the
// materialized item; every button creates one op through `actions` and observes what the replica holds.
import { useEffect, useRef, useState, type ReactNode } from 'react';
import { Twin, type Id } from '../../../../skeleton/src/limbo/index.ts';
import type { Stamp } from '../../../../skeleton/src/core/types.ts';
import type { Replica } from '../../../../skeleton/src/sync/replica.ts';
import * as act from '../actions.ts';
import { displayName, memberOfReplica } from '../members.ts';
import type { EditKind, Item, State } from '../model.ts';
import { TARGET } from './target.ts';

export interface ItemTwinsProps {
  /** Which replica's twins to show. */
  id: Id;
  replica: Replica<State>;
  item: Item;
  /** The viewer's member id. */
  me: string;
  /** The ordinary row, shown whenever no twin applies to this viewer. `promoted`: the viewer just moved from loser to winner. */
  row(promoted: boolean): ReactNode;
  /** Open this replica's Inspector (Why {winner}?). */
  onInspect(): void;
}

const VERB: Record<EditKind, string> = {
  tick: 'ticked',
  rename: 'renamed',
  claim: 'claimed',
  restore: 'restored',
  add: 'added',
};

const CLAIM_RULE =
  'claim-one: offline nobody can know who was first, so every phone applies the same order (lower Lamport stamp, then replica id)';

/** Author replica id to a display name. */
const author = (by: string): string => displayName(memberOfReplica(by) ?? by);
const stampText = (s: Stamp): string => `${s.l}·${s.r}·${s.n}`;
const tickText = (v: boolean): string => (v ? 'ticked' : 'not ticked');

function Summary(p: { item: Item }): ReactNode {
  return (
    <span className="bc-row-rest">
      <span aria-hidden="true">{p.item.ticked ? '☑' : '☐'}</span> <span data-name>{p.item.name}</span>
    </span>
  );
}

const Button = (p: { onClick(): void; children: ReactNode }): ReactNode => (
  <button type="button" style={TARGET} onClick={p.onClick}>
    {p.children}
  </button>
);

export function ItemTwins(p: ItemTwinsProps): ReactNode {
  const { id, replica, item, me } = p;
  const [why, setWhy] = useState(false);
  // "Now you're bringing it" (R4.2): presentation state kept here because this component stays mounted while the loser twin shows.
  const role = item.claims.winners.some((c) => c.who === me) ? 'winner' : item.claims.losers.some((c) => c.who === me) ? 'loser' : 'none';
  const prev = useRef(role);
  const [promoted, setPromoted] = useState(false);
  useEffect(() => {
    if (prev.current === 'loser' && role === 'winner') setPromoted(true);
    else if (role !== 'winner') setPromoted(false);
    prev.current = role;
  }, [role]);
  const wrap = (twin: ReactNode): ReactNode => (
    <li className="bc-row bc-twin-row" data-item={item.id}>
      {twin}
    </li>
  );

  if (item.life === 'twin' && item.lifeInfo !== undefined) {
    const deleter = author(item.lifeInfo.deletedBy[0] ?? '');
    const edit = item.lifeInfo.editedBy[0];
    const editor = edit === undefined ? '' : author(edit.by);
    const verb = edit === undefined ? 'edited' : VERB[edit.kind];
    return wrap(
      <Twin
        replica={id}
        id={`${item.id}:life`}
        atRest={<Summary item={item} />}
        ghost={<s>{item.name}</s>}
        caption={`TWIN · ${deleter} deleted this while ${editor} ${verb} it · rule: resurrect`}
        rule="resurrect"
        actions={
          <>
            <Button onClick={() => act.restoreItem(replica, item.id)}>Keep</Button>
            <Button onClick={() => act.deleteItem(replica, item.id)}>Delete</Button>
          </>
        }
      />,
    );
  }

  const nameVals = item.values.name;
  if (item.fieldTwins.includes('name') && nameVals.length > 1) {
    const [v1, v2] = nameVals as [(typeof nameVals)[number], (typeof nameVals)[number]];
    return wrap(
      <Twin
        replica={id}
        id={`${item.id}:name`}
        atRest={<Summary item={item} />}
        ghost={nameVals.filter((v) => v.value !== item.name).map((v) => v.value).join(' / ')}
        caption={`TWIN · ${author(v1.by)} set this to “${v1.value}” while ${author(v2.by)} set it to “${v2.value}”`}
        rule="causal-lww"
        actions={nameVals.map((v) => (
          <Button key={v.value} onClick={() => act.renameItem(replica, item.id, v.value)}>
            {v.value}
          </Button>
        ))}
      />,
    );
  }

  const tickVals = item.values.ticked;
  if (item.fieldTwins.includes('ticked') && tickVals.length > 1) {
    const [v1, v2] = tickVals as [(typeof tickVals)[number], (typeof tickVals)[number]];
    return wrap(
      <Twin
        replica={id}
        id={`${item.id}:ticked`}
        atRest={<Summary item={item} />}
        ghost={tickVals.filter((v) => v.value !== item.ticked).map((v) => tickText(v.value)).join(' / ')}
        caption={`TWIN · ${author(v1.by)} set this to “${tickText(v1.value)}” while ${author(v2.by)} set it to “${tickText(v2.value)}”`}
        rule="causal-lww"
        actions={tickVals.map((v) => (
          <Button key={String(v.value)} onClick={() => act.tickItem(replica, item.id, v.value)}>
            {v.value ? 'Ticked' : 'Not ticked'}
          </Button>
        ))}
      />,
    );
  }

  const mine = item.claims.losers.find((c) => c.who === me);
  const winner = item.claims.winners[0];
  if (mine !== undefined && winner !== undefined) {
    const w = displayName(winner.who);
    return wrap(
      <Twin
        replica={id}
        id={`${item.id}:claim:${me}`}
        atRest={<Summary item={item} />}
        ghost={`Your claim — ${w} is bringing it`}
        caption={`TWIN · ${displayName(me)} and ${w} both claimed this · rule: claim-one`}
        rule={CLAIM_RULE}
        actions={
          <>
            <Button onClick={() => act.releaseItem(replica, item.id, me)}>OK</Button>
            <Button
              onClick={() => {
                setWhy(true);
                p.onInspect();
              }}
            >
              {`Why ${w}?`}
            </Button>
            {why && (
              <p data-stamps>
                {`${w}'s claim ${stampText(winner.stamp)} ranks before ${displayName(me)}'s claim ${stampText(mine.stamp)}`}
              </p>
            )}
          </>
        }
      />,
    );
  }

  const lost = item.claims.winners.some((c) => c.who === me) ? item.claims.losers : [];
  return (
    <>
      {p.row(promoted)}
      {lost.map((c) => (
        <li key={c.op} className="bc-note" data-note={item.id}>
          {`${displayName(c.who)}'s claim lost · rule: claim-one`}
        </li>
      ))}
    </>
  );
}
