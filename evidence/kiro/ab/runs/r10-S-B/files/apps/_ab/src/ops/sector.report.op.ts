// sector.report: reports the damage severity of a sector.
// Intent: a report made without knowledge of another never lowers it (concurrent reports show the more severe);
// a report made after receiving earlier reports (a re-inspection) replaces them and may lower the severity.
// Merge: commutes. State keeps every report by op id (a set union, so order and duplicates cannot matter) and derives
// the severity on read: the highest severity among reports that no other report covers (the causal frontier).
import { covers } from '../../../../skeleton/src/core/causal.ts';
import type { Op, OpDef } from '../../../../skeleton/src/core/types.ts';
import { SEVERITIES, type Severity } from '../model.ts';

export interface ReportPayload {
  severity: Severity;
}

export interface ReportState {
  sectors?: Record<string, { reports: Record<string, Op<ReportPayload>> }>;
}

const rank = (s: unknown): number => SEVERITIES.indexOf(s as Severity);

function derive(reports: Record<string, Op<ReportPayload>> | undefined): Severity {
  const all = Object.values(reports ?? {});
  let best = 0; // 'none'
  for (const r of all) {
    if (all.some((o) => o.id !== r.id && covers(o, r))) continue; // superseded by a report that had seen it
    best = Math.max(best, rank(r.payload.severity));
  }
  return SEVERITIES[best]!;
}

const def: OpDef<ReportState, ReportPayload> = {
  name: 'sector.report',
  merge: 'commutes',
  intent: { kind: 'max', field: 'severity', order: [...SEVERITIES] },
  apply(s, op: Op<ReportPayload>) {
    if (rank(op.payload?.severity) < 0) return s; // not a known severity: ignore
    const cur = s.sectors?.[op.target];
    const reports = { ...(cur?.reports ?? {}), [op.id]: op };
    return { ...s, sectors: { ...(s.sectors ?? {}), [op.target]: { reports } } };
  },
  invariant(s) {
    for (const [t, v] of Object.entries(s.sectors ?? {})) {
      for (const r of Object.values(v.reports)) if (rank(r.payload.severity) < 0) return `sector ${t} has unknown severity in ${r.id}`;
    }
    return true;
  },
};

export default def as unknown as OpDef;

/** Payload for "report `severity` for `sectorId`". Ordering comes from the op's deps, not from the payload. */
export function reportPayload(_state: unknown, _sectorId: string, severity: Severity): unknown {
  const p: ReportPayload = { severity };
  return p;
}

/** The severity this device shows; `none` for a sector never reported. */
export function severityOf(state: unknown, sectorId: string): Severity {
  return derive((state as ReportState).sectors?.[sectorId]?.reports);
}
