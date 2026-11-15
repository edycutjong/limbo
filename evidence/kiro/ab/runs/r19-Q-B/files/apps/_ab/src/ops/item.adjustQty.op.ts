// item.adjustQty: changes an item's quantity by a whole number (`qty += by`).
// Intent: two people each tapping "+1" offline must both count, so the payload is a delta, never `seen + 1`.
// Merge: commutes. Addition is order-independent; a repeated op id is dropped by the causal buffer.
import type { Op, OpDef } from '../../../../skeleton/src/core/types.ts';

export interface AdjustQtyPayload {
  by: number;
}

export interface QtyState {
  qty?: Record<string, number>;
}

const def: OpDef<QtyState, AdjustQtyPayload> = {
  name: 'item.adjustQty',
  merge: 'commutes',
  intent: { kind: 'delta', field: 'qty' },
  apply(s, op: Op<AdjustQtyPayload>) {
    return { ...s, qty: { ...(s.qty ?? {}), [op.target]: (s.qty?.[op.target] ?? 0) + op.payload.by } };
  },
  invariant(s) {
    for (const [t, v] of Object.entries(s.qty ?? {})) if (!Number.isInteger(v)) return `item ${t} has a non-integer qty`;
    return true;
  },
};

export default def as unknown as OpDef;

/** Payload for "change `itemId` by `by`". It carries the change, not the quantity this device shows. */
export function adjustQtyPayload(_state: unknown, _itemId: string, by: number): AdjustQtyPayload {
  if (!Number.isInteger(by)) throw new Error('item.adjustQty: by must be a whole number');
  return { by };
}

/** The quantity this device shows; 0 for an item never adjusted. */
export function qtyOf(state: unknown, itemId: string): number {
  return (state as QtyState).qty?.[itemId] ?? 0;
}
