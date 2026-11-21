// ReportForm: the surveyor's draft for one sector (R7.5 to R7.7, R13.3).
// The draft is local presentation state: only fields the user touched are overrides, the rest read the
// live sector. Save diffs the draft against the sector and calls `actions`; every write is an explicit
// value (no toggle, no delta). A rejected value shows an inline error and creates no op.
import { useState, type ReactNode } from 'react';
import type { Replica } from '../../../../skeleton/src/sync/replica.ts';
import * as act from '../actions.ts';
import type { Sector, State } from '../model.ts';
import { MAX_COUNT, MAX_NOTE, NEEDS, SEVERITIES, type Severity } from '../sectors.ts';

const LABEL: Record<Severity, string> = { safe: 'Safe', damaged: 'Damaged', unsafe: 'Unsafe' };
const rank = (s: Severity): number => SEVERITIES.indexOf(s);

interface Draft {
  severity?: Severity;
  count?: string;
  needs: Record<string, boolean>;
  note?: string;
  reinspect: boolean;
}
const EMPTY: Draft = { needs: {}, reinspect: false };

export function ReportForm(p: { replica: Replica<State>; id: string; sector: Sector | undefined }): ReactNode {
  const { replica, id, sector: s } = p;
  const me = act.memberOf(replica);
  const mine = s?.counts.find((c) => c.who === me);
  const base = {
    severity: s?.severity,
    count: mine ? String(mine.value) : '',
    note: s?.note ?? '',
    need: (n: string): boolean => s?.needs.includes(n) ?? false,
  };

  const [draft, setDraft] = useState<Draft>(EMPTY);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [hint, setHint] = useState('');
  const edit = (d: Partial<Draft>): void => {
    setDraft((cur) => ({ ...cur, ...d }));
    setHint('');
  };

  const severity = draft.severity ?? base.severity;
  const count = draft.count ?? base.count;
  const note = draft.note ?? base.note;
  const needOn = (n: string): boolean => draft.needs[n] ?? base.need(n);

  const dirty =
    draft.reinspect ||
    (draft.severity !== undefined && draft.severity !== base.severity) ||
    (draft.count !== undefined && draft.count !== base.count) ||
    (draft.note !== undefined && draft.note !== base.note) ||
    NEEDS.some((n) => needOn(n) !== base.need(n));

  const step = (by: 1 | -1): void => {
    const cur = /^\d+$/.test(count) ? Number(count) : 0;
    edit({ count: String(Math.max(0, Math.min(MAX_COUNT, cur + by))) });
  };

  function save(): void {
    const errs: Record<string, string> = {};
    if (count !== '' && (!/^\d+$/.test(count) || Number(count) > MAX_COUNT)) {
      errs.count = `People found must be a whole number from 0 to ${MAX_COUNT}.`;
    }
    if (note.length > MAX_NOTE) errs.note = `Note must be at most ${MAX_NOTE} characters.`;
    if (severity === undefined && base.severity === undefined) errs.severity = 'Choose a severity for this sector.';
    setErrors(errs);
    if (Object.keys(errs).length > 0) return;

    let skippedLower = false;
    if (severity !== undefined) {
      if (draft.reinspect) act.reinspectSector(replica, id, severity);
      else if (base.severity === undefined || severity === base.severity) {
        if (base.severity === undefined) act.reportSector(replica, id, severity);
      } else if (rank(severity) > rank(base.severity)) act.reportSector(replica, id, severity);
      else skippedLower = true;
    }
    if (count !== '' && (!mine || Number(count) !== mine.value)) act.setCount(replica, id, Number(count));
    for (const n of NEEDS) {
      if (needOn(n) && !base.need(n)) act.addNeed(replica, id, n);
      else if (!needOn(n) && base.need(n)) act.removeNeed(replica, id, n);
    }
    if (note !== '' && note !== base.note) act.setNote(replica, id, note);

    setDraft(EMPTY);
    setHint(skippedLower ? 'A lower severity is not written. Tick Re-inspection to lower it.' : '');
  }

  return (
    <form
      className="as-form"
      data-form={id}
      aria-label={`Report ${id}`}
      onSubmit={(e) => {
        e.preventDefault();
        if (dirty) save();
      }}
    >
      <div role="radiogroup" aria-label="Severity" className="as-seg">
        {SEVERITIES.map((v) => (
          <button
            key={v}
            type="button"
            role="radio"
            aria-checked={severity === v}
            className="ui-btn"
            data-severity-option={v}
            onClick={() => edit({ severity: v })}
          >
            {LABEL[v]}
          </button>
        ))}
      </div>
      {errors.severity && <p role="alert" className="as-error" data-error="severity">{errors.severity}</p>}

      <div className="as-stepper">
        <label htmlFor={`as-count-${id}`}>People found</label>
        <button type="button" className="ui-btn" aria-label="Fewer people" onClick={() => step(-1)}>−</button>
        <input
          id={`as-count-${id}`}
          className="ui-input"
          type="number"
          inputMode="numeric"
          step="any"
          value={count}
          onChange={(e) => edit({ count: e.target.value })}
        />
        <button type="button" className="ui-btn" aria-label="More people" onClick={() => step(1)}>+</button>
      </div>
      {errors.count && <p role="alert" className="as-error" data-error="count">{errors.count}</p>}

      <div className="as-needs-row" role="group" aria-label="Needs">
        {NEEDS.map((n) => (
          <button
            key={n}
            type="button"
            className="ui-btn"
            aria-pressed={needOn(n)}
            data-need-option={n}
            onClick={() => edit({ needs: { ...draft.needs, [n]: !needOn(n) } })}
          >
            {n}
          </button>
        ))}
      </div>

      <label htmlFor={`as-note-${id}`}>Note</label>
      <textarea id={`as-note-${id}`} className="ui-input" value={note} onChange={(e) => edit({ note: e.target.value })} />
      {errors.note && <p role="alert" className="as-error" data-error="note">{errors.note}</p>}

      <label className="ui-check">
        <input type="checkbox" checked={draft.reinspect} onChange={(e) => edit({ reinspect: e.target.checked })} />
        Re-inspection
      </label>

      <button type="submit" className="ui-btn as-save" disabled={!dirty}>Save</button>
      {hint && <p role="status" className="as-hint" data-hint>{hint}</p>}
    </form>
  );
}
