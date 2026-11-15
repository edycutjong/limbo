// sector.report: a surveyor reports the damage severity of a sector.
// Intent: a report made without knowledge of another never lowers it (concurrent reports show the more severe one),
// but a re-inspection that has received the earlier reports may lower it (critical -> minor after repairs).
// Merge: causal-lww over the frontier. State keeps every report by op id; the shown severity is the highest level
// among reports that no other report covers. Order and duplicates cannot change it.
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

function shown(reports: Record<string, Op<ReportPayload>>): Severity {
  const all = Object.values(reports);
  let best = 0; // 'none': a sector never reported
  for (const r of all) {
    if (all.some((o) => o !== r && covers(o, r))) continue; // superseded by a report that saw it
    best = Math.max(best, rank(r.payload.severity));
  }
  return SEVERITIES[best]!;
}

const def: OpDef<ReportState, ReportPayload> = {
  name: 'sector.report',
  merge: 'causal-lww',
  intent: { kind: 'max', field: 'severity', order: [...SEVERITIES] },
  apply(s, op: Op<ReportPayload>) {
    if (rank(op.payload?.severity) < 0) return s; // not a known severity: ignore
    const reports = { ...(s.sectors?.[op.target]?.reports ?? {}), [op.id]: op };
    return { ...s, sectors: { ...(s.sectors ?? {}), [op.target]: { reports } } };
  },
  invariant(s) {
    for (const [t, v] of Object.entries(s.sectors ?? {})) {
      for (const r of Object.values(v.reports)) if (rank(r.payload.severity) < 0) return `report ${r.id} on ${t} has an unknown severity`;
    }
    return true;
  },
};

export default def as unknown as OpDef;

/** Payload for "report `severity` for `sectorId`". Depends only on the arguments. */
export function reportPayload(_state: unknown, _sectorId: string, severity: Severity): unknown {
  return { severity } satisfies ReportPayload;
}

/** The severity this device shows; `none` for a sector never reported. */
export function severityOf(state: unknown, sectorId: string): Severity {
  const reports = (state as ReportState).sectors?.[sectorId]?.reports;
  return reports === undefined ? 'none' : shown(reports);
}
