// item.adjustQty: changes an item's quantity by a whole-number delta (never sets an absolute value).
// Intent: concurrent adjustments all count, so two offline "+1" taps give +2 after sync.
// Merge: commutes. State records each delta by op id and sums them, so order and duplicates cannot change the total.
import type { Op, OpDef } from '../../../../skeleton/src/core/types.ts';

export interface AdjustQtyPayload {
  by: number;
}

export interface AdjustQtyState {
  qty?: Record<string, Record<string, number>>;
}

const def: OpDef<AdjustQtyState, AdjustQtyPayload> = {
  name: 'item.adjustQty',
  merge: 'commutes',
  intent: { kind: 'delta', field: 'qty' },
  apply(s, op: Op<AdjustQtyPayload>) {
    const cur = s.qty?.[op.target] ?? {};
    return { ...s, qty: { ...(s.qty ?? {}), [op.target]: { ...cur, [op.id]: op.payload.by } } };
  },
  invariant(s) {
    for (const [t, deltas] of Object.entries(s.qty ?? {})) {
      for (const [id, by] of Object.entries(deltas)) if (!Number.isInteger(by)) return `adjustment ${id} on ${t} is not a whole number`;
    }
    return true;
  },
};

export default def as unknown as OpDef;

/** The payload for "change the quantity of `itemId` by `by`". A delta, so it does not depend on the current state. */
export function adjustQtyPayload(_state: unknown, _itemId: string, by: number): unknown {
  if (!Number.isInteger(by)) throw new RangeError(`adjustQty needs a whole number, got ${by}`);
  const payload: AdjustQtyPayload = { by };
  return payload;
}

/** The quantity this device shows: the sum of every adjustment received. 0 if never adjusted. */
export function qtyOf(state: unknown, itemId: string): number {
  const deltas = (state as AdjustQtyState).qty?.[itemId];
  let total = 0;
  for (const by of Object.values(deltas ?? {})) total += by;
  return total;
}
