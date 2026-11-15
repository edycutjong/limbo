// item.adjustQty: changes an item's quantity by a whole number (`by`, may be negative).
// Intent: two people each adding one canister offline must both count, so the payload is a delta, never a read-modify-write.
// Merge: commutes. State keeps each delta by op id and the total is their sum, so order and duplicates cannot change it.
import type { Op, OpDef } from '../../../../skeleton/src/core/types.ts';

export interface AdjustQtyPayload {
  by: number;
}

export interface AdjustQtyState {
  qty?: Record<string, { deltas: Record<string, number>; total: number }>;
}

const def: OpDef<AdjustQtyState, AdjustQtyPayload> = {
  name: 'item.adjustQty',
  merge: 'commutes',
  intent: { kind: 'delta', field: 'qty' },
  apply(s, op: Op<AdjustQtyPayload>) {
    const by = op.payload.by;
    if (!Number.isSafeInteger(by)) throw new Error(`item.adjustQty: by must be an integer, got ${String(by)}`);
    const cur = s.qty?.[op.target];
    if (cur !== undefined && op.id in cur.deltas) return s; // already applied
    const deltas = { ...(cur?.deltas ?? {}), [op.id]: by };
    const total = (cur?.total ?? 0) + by;
    return { ...s, qty: { ...(s.qty ?? {}), [op.target]: { deltas, total } } };
  },
  invariant(s) {
    for (const [t, v] of Object.entries(s.qty ?? {})) {
      let sum = 0;
      for (const d of Object.values(v.deltas)) {
        if (!Number.isSafeInteger(d)) return `target ${t} has a non-integer delta`;
        sum += d;
      }
      if (sum !== v.total) return `target ${t} total ${v.total} != sum of deltas ${sum}`;
    }
    return true;
  },
};

export default def as unknown as OpDef;

/** Payload for "change `itemId` by `by`". It carries only the delta, not the quantity this device shows. */
export function adjustQtyPayload(_state: unknown, _itemId: string, by: number): AdjustQtyPayload {
  if (!Number.isSafeInteger(by)) throw new Error(`item.adjustQty: by must be an integer, got ${String(by)}`);
  return { by };
}

/** The quantity this device shows. An item never adjusted shows 0. */
export function qtyOf(state: unknown, itemId: string): number {
  return (state as AdjustQtyState).qty?.[itemId]?.total ?? 0;
}
