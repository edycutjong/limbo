// item.delete: marks an item deleted.
// Intent: a delete must not silently erase an edit someone made without seeing it, so a concurrent edit surfaces the item as a twin.
// Merge: resurrect. An active delete (no restore observed it) wins unless an edit that did not observe it exists.
import type { Op, OpDef } from '../../../../skeleton/src/core/types.ts';
import { applyLife, lifeInvariant, type LifeState } from './item.life.ts';

const def: OpDef<LifeState, Record<string, never>> = {
  name: 'item.delete',
  merge: 'resurrect',
  intent: { kind: 'life' },
  apply: (s, op: Op) => applyLife(s, 'delete', op),
  invariant: lifeInvariant,
};

export default def as unknown as OpDef;
