// item.adjustQty: changes an item's quantity by a whole-number delta (never sets an absolute value).
// Intent: two people tapping "+1" offline must both count, so adjustments add up instead of overwriting each other.
// Merge: commutes. State keeps each delta by op id and the quantity is their sum, so order and duplicates cannot change it.
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
    const cur = s.adjustments?.[op.target] ?? {};
    return {
      ...s,
      adjustments: { ...(s.adjustments ?? {}), [op.target]: { ...cur, [op.id]: op.payload.by } },
    };
  },
  invariant(s) {
    for (const [t, v] of Object.entries(s.adjustments ?? {})) {
      for (const [id, by] of Object.entries(v)) if (!Number.isInteger(by)) return `adjustment ${id} on ${t} is not a whole number`;
    }
    return true;
  },
};

export default def as unknown as OpDef;

/** Payload for "change the quantity of `itemId` by `by`". The change is relative, so the state is not needed. */
export function adjustQtyPayload(_state: unknown, _itemId: string, by: number): unknown {
  if (!Number.isInteger(by)) throw new Error(`item.adjustQty: "by" must be a whole number, got ${by}`);
  return { by } satisfies AdjustQtyPayload;
}

/** The quantity this device shows: the sum of all adjustments received for the item; 0 if never adjusted. */
export function qtyOf(state: unknown, itemId: string): number {
  const v = (state as AdjustQtyState).adjustments?.[itemId];
  return v ? Object.values(v).reduce((a, b) => a + b, 0) : 0;
}
