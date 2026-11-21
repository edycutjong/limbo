// SectorTwins (R9): the note twin and the count twins of one sector, through the layer's `Twin`.
// Pure presentation over the materialized sector. Every button creates one op through `actions`
// that observes what the replica holds, so the resolve clears the twin on both replicas.
// Notes and names render as text.
import type { CSSProperties, ReactNode } from 'react';
import { Twin, type Id } from '../../../../skeleton/src/limbo/index.ts';
import type { Replica } from '../../../../skeleton/src/sync/replica.ts';
import * as act from '../actions.ts';
import { displayName, memberOfReplica } from '../members.ts';
import type { Sector, State } from '../model.ts';

const TARGET: CSSProperties = { minWidth: 44, minHeight: 44 };

const author = (by: string): string => displayName(memberOfReplica(by));

const Button = (p: { label: string; onClick(): void; children: ReactNode }): ReactNode => (
  <button type="button" style={TARGET} aria-label={p.label} onClick={p.onClick}>
    {p.children}
  </button>
);

export function SectorTwins(p: { id: Id; replica: Replica<State>; sector: Sector | undefined }): ReactNode {
  const s = p.sector;
  if (!s) return null;
  const notes = s.noteValues;
  const first = notes[0];
  const second = notes[1];
  return (
    <>
      {first && second && (
        <Twin
          replica={p.id}
          id={`${s.id}:note`}
          atRest={<span data-note-rest>{s.note}</span>}
          ghost={notes.filter((v) => v.value !== s.note).map((v) => v.value).join(' / ')}
          caption={`TWIN · ${author(first.by)} wrote “${first.value}” while ${author(second.by)} wrote “${second.value}” · rule: causal-lww`}
          rule="causal-lww"
          actions={notes.map((v) => (
            <span key={v.value} className="as-note-choice">
              <Button label={`Keep this note: ${v.value}`} onClick={() => act.pickNote(p.replica, s.id, v.value)}>
                {`Keep ${author(v.by)}'s note`}
              </Button>
              <span className="as-note-text">{`“${v.value}”`}</span>
            </span>
          ))}
        />
      )}
      {s.counts
        .filter((c) => c.values.length > 1)
        .map((c) => (
          <Twin
            key={c.who}
            replica={p.id}
            id={`${s.id}:count:${c.who}`}
            atRest={<span data-count-rest>{`${displayName(c.who)} ${c.value}`}</span>}
            ghost={c.values.filter((v) => v.value !== c.value).map((v) => String(v.value)).join(' / ')}
            caption={`TWIN · ${displayName(c.who)} counted ${c.values.map((v) => v.value).join(' on one device while ')} on another · rule: causal-lww`}
            rule="causal-lww"
            actions={c.values.map((v) => (
              <Button key={v.value} label={`Keep this count: ${v.value}`} onClick={() => act.pickCount(p.replica, s.id, c.who, v.value)}>
                Keep this count
              </Button>
            ))}
          />
        ))}
    </>
  );
}
