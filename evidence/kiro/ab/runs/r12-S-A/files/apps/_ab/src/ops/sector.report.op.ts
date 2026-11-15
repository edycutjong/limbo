// sector.report: reports the damage severity of a sector.
// Intent: a report made without knowledge of another never lowers the severity that one set (concurrent reports
// show the more severe); a report made after seeing earlier ones replaces them and may lower it.
// Merge: causal-lww over the writes, except the winner among concurrent (frontier) writes is the most severe, not the
// highest stamp. State keeps every report by op id and re-derives the value, so order and duplicates cannot change it.
import { covers } from '../../../../skeleton/src/core/causal.ts';
import type { Op, OpDef } from '../../../../skeleton/src/core/types.ts';
import { SEVERITIES, type Severity } from '../model.ts';

export interface ReportPayload {
  severity: Severity;
}

export interface SectorState {
  sectors?: Record<string, { reports: Record<string, Op<ReportPayload>>; severity: Severity }>;
}

const rank = (s: Severity): number => SEVERITIES.indexOf(s);

function derive(reports: readonly Op<ReportPayload>[]): Severity {
  const frontier = reports.filter((w) => !reports.some((o) => o.id !== w.id && covers(o, w)));
  let best: Severity = 'none';
  for (const w of frontier) if (rank(w.payload.severity) > rank(best)) best = w.payload.severity;
  return best;
}

const def: OpDef<SectorState, ReportPayload> = {
  name: 'sector.report',
  merge: 'causal-lww',
  intent: { kind: 'max', field: 'severity', order: [...SEVERITIES] },
  apply(s, op: Op<ReportPayload>) {
    const cur = s.sectors?.[op.target];
    const reports = { ...(cur?.reports ?? {}), [op.id]: op };
    const severity = derive(Object.values(reports));
    return { ...s, sectors: { ...(s.sectors ?? {}), [op.target]: { reports, severity } } };
  },
  invariant(s) {
    for (const [t, v] of Object.entries(s.sectors ?? {})) {
      if (!SEVERITIES.includes(v.severity)) return `sector ${t} has an unknown severity`;
      for (const w of Object.values(v.reports)) if (!SEVERITIES.includes(w.payload.severity)) return `report ${w.id} has an unknown severity`;
    }
    return true;
  },
};

export default def as unknown as OpDef;

export function reportPayload(_state: unknown, _sectorId: string, severity: Severity): unknown {
  return { severity } satisfies ReportPayload;
}

export function severityOf(state: unknown, sectorId: string): Severity {
  return (state as SectorState).sectors?.[sectorId]?.severity ?? 'none';
}
