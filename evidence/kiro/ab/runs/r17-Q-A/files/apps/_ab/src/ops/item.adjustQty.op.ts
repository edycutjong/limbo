// item.adjustQty: changes an item's quantity by a whole-number amount (never sets an absolute value).
// Intent: two people each tapping "+1" offline must both count, so the quantity goes up by 2 after sync.
// Merge: commutes. The op carries the delta, state keeps every adjustment by op id, and the quantity is re-derived as
// their sum, so order and duplicates cannot change it.
import type { Op, OpDef } from '../../../../skeleton/src/core/types.ts';

export interface AdjustQtyPayload {
  by: number;
}

export interface AdjustQtyState {
  adjustments?: Record<string, Record<string, number>>;
}

const def: OpDef<AdjustQtyState, AdjustQtyPayload> = {
  name: 'item.adjustQty',
  merge: 'commutes',
  intent: { kind: 'delta', field: 'qty' },
  apply(s, op: Op<AdjustQtyPayload>) {
    const all = s.adjustments ?? {};
    const forItem = { ...(all[op.target] ?? {}), [op.id]: op.payload.by };
    return { ...s, adjustments: { ...all, [op.target]: forItem } };
  },
  invariant(s) {
    for (const [t, v] of Object.entries(s.adjustments ?? {})) {
      for (const [id, by] of Object.entries(v)) {
        if (!Number.isInteger(by)) return `adjustment ${id} on ${t} is not a whole number`;
      }
    }
    return true;
  },
};

export default def as unknown as OpDef;

/** The payload for "change `itemId` by `by`". The delta does not depend on the current state. */
export function adjustQtyPayload(_state: unknown, _itemId: string, by: number): unknown {
  if (!Number.isInteger(by)) throw new RangeError(`adjustQty needs a whole number, got ${by}`);
  const payload: AdjustQtyPayload = { by };
  return payload;
}

/** The quantity this device shows: the sum of every adjustment received. 0 when never adjusted. */
export function qtyOf(state: unknown, itemId: string): number {
  const forItem = (state as AdjustQtyState).adjustments?.[itemId];
  let sum = 0;
  for (const by of Object.values(forItem ?? {})) sum += by;
  return sum;
}
