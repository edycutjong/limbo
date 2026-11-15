// sector.report: "this sector has <severity> damage."
// Intent: concurrent reports must never lower each other (most severe wins); a report made after seeing earlier ones may lower.
// Merge: causal frontier. Each sector keeps the reports no other report covers; the shown severity is the max over that frontier.
import { covers } from '../../../../skeleton/src/core/causal.ts';
import type { Op, OpDef, Stamp, VV } from '../../../../skeleton/src/core/types.ts';
import { SEVERITIES, type Severity } from '../model.ts';

export interface ReportPayload {
  severity: Severity;
}
interface Entry {
  id: string;
  severity: Severity;
  stamp: Stamp;
  deps: VV;
}
/** sectorId -> frontier reports. */
export type ReportState = Record<string, Entry[]>;

const rank = (s: Severity): number => SEVERITIES.indexOf(s);

const def: OpDef<ReportState, ReportPayload> = {
  name: 'sector.report',
  merge: 'causal-lww',
  intent: { kind: 'max', field: 'severity', order: [...SEVERITIES] },
  apply(s, op: Op<ReportPayload>) {
    const cur = s[op.target] ?? [];
    if (cur.some((e) => e.id === op.id)) return s; // duplicate
    if (cur.some((e) => covers(e, op))) return s; // already superseded by a report that saw it
    const next: Entry = { id: op.id, severity: op.payload.severity, stamp: op.stamp, deps: op.deps };
    const kept = cur.filter((e) => !covers(op, e));
    return { ...s, [op.target]: [...kept, next] };
  },
};

export default def as unknown as OpDef;

export function reportPayload(_state: unknown, _sectorId: string, severity: Severity): unknown {
  if (!SEVERITIES.includes(severity)) throw new Error(`unknown severity: ${String(severity)}`);
  const p: ReportPayload = { severity };
  return p;
}

export function severityOf(state: unknown, sectorId: string): Severity {
  const entries = (state as ReportState)[sectorId] ?? [];
  let best: Severity = 'none';
  for (const e of entries) if (rank(e.severity) > rank(best)) best = e.severity;
  return best;
}
