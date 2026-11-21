// sector.unneed: a surveyor withdraws a need they have seen.
// Intent: an unneed removes only the adds it had observed, so a need added at the same time stays in.
// Merge: commutes. State keeps every unneed by op id and re-derives the present needs.
import type { Op, OpDef } from '../../../../skeleton/src/core/types.ts';
import { applyNeedOp, needInvariant, type NeedOpsState, type NeedPayload } from './sector.state.ts';

export type { NeedPayload };
export type SectorUnneedState = NeedOpsState;

const def: OpDef<NeedOpsState, NeedPayload> = {
  name: 'sector.unneed',
  merge: 'commutes',
  intent: { kind: 'add-remove', field: 'needs' },
  apply: (s, op: Op<NeedPayload>) => applyNeedOp(s, op, 'remove'),
  invariant: needInvariant,
};

export default def as unknown as OpDef;
