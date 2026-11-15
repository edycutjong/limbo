// sector.report: "this sector's damage is <severity>."
// Intent: a report made without knowing of another never lowers it (concurrent reports show the more severe);
// a re-inspection that has seen the earlier reports may lower it.
// Merge: causal-lww with a max tie-break on the frontier. State keeps every report by op id and re-derives the value:
// the frontier is the reports no other report covers, and the severity is the most severe frontier report.
// Re-derivation reads no arrival order, so order and duplicates cannot change the result.
import { covers } from '../../../../skeleton/src/core/causal.ts';
import type { Op, OpDef } from '../../../../skeleton/src/core/types.ts';
import { SEVERITIES, type Severity } from '../model.ts';

export interface ReportPayload {
  severity: Severity;
}

export interface ReportState {
  sectors?: Record<string, Record<string, Op<ReportPayload>>>;
}

const rank = (s: Severity): number => SEVERITIES.indexOf(s);

function derive(reports: Record<string, Op<ReportPayload>>): Severity {
  const all = Object.values(reports);
  const frontier = all.filter((w) => !all.some((o) => o !== w && covers(o, w)));
  let best: Severity = 'none';
  for (const w of frontier) if (rank(w.payload.severity) > rank(best)) best = w.payload.severity;
  return best;
}

const def: OpDef<ReportState, ReportPayload> = {
  name: 'sector.report',
  merge: 'causal-lww',
  intent: { kind: 'max', field: 'severity', order: [...SEVERITIES] },
  apply(s, op: Op<ReportPayload>) {
    if (!SEVERITIES.includes(op.payload.severity)) return s;
    const reports = { ...(s.sectors?.[op.target] ?? {}), [op.id]: op };
    return { ...s, sectors: { ...(s.sectors ?? {}), [op.target]: reports } };
  },
  invariant(s) {
    for (const [t, reports] of Object.entries(s.sectors ?? {}))
      for (const w of Object.values(reports))
        if (!SEVERITIES.includes(w.payload.severity)) return `report ${w.id} on ${t} has an unknown severity`;
    return true;
  },
};

export default def as unknown as OpDef;

export function reportPayload(_state: unknown, _sectorId: string, severity: Severity): unknown {
  if (!SEVERITIES.includes(severity)) throw new Error(`unknown severity ${String(severity)}`);
  const payload: ReportPayload = { severity };
  return payload;
}

export function severityOf(state: unknown, sectorId: string): Severity {
  const reports = (state as ReportState).sectors?.[sectorId];
  return reports ? derive(reports) : 'none';
}
