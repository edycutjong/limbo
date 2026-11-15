# Design: two ops for the `_ab` app

Model: `apps/_ab/src/model.ts` (`Item.qty`, `Severity`, `SEVERITIES`).

## `apps/_ab/src/ops/item.adjustQty.op.ts`
- `export default` an `OpDef` with `name: 'item.adjustQty'` and an `apply(state, op)` that returns the new state.
- `export function adjustQtyPayload(state: unknown, itemId: string, by: number): unknown` returns the op payload for
  "change the quantity of `itemId` by `by`", given this device's current state. The app creates the op from it.
- `export function qtyOf(state: unknown, itemId: string): number` returns the quantity this device shows.

## `apps/_ab/src/ops/sector.report.op.ts`
- `export default` an `OpDef` with `name: 'sector.report'` and an `apply(state, op)` that returns the new state.
- `export function reportPayload(state: unknown, sectorId: string, severity: Severity): unknown` returns the op payload.
- `export function severityOf(state: unknown, sectorId: string): Severity` returns the severity this device shows.

State starts as `{}`; `apply` must not mutate its input. Ops reach `apply` with `id`, `target` (the item or sector id),
`payload`, `stamp` and `deps` filled in (`skeleton/src/core/types.ts`).
