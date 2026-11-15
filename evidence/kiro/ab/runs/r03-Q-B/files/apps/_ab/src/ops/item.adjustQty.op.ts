// item.adjustQty: changes an item's quantity by a whole-number delta (never writes the quantity itself).
// Intent: two people each adding one canister offline must both count; qty = sum of every adjustment.
// Merge: commutes. State keeps each adjustment by op id and sums them, so order and duplicates cannot change it.
import type { Op, OpDef } from '../../../../skeleton/src/core/types.ts';

export interface AdjustQtyPayload {
  by: number;
}

export interface AdjustQtyState {
  /** item id -> (op id -> delta). */
  adjustments?: Record<string, Record<string, number>>;
}

/** Payload for "change `itemId` by `by`". The delta does not depend on the quantity this device shows. */
export function adjustQtyPayload(_state: unknown, _itemId: string, by: number): AdjustQtyPayload {
  if (!Number.isSafeInteger(by)) throw new Error(`item.adjustQty: by must be a whole number, got ${by}`);
  return { by };
}

/** The quantity this device shows: the sum of every adjustment applied to the item (0 if none). */
export function qtyOf(state: unknown, itemId: string): number {
  const adj = (state as AdjustQtyState).adjustments?.[itemId];
  let sum = 0;
  if (adj !== undefined) for (const by of Object.values(adj)) sum += by;
  return sum;
}

const def: OpDef<AdjustQtyState, AdjustQtyPayload> = {
  name: 'item.adjustQty',
  merge: 'commutes',
  intent: { kind: 'delta', field: 'qty' },
  apply(s, op: Op<AdjustQtyPayload>) {
    const adjustments = s.adjustments ?? {};
    return {
      ...s,
      adjustments: { ...adjustments, [op.target]: { ...(adjustments[op.target] ?? {}), [op.id]: op.payload.by } },
    };
  },
  invariant(s) {
    for (const [t, adj] of Object.entries(s.adjustments ?? {})) {
      for (const [id, by] of Object.entries(adj)) if (!Number.isSafeInteger(by)) return `adjustment ${id} on ${t} is not a whole number`;
    }
    return true;
  },
};

export default def as unknown as OpDef;
