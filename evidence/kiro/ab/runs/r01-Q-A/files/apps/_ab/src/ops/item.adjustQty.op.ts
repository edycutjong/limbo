// item.adjustQty: changes an item's needed quantity by a whole-number delta (never sets an absolute value).
// Intent: concurrent "+1" taps on different devices must both count, so the payload is the delta, not the new total.
// Merge: commutes. State keeps each delta by op id; the quantity is their sum, so order and duplicates cannot change it.
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
    for (const [t, deltas] of Object.entries(s.adjustments ?? {}))
      for (const [id, by] of Object.entries(deltas))
        if (!Number.isInteger(by)) return `adjustment ${id} on ${t} is ${String(by)}, expected an integer`;
    return true;
  },
};

export default def as unknown as OpDef;

/** Payload for "change the quantity of `itemId` by `by`". The delta does not depend on the state. */
export function adjustQtyPayload(_state: unknown, _itemId: string, by: number): unknown {
  if (!Number.isInteger(by)) throw new RangeError(`adjustQty needs a whole number, got ${String(by)}`);
  return { by } satisfies AdjustQtyPayload;
}

/** The quantity this device shows: the sum of every adjustment received. 0 when never adjusted. */
export function qtyOf(state: unknown, itemId: string): number {
  const deltas = (state as AdjustQtyState).adjustments?.[itemId];
  return Object.values(deltas ?? {}).reduce((a, b) => a + b, 0);
}
