# Bugfix: two defects from the final pre-submission pass

## Introduction

A final pass found two defects. D1 came from an axe-core accessibility audit of the live AFTERSHOCK page. D2 came from an architecture review of the `coverage-full` changes. They are independent: D1 is a view and its tests, D2 is the BASECAMP model. Neither changes a merge result.

Code references were read on 2026-11-21. The request gave symbols and no line numbers, so none needed correcting. The lines cited below are current.

Wording: convergence stays "measured, property-tested". Kit-owned files (`kit/**`) and `skeleton/` are out of scope. No new dependency.

---

## D1 AFTERSHOCK grid cells: the accessible name does not contain the visible text (WCAG 2.5.3 Label in Name)

### Current Behavior (Defect)

1.1 `apps/aftershock/src/views/SectorGrid.tsx` gives each `role="gridcell"` `aria-label={cellLabel(id, s)}` (line 89). `cellLabel` is at lines 13 to 16.
1.2 The visible text of a cell is the spans `as-cell-id`, `as-cell-word` and, when the sector is reported and has counts, `as-cell-total` (lines 96 to 99). The glyph span between them is `aria-hidden`. The JSX has no whitespace between the spans, so the DOM has no text node between them.
1.3 WHEN axe-core 4.x runs `label-content-name-mismatch` on the live page (both replicas, at `/` and `/?replicas=2`) THEN the rule fails on every cell:
  - the visible text is one run, such as `B1SAFE` or `A1SAFE2`, and the label `B1, SAFE, 0 people reported` does not contain it;
  - an unreported cell shows `NO REPORT`, while its label is `A2, not reported`.
1.4 A voice-control user who says what they see ("click A2 no report") does not reach the cell.
1.5 `apps/aftershock/src/views/SectorGrid.test.tsx` line 42 asserts `C3, not reported`. `.kiro/specs/aftershock/requirements.md` R17.3 (line 177) names the same string.

### Expected Behavior (Correct)

1.6 The visible spans of a cell SHALL be separated by real whitespace in the DOM (a text node between spans). The cell layout and its look SHALL NOT change. `.as-cell` is `display: flex; flex-direction: column` (`apps/aftershock/app.css`, line 42), where whitespace-only text between flex items is not rendered.
1.7 WHEN a cell is reported THEN `cellLabel` SHALL return `<id>, <WORD>, <total> people reported`, unchanged.
1.8 WHEN a cell is not reported THEN `cellLabel` SHALL return `<id>, no report`.
1.9 For every severity and for an unreported cell, the cell's visible text (whitespace-normalised, case-insensitive, the `aria-hidden` glyph excluded) SHALL be a substring of its accessible name, after the commas in the name are removed. This is how axe compares them: it ignores punctuation.
1.10 The test of `cellLabel` and any test that asserts `not reported` SHALL be updated to the new string. R17.3 in `.kiro/specs/aftershock/requirements.md` SHALL say "no report".

### Unchanged Behavior (Regression Prevention)

1.11 WHEN a reported cell is rendered THEN the system SHALL CONTINUE TO use the label `<id>, <WORD>, <total> people reported` (`A1, SAFE, 2 people reported`, `B2, DAMAGED, 4 people reported`).
1.12 WHEN the grid has focus and an arrow key, Home or End is pressed THEN the system SHALL CONTINUE TO move focus within the row or grid, stop at the edges, and keep exactly one cell at `tabindex="0"`.
1.13 WHEN Enter or Space is pressed on a cell, or a cell is clicked THEN the system SHALL CONTINUE TO call `onSelect` with that sector id and create no op.
1.14 WHEN typing in a text input inside the grid THEN the system SHALL CONTINUE TO ignore the key in the grid handler.
1.15 WHEN the grid renders at 390 px and 1440 px THEN the system SHALL CONTINUE TO show the same cell layout, with a 44 px minimum cell size.
1.16 WHEN a cell is rendered THEN the system SHALL CONTINUE TO set `data-sector`, `data-severity` and `aria-selected` as before, show the word and glyph for every severity, and show `NO REPORT` for an unreported cell (14 of 24 on the seed, 10 with a word).
1.17 The grid's accessible name `Block 7 survey, sectors A1 to F4` SHALL CONTINUE TO be unchanged.

