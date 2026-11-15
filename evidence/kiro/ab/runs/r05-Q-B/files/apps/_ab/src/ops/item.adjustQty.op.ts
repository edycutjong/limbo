// item.adjustQty: changes an item's quantity by a whole number (never writes an absolute quantity).
// Intent: two people each adding one canister offline must both count, so the quantity is the sum of every adjustment.
// Merge: commutes. State keeps each delta by op id (a repeated op id overwrites itself) and the quantity is their sum,
// so order and duplicates cannot change it.
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
    for (const [t, m] of Object.entries(s.adjustments ?? {})) {
      for (const [id, by] of Object.entries(m)) if (!Number.isInteger(by)) return `adjustment ${id} on ${t} is not a whole number`;
    }
    return true;
  },
};

export default def as unknown as OpDef;

/** Payload for "change the quantity of `itemId` by `by`". Carries only the change, never the quantity this device shows. */
export function adjustQtyPayload(_state: unknown, _itemId: string, by: number): unknown {
  if (!Number.isInteger(by)) throw new Error('item.adjustQty: by must be a whole number');
  return { by } satisfies AdjustQtyPayload;
}

/** The quantity this device shows: the sum of every adjustment received. 0 if never adjusted. */
export function qtyOf(state: unknown, itemId: string): number {
  const m = (state as AdjustQtyState).adjustments?.[itemId];
  let sum = 0;
  for (const by of Object.values(m ?? {})) sum += by;
  return sum;
}
