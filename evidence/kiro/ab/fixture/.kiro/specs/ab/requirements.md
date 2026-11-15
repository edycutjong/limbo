# Requirements: two ops for the `_ab` app

The `_ab` app (`apps/_ab/`) is a local-first app: every device keeps its own copy of the data, edits work offline, and
devices exchange ops whenever they reconnect, in any order. Ops are defined with the skeleton's `OpDef`
(`skeleton/src/core/types.ts`); each device applies every op exactly once, in an order consistent with what the op's
creator had seen (`Op.deps`), but different devices may apply concurrent ops in different orders.

## R1 `item.adjustQty`
User story: as a trip member, I change how many of an item the group needs ("we need 3 gas canisters", then "+1", "-1").
1. A user adjusts an item's quantity up or down by a whole number from the quantity their device currently shows.
2. Adjustments made on different devices at the same time are never lost: if two people each tap "+1" while offline,
   the quantity goes up by 2 once they sync.
3. Every device that has received the same adjustments shows the same quantity. An item never adjusted shows 0.

## R2 `sector.report`
User story: as a field surveyor, I report the damage severity of a map sector (`none`, `minor`, `major`, `critical`).
1. A user reports a severity for a sector.
2. A report made without knowledge of another report on the same sector never lowers the severity the other report set:
   with two concurrent reports, the sector shows the more severe of the two.
3. A re-inspection by someone who has already received the earlier report(s) may lower the severity (e.g. after repairs,
   `critical` → `minor`).
4. Every device that has received the same reports shows the same severity. A sector never reported shows `none`.