---

## D2 BASECAMP: the edit-op set and the edit-kind map are two literals that must stay in sync

### Current Behavior (Defect)

2.1 `apps/basecamp/src/model.ts` declares `EDIT_KIND: Record<string, EditKind>` (lines 93 to 99) and, separately, `EDIT_OPS = new Set([...])` (line 134) with the same five op names: `item.add`, `item.restore`, `item.rename`, `item.tick`, `item.claim`.
2.2 `lifeKind` (lines 136 to 147) returns `'edit'` when `EDIT_OPS.has(op.op)`. `materialize` then reads `EDIT_KIND[o.op]!` (line 223) for every resurrecting op. The `coverage-full` pass removed the old `?? 'add'` fallback.
2.3 The two lists agree today, so the `!` is safe. WHEN an op name is added to `EDIT_OPS` and not to `EDIT_KIND` THEN `materialize` yields `kind: undefined` in `lifeInfo.editedBy` with no type error and no test failure.
2.4 The same pass replaced three register fallbacks with `!`: `amount.value!.amountCents` (line 122), `name.value!.name` (line 208) and `pos.value!.key` (line 216). Each is safe only because of an invariant that is written nowhere:
  - the write list of each register always contains the item's (or expense's) first add op: `nameWrites` (lines 181 to 185) and `keyWrites` (lines 187 to 191) spread `adds`, and `amountOf` in `apps/basecamp/src/ops/expense.state.ts` seeds `base` from the first add;
  - the causal buffer never applies an op whose deps form a cycle (`ready` in `skeleton/src/core/causal.ts`, lines 121 to 125, needs every dep already applied);
  - so `causalLww` of a non-empty list always has a winner.
  AFTERSHOCK's `sectorFold` already states its equivalent invariant in a comment (`apps/aftershock/src/model.ts`, line 70).

### Expected Behavior (Correct)

2.5 There SHALL be one source of truth for the edit ops: `EDIT_KIND` is the only literal, and `EDIT_OPS` is derived from its keys, so the lookup is total by construction.
2.6 A one-line comment SHALL sit at each of the three register `!` sites (lines 122, 208, 216) and state the invariant in 2.4.
2.7 A unit test SHALL assert that every op name `lifeKind` classifies as `'edit'` has an `EDIT_KIND` entry.
2.8 A unit test SHALL assert that a group holding only an item's add op materialises its name and position from that add.

### Unchanged Behavior (Regression Prevention)

2.9 WHEN ops are materialised THEN the system SHALL CONTINUE TO produce the same `State` for every history: item names, ticks, units, life, twins, winners, losers, `pos`, `lifeInfo` and `values`, and every expense field.
2.10 WHEN a resurrecting edit is `item.rename`, `item.claim` or `item.restore` THEN the system SHALL CONTINUE TO report kind `rename`, `claim` or `restore` (the existing test "reports the kind of each resurrecting edit"). `item.add` SHALL CONTINUE TO report `add` and `item.tick` `tick`.
2.11 WHEN an op is `item.delete`, `item.move`, `item.release` or an `expense.*` op THEN the system SHALL CONTINUE TO be classified as it is today: `item.delete` is `delete`, the others are not edits.
2.12 WHEN a name or position is read THEN the system SHALL CONTINUE TO use `causalLww` over the same write lists, with the same winner and twins.
2.13 The merge rule and intent of every op, the seed ops and `seedVersion`, the goldens G01 to G21 and the convergence properties SHALL CONTINUE TO pass with no property file edited.

---

## Unchanged Behavior (both defects)

3.1 WHEN `pnpm test:coverage` runs THEN the system SHALL CONTINUE TO meet the 100% thresholds in `vitest.config.ts` (lines, statements, functions, branches), with no change to the thresholds or the exclusion list.
3.2 WHEN the chip strings (Synced, Syncing, Offline and the others) are rendered THEN the system SHALL CONTINUE TO show the same text and icons.
3.3 WHEN the property tier runs THEN the system SHALL CONTINUE TO pass with the same `numRuns`.
3.4 The skeleton budget (30 files, 2,400 lines, 15 exports) SHALL CONTINUE TO hold. Neither fix touches `skeleton/`.
3.5 `package.json` SHALL CONTINUE TO list the same dependencies.
