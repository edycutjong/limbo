// sector.report: reports the damage severity of a sector.
// Intent: a report made without knowledge of another never lowers it (concurrent reports show the more severe);
// a re-inspection that has seen the earlier reports may lower it.
// Merge: causal-lww with a max resolution. State keeps every report by op id; the shown value is the most severe
// among the frontier (reports no other report covers), so order and duplicates cannot change it.
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

function resolve(writes: Record<string, Op<ReportPayload>>): Severity {
  const all = Object.values(writes);
  let best: Severity = 'none';
  for (const w of all) {
    if (all.some((o) => o !== w && covers(o, w))) continue; // superseded by a report that had seen it
    if (rank(w.payload.severity) > rank(best)) best = w.payload.severity;
  }
  return best;
}

const def: OpDef<ReportState, ReportPayload> = {
  name: 'sector.report',
  merge: 'causal-lww',
  intent: { kind: 'max', field: 'severity', order: [...SEVERITIES] },
  apply(s, op: Op<ReportPayload>) {
    const writes = { ...(s.reports?.[op.target] ?? {}), [op.id]: op };
    return { ...s, reports: { ...(s.reports ?? {}), [op.target]: writes } };
  },
  invariant(s) {
    for (const [t, ws] of Object.entries(s.reports ?? {}))
      for (const w of Object.values(ws)) if (!SEVERITIES.includes(w.payload.severity)) return `report ${w.id} on ${t} has unknown severity`;
    return true;
  },
};

export default def as unknown as OpDef;

export function reportPayload(_state: unknown, _sectorId: string, severity: Severity): unknown {
  if (!SEVERITIES.includes(severity)) throw new Error(`unknown severity: ${String(severity)}`);
  return { severity } satisfies ReportPayload;
}

export function severityOf(state: unknown, sectorId: string): Severity {
  const writes = (state as ReportState).reports?.[sectorId];
  return writes === undefined ? 'none' : resolve(writes);
}
