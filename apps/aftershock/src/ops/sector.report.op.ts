// sector.report: reports a sector's severity (safe, damaged, unsafe).
// Intent: two surveyors reporting the same sector offline must keep the worse report, and a later, lower report must not
// hide a higher one; only a clear that has seen a report may remove it.
// Merge: commutes (max over the reports no clear has observed). State keeps every report by op id and re-derives `severity`.
import type { Op, OpDef } from '../../../../skeleton/src/core/types.ts';
import { applySeverityOp, severityInvariant, type ReportPayload, type SeverityState } from './sector.state.ts';

export type { ReportPayload };
export type SectorReportState = SeverityState;

const def: OpDef<SeverityState, ReportPayload> = {
  name: 'sector.report',
  merge: 'commutes',
  intent: { kind: 'max', field: 'severity', order: ['safe', 'damaged', 'unsafe'] },
  apply: (s, op: Op<ReportPayload>) => applySeverityOp(s, op, 'report'),
  invariant: severityInvariant,
};

export default def as unknown as OpDef;
