// sector.clear: a re-inspection withdraws the reports its surveyor has seen, so a sector's severity can fall.
// Intent: a clear removes only the reports it had observed; a report made concurrently with the clear must still count,
// so an `unsafe` report is never wiped by a clear that did not know about it.
// Merge: commutes (the clear is a member of the op set; which reports it covers comes from its `deps`, not arrival order).
import type { Op, OpDef } from '../../../../skeleton/src/core/types.ts';
import { applySeverityOp, severityInvariant, type ClearPayload, type SeverityState } from './sector.state.ts';

export type { ClearPayload };
export type SectorClearState = SeverityState;

const def: OpDef<SeverityState, ClearPayload> = {
  name: 'sector.clear',
  merge: 'commutes',
  intent: { kind: 'max', field: 'severity', order: ['safe', 'damaged', 'unsafe'] },
  apply: (s, op: Op<ClearPayload>) => applySeverityOp(s, op, 'clear'),
  invariant: severityInvariant,
};

export default def as unknown as OpDef;
