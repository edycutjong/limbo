// SectorGrid: 6 x 4 survey grid with roving focus (R7.1, R7.2, R7.10, R17.1, R17.3).
// Presentation only: selecting a cell calls `onSelect` and never creates an op.
import { useRef, useState, type KeyboardEvent, type ReactNode } from 'react';
import type { Sector } from '../model.ts';
import { COLUMNS, ROWS, type Severity } from '../sectors.ts';

export const GRID_NAME = 'Block 7 survey, sectors A1 to F4';

const WORD: Record<Severity, string> = { safe: 'SAFE', damaged: 'DAMAGED', unsafe: 'UNSAFE' };
const GLYPH: Record<Severity, string> = { safe: '✓', damaged: '▲', unsafe: '✖' };

/** Accessible name of one cell (R17.3). */
export function cellLabel(id: string, s: Sector | undefined): string {
  if (s?.severity === undefined) return `${id}, no report`;
  return `${id}, ${WORD[s.severity]}, ${s.total} people reported`;
}

const isTextTarget = (t: EventTarget | null): boolean => {
  const e = t as HTMLElement | null;
  if (!e || !e.tagName) return false;
  return e.tagName === 'INPUT' || e.tagName === 'TEXTAREA' || e.tagName === 'SELECT' || e.isContentEditable === true;
};

export function SectorGrid(p: {
  sectors: Record<string, Sector>;
  selected?: string | undefined;
  onSelect(id: string): void;
}): ReactNode {
  const cols = COLUMNS.length;
  const total = cols * ROWS.length;
  const [active, setActive] = useState(0);
  const cells = useRef<(HTMLElement | null)[]>([]);
  const idAt = (i: number): string => `${COLUMNS[i % cols]}${ROWS[Math.floor(i / cols)]}`;

  const moveTo = (i: number): void => {
    setActive(i);
    cells.current[i]?.focus();
  };

  const onKeyDown = (e: KeyboardEvent<HTMLElement>): void => {
    if (isTextTarget(e.target)) return;
    const i = cells.current.findIndex((c) => c === e.target);
    if (i < 0) return;
    const col = i % cols;
    const row = Math.floor(i / cols);
    let next: number | undefined;
    switch (e.key) {
      case 'ArrowLeft': next = col > 0 ? i - 1 : i; break;
      case 'ArrowRight': next = col < cols - 1 ? i + 1 : i; break;
      case 'ArrowUp': next = row > 0 ? i - cols : i; break;
      case 'ArrowDown': next = i + cols < total ? i + cols : i; break;
      case 'Home': next = row * cols; break;
      case 'End': next = row * cols + cols - 1; break;
      case 'Enter':
      case ' ':
        e.preventDefault();
        p.onSelect(idAt(i));
        return;
      default: return;
    }
    e.preventDefault();
    moveTo(next);
  };

  return (
    <div role="grid" aria-label={GRID_NAME} className="as-grid" onKeyDown={onKeyDown}>
      <div role="row" className="as-grid-row">
        <span role="columnheader" className="as-grid-head" aria-label="sector" />
        {COLUMNS.map((c) => (
          <span key={c} role="columnheader" className="as-grid-head">{c}</span>
        ))}
      </div>
      {ROWS.map((r, ri) => (
        <div key={r} role="row" className="as-grid-row">
          <span role="rowheader" className="as-grid-head">{r}</span>
          {COLUMNS.map((c, ci) => {
            const i = ri * cols + ci;
            const id = `${c}${r}`;
            const s = p.sectors[id];
            const sev = s?.severity;
            const hasCount = (s?.counts.length ?? 0) > 0;
            return (
              <div
                key={id}
                role="gridcell"
                ref={(el) => { cells.current[i] = el; }}
                data-sector={id}
                data-severity={sev ?? 'none'}
                aria-label={cellLabel(id, s)}
                aria-selected={p.selected === id}
                tabIndex={i === active ? 0 : -1}
                className="as-cell"
                onFocus={() => setActive(i)}
                onClick={() => { setActive(i); p.onSelect(id); }}
              >
                <span className="as-cell-id">{id}</span>
                {' '}
                <span aria-hidden="true" className="as-cell-glyph">{sev ? GLYPH[sev] : '–'}</span>
                {' '}
                <span className="as-cell-word">{sev ? WORD[sev] : 'NO REPORT'}</span>
                {sev !== undefined && hasCount && (
                  <>
                    {' '}
                    <span className="as-cell-total">{s!.total}</span>
                  </>
                )}
              </div>
            );
          })}
        </div>
      ))}
    </div>
  );
}
