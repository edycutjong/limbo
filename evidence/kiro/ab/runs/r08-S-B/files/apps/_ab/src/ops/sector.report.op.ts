// sector.report: a damage report for a sector.
// Intent: a report made without seeing another never lowers it (concurrent reports show the more severe); a report
// made after seeing the earlier ones replaces them and may lower the severity (re-inspection after repairs).
// Merge: commutes. State keeps every report by op id; the shown severity is the highest severity among reports that
// no other report has seen (the causal frontier). A pure function of the set of reports, so order and duplicates
// cannot change it.
import { SEVERITIES, type Severity } from '../model.ts';
import type { Op, OpDef } from '../../../../skeleton/src/core/types.ts';

export interface ReportPayload {
  severity: Severity;
}

export interface SectorState {
  reports?: Record<string, Record<string, Op<ReportPayload>>>;
}

const rank = (s: Severity): number => SEVERITIES.indexOf(s);
const covers = (x: Op, y: Op): boolean => (x.deps[y.stamp.r] ?? 0) >= y.stamp.n;

function shown(writes: Record<string, Op<ReportPayload>> | undefined): Severity {
  const all = Object.values(writes ?? {});
  let best: Severity = 'none';
  for (const w of all) {
    if (all.some((o) => o !== w && covers(o, w))) continue;
    if (rank(w.payload.severity) > rank(best)) best = w.payload.severity;
  }
  return best;
}

const def: OpDef<SectorState, ReportPayload> = {
  name: 'sector.report',
  merge: 'commutes',
  intent: { kind: 'max', field: 'severity', order: [...SEVERITIES] },
  apply(s, op) {
    const cur = s.reports?.[op.target] ?? {};
    return { ...s, reports: { ...(s.reports ?? {}), [op.target]: { ...cur, [op.id]: op } } };
  },
  invariant(s) {
    for (const [t, ws] of Object.entries(s.reports ?? {}))
      for (const w of Object.values(ws)) if (rank(w.payload.severity) < 0) return `sector ${t}: unknown severity in ${w.id}`;
    return true;
  },
};

export default def as unknown as OpDef;

/** Payload for "report `severity` for `sectorId`". Severity is absolute, so it needs no read of the current state. */
export function reportPayload(_state: unknown, _sectorId: string, severity: Severity): unknown {
  return { severity } satisfies ReportPayload;
}

/** The severity this device shows; `none` for a sector never reported. */
export function severityOf(state: unknown, sectorId: string): Severity {
  return shown((state as SectorState).reports?.[sectorId]);
}
