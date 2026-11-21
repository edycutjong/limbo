// sector.need: a surveyor reports that a sector needs something (water, medical, ...).
// Intent: a need added while another surveyor removes it offline must stay in; an unneed only takes out the adds it has seen.
// Merge: commutes. State keeps every add by op id and re-derives the present needs (add-wins).
import type { Op, OpDef } from '../../../../skeleton/src/core/types.ts';
import { applyNeedOp, needInvariant, type NeedOpsState, type NeedPayload } from './sector.state.ts';

export type { NeedPayload };
export type SectorNeedState = NeedOpsState;

const def: OpDef<NeedOpsState, NeedPayload> = {
  name: 'sector.need',
  merge: 'commutes',
  intent: { kind: 'add-remove', field: 'needs' },
  apply: (s, op: Op<NeedPayload>) => applyNeedOp(s, op, 'add'),
  invariant: needInvariant,
};

export default def as unknown as OpDef;
