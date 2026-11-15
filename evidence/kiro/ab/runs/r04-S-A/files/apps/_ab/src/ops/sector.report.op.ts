// sector.report: a surveyor reports a sector's damage severity.
// Intent: a report made without knowledge of another never lowers it (concurrent reports show the more severe);
// a report by someone who has seen the earlier ones may lower it (re-inspection after repairs).
// Merge: State keeps every report by op id. The shown severity is the max severity over the frontier, the
// reports no other report covers. Order and duplicates cannot change it.
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

function derive(reports: Record<string, Op<ReportPayload>>): Severity {
  const all = Object.values(reports);
  let best: Severity = 'none';
  for (const r of all) {
    if (all.some((o) => o !== r && covers(o, r))) continue; // superseded by a report that saw it
    if (rank(r.payload.severity) > rank(best)) best = r.payload.severity;
  }
  return best;
}

const def: OpDef<SectorState, ReportPayload> = {
  name: 'sector.report',
  merge: 'commutes',
  intent: { kind: 'max', field: 'severity', order: [...SEVERITIES] },
  apply(s, op: Op<ReportPayload>) {
    const reports = { ...(s.sectors?.[op.target]?.reports ?? {}), [op.id]: op };
    return { ...s, sectors: { ...(s.sectors ?? {}), [op.target]: { reports, severity: derive(reports) } } };
  },
  invariant(s) {
    for (const [t, v] of Object.entries(s.sectors ?? {})) {
      if (!SEVERITIES.includes(v.severity)) return `sector ${t} has unknown severity ${String(v.severity)}`;
      if (v.severity !== derive(v.reports)) return `sector ${t} severity is not derived from its reports`;
    }
    return true;
  },
};

export default def as unknown as OpDef;

export function reportPayload(_state: unknown, _sectorId: string, severity: Severity): unknown {
  if (!SEVERITIES.includes(severity)) throw new Error(`unknown severity ${String(severity)}`);
  return { severity } satisfies ReportPayload;
}

export function severityOf(state: unknown, sectorId: string): Severity {
  return (state as SectorState).sectors?.[sectorId]?.severity ?? 'none';
}
