// sector.report: a surveyor reports a damage severity for a sector.
// Intent: a report made without knowledge of another report never lowers it (concurrent reports show the more severe);
// a re-inspection that has received the earlier reports may lower it. A sector never reported shows `none`.
// Merge: commutes. State keeps every report by op id; the shown severity is the highest severity among reports that
// no other report covers (the frontier). A pure function of the set of reports, so order and duplicates cannot matter.
import type { Op, OpDef } from '../../../../skeleton/src/core/types.ts';
import { SEVERITIES, type Severity } from '../model.ts';

export interface ReportPayload {
  severity: Severity;
}

interface StoredReport {
  severity: Severity;
  stamp: Op['stamp'];
  deps: Op['deps'];
}

export interface ReportState {
  sectors?: Record<string, Record<string, StoredReport>>;
}

const rank = (s: Severity): number => SEVERITIES.indexOf(s);

const covers = (x: StoredReport, y: StoredReport): boolean => (x.deps[y.stamp.r] ?? 0) >= y.stamp.n;

function shown(reports: Record<string, StoredReport> | undefined): Severity {
  const all = Object.values(reports ?? {});
  let best = 0;
  for (const r of all) {
    if (all.some((o) => o !== r && covers(o, r))) continue;
    best = Math.max(best, rank(r.severity));
  }
  return SEVERITIES[best]!;
}

const def: OpDef<ReportState, ReportPayload> = {
  name: 'sector.report',
  merge: 'commutes',
  intent: { kind: 'max', field: 'severity', order: [...SEVERITIES] },
  apply(s, op: Op<ReportPayload>) {
    const cur = s.sectors?.[op.target] ?? {};
    if (cur[op.id] !== undefined) return s;
    const next = { ...cur, [op.id]: { severity: op.payload.severity, stamp: op.stamp, deps: op.deps } };
    return { ...s, sectors: { ...(s.sectors ?? {}), [op.target]: next } };
  },
  invariant(s) {
    for (const [t, rs] of Object.entries(s.sectors ?? {}))
      for (const [id, r] of Object.entries(rs))
        if (rank(r.severity) < 0) return `report ${id} on sector ${t} has an unknown severity`;
    return true;
  },
};

export default def as unknown as OpDef;

/** Payload for "report `severity` for `sectorId`". Causal context (deps) comes from the op, so state is not read. */
export function reportPayload(_state: unknown, _sectorId: string, severity: Severity): unknown {
  if (rank(severity) < 0) throw new Error(`unknown severity ${String(severity)}`);
  return { severity } satisfies ReportPayload;
}

/** The severity this device shows for a sector; `none` if never reported. */
export function severityOf(state: unknown, sectorId: string): Severity {
  return shown((state as ReportState | undefined)?.sectors?.[sectorId]);
}
