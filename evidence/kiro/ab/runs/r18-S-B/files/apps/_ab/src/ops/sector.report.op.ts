// sector.report: a surveyor reports the damage severity of a sector.
// Intent: a report made without knowledge of another never lowers it (concurrent reports show the more severe one);
// a report by someone who has received the earlier ones may lower it (re-inspection after repairs).
// Merge: commutes. State keeps every report by op id (a set, so duplicates and order cannot matter). The shown severity
// is derived: the highest severity among reports that no other report covers (the causal frontier).
import { covers } from '../../../../skeleton/src/core/causal.ts';
import type { Op, OpDef } from '../../../../skeleton/src/core/types.ts';
import { SEVERITIES, type Severity } from '../model.ts';

export interface ReportPayload {
  severity: Severity;
}

export interface ReportState {
  reports?: Record<string, Record<string, Op<ReportPayload>>>;
}

const rank = (s: Severity): number => SEVERITIES.indexOf(s);

const def: OpDef<ReportState, ReportPayload> = {
  name: 'sector.report',
  merge: 'commutes',
  intent: { kind: 'max', field: 'severity', order: [...SEVERITIES] },
  apply(s, op: Op<ReportPayload>) {
    const cur = s.reports?.[op.target] ?? {};
    return { ...s, reports: { ...(s.reports ?? {}), [op.target]: { ...cur, [op.id]: op } } };
  },
  invariant(s) {
    for (const [t, rs] of Object.entries(s.reports ?? {})) {
      for (const r of Object.values(rs)) if (rank(r.payload.severity) < 0) return `report ${r.id} on ${t} has an unknown severity`;
    }
    return true;
  },
};

export default def as unknown as OpDef;

/** Payload for "report `severity` for `sectorId`". It carries no read value, so it cannot overwrite a concurrent report. */
export function reportPayload(_state: unknown, _sectorId: string, severity: Severity): ReportPayload {
  return { severity };
}

/** The severity this device shows: the highest among reports no other report covers; `none` if never reported. */
export function severityOf(state: unknown, sectorId: string): Severity {
  const all = Object.values((state as ReportState).reports?.[sectorId] ?? {});
  const frontier = all.filter((w) => !all.some((o) => o !== w && covers(o, w)));
  let best = 0;
  for (const r of frontier) best = Math.max(best, rank(r.payload.severity));
  return SEVERITIES[best]!;
}
