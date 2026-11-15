// item.restore: brings a deleted item back.
// Intent: a restore cancels only the deletes it observed; a delete made concurrently with it stays active.
// Merge: resurrect. A restore is also an edit, so it can resurrect against a delete it did not observe (twin).
import type { Op, OpDef } from '../../../../skeleton/src/core/types.ts';
import { applyLife, lifeInvariant, type LifeState } from './item.life.ts';

const def: OpDef<LifeState, Record<string, never>> = {
  name: 'item.restore',
  merge: 'resurrect',
  intent: { kind: 'life' },
  apply: (s, op: Op) => applyLife(s, 'restore', op),
  invariant: lifeInvariant,
};

export default def as unknown as OpDef;
