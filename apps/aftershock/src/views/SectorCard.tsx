// SectorCard: the selected sector of one replica card (R7.3, R7.4, R7.9, R4.6).
// Presentation only: it reads a Sector and creates no op. Every name and note renders as text.
import type { ReactNode } from 'react';
import { displayName } from '../members.ts';
import type { Sector } from '../model.ts';
import type { Severity } from '../sectors.ts';

const WORD: Record<Severity, string> = { safe: 'SAFE', damaged: 'DAMAGED', unsafe: 'UNSAFE' };
const GLYPH: Record<Severity, string> = { safe: '✓', damaged: '▲', unsafe: '✖' };

export const SCRIPTED_TEXT = 'scripted edit';

/** `5 reported — Sari 2, Budi 3` (counts already in roster order). */
export function totalLine(s: Sector): string {
  const parts = s.counts.map((c) => `${displayName(c.who)} ${c.value}`);
  return `${s.total} reported${parts.length > 0 ? ` — ${parts.join(', ')}` : ''}`;
}

export function SectorCard(p: {
  id: string;
  sector: Sector | undefined;
  /** Fields of this sector the survey scene performed (for example `note`), each shown as a "scripted edit" tag. */
  scripted?: readonly string[];
  /** Slot for the twin views (task 17). */
  children?: ReactNode;
}): ReactNode {
  const s = p.sector;
  const sev = s?.severity;
  return (
    <section className="as-card" data-card={p.id} aria-label={`Sector ${p.id}`}>
      <h2 className="as-card-title">
        <span>{p.id}</span>{' '}
        <span aria-hidden="true" className="as-card-glyph">{sev ? GLYPH[sev] : '–'}</span>{' '}
        <span data-severity-word>{sev ? WORD[sev] : 'NO REPORT'}</span>
      </h2>
      {s && s.counts.length > 0 && (
        <>
          <ul className="as-counts">
            {s.counts.map((c) => (
              <li key={c.who} data-who={c.who}>{displayName(c.who)} {c.value}</li>
            ))}
          </ul>
          <div className="as-total-row">
            <p className="as-total" data-total>{totalLine(s)}</p>
            {s.counts.length > 1 && <span data-may-overlap>may overlap</span>}
          </div>
        </>
      )}
      {s && s.needs.length > 0 && (
        <ul className="as-needs" aria-label="Needs">
          {s.needs.map((n) => (
            <li key={n} className="as-need-chip">{n}</li>
          ))}
        </ul>
      )}
      {s?.note !== undefined && s.note !== '' && <p className="as-note" data-note>{s.note}</p>}
      {(p.scripted ?? []).map((f) => (
        <span key={f} className="as-scripted" data-scripted={f}>{SCRIPTED_TEXT}</span>
      ))}
      {p.children}
      {sev === 'unsafe' && <p className="as-instruction" data-instruction>{p.id} — do not enter</p>}
    </section>
  );
}
