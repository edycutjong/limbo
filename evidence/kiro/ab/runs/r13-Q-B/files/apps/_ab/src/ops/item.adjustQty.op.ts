// item.adjustQty: changes an item's quantity by a whole number (never writes an absolute quantity).
// Intent: two people each adding one canister offline must both count, so qty = 0 + the sum of every adjustment.
// Merge: commutes. State keeps each applied op's `by` keyed by op id and derives qty from it, so order and duplicates
// cannot change the result.
import type { Op, OpDef } from '../../../../skeleton/src/core/types.ts';

export interface AdjustQtyPayload {
  by: number;
}

export interface AdjustQtyState {
  qtys?: Record<string, { applied: Record<string, number>; qty: number }>;
}

const def: OpDef<AdjustQtyState, AdjustQtyPayload> = {
  name: 'item.adjustQty',
  merge: 'commutes',
  intent: { kind: 'delta', field: 'qty' },
  apply(s, op: Op<AdjustQtyPayload>) {
    const by = op.payload.by;
    if (!Number.isSafeInteger(by)) return s;
    const cur = s.qtys?.[op.target];
    if (cur !== undefined && op.id in cur.applied) return s;
    const applied = { ...(cur?.applied ?? {}), [op.id]: by };
    const qty = (cur?.qty ?? 0) + by;
    return { ...s, qtys: { ...(s.qtys ?? {}), [op.target]: { applied, qty } } };
  },
  invariant(s) {
    for (const [t, v] of Object.entries(s.qtys ?? {})) {
      let sum = 0;
      for (const by of Object.values(v.applied)) {
        if (!Number.isSafeInteger(by)) return `target ${t} has a non-integer adjustment`;
        sum += by;
      }
      if (sum !== v.qty) return `target ${t} qty ${v.qty} is not the sum of its adjustments ${sum}`;
    }
    return true;
  },
};

export default def as unknown as OpDef;

/** Payload for "change the quantity of `itemId` by `by`". Carries the delta only, never the quantity this device shows. */
export function adjustQtyPayload(_state: unknown, _itemId: string, by: number): unknown {
  if (!Number.isSafeInteger(by)) throw new RangeError(`item.adjustQty: by must be an integer, got ${by}`);
  return { by } satisfies AdjustQtyPayload;
}

/** The quantity this device shows; 0 for an item never adjusted. */
export function qtyOf(state: unknown, itemId: string): number {
  return (state as AdjustQtyState).qtys?.[itemId]?.qty ?? 0;
}
