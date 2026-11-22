Create a Kiro **bugfix spec** named `bugfix-final-pass` under `.kiro/specs/bugfix-final-pass/`: `bugfix.md` (Current Behavior /
Expected Behavior / Unchanged Behavior, with "WHEN … THEN the system SHALL CONTINUE TO …" clauses for the unchanged part, one section
per defect D1–D2), `design.md` (root cause per defect, fix approach, the failing test that shows each bug, the test that shows the fix,
and the checks that show unchanged behaviour still holds) and `tasks.md`. Write only those three files. Do not implement anything yet.
Do not run git.

Both defects were found in a final pre-submission pass (an axe accessibility audit of the live AFTERSHOCK page, and an architecture
review of the `coverage-full` changes). Read the cited files before writing; correct any line reference that has drifted.

## D1 AFTERSHOCK grid cells: the accessible name does not contain the visible text (WCAG 2.5.3 Label in Name)
`apps/aftershock/src/views/SectorGrid.tsx`: each `role="gridcell"` gets `aria-label={cellLabel(id, s)}`, while its visible text is the
spans `as-cell-id`, `as-cell-word` and (when reported) `as-cell-total`, rendered with no whitespace between them. axe-core 4.x rule
`label-content-name-mismatch` fails on every cell of the live page (both replicas, at `/` and `/?replicas=2`):
- the visible text is computed as one run, e.g. `B1SAFE` or `A1SAFE2`, which the label `B1, SAFE, 0 people reported` does not contain;
- an unreported cell shows `NO REPORT` but its label says `A2, not reported`.
A voice-control user who says what they see ("click A2 no report") does not reach the cell.
Expected: the visible spans are separated by real whitespace in the DOM (a text node between spans; the cell layout and its look must
not change), and every cell's accessible name contains its visible words in order: reported cells keep
`<id>, <WORD>, <total> people reported`; unreported cells become `<id>, no report`. `cellLabel`'s tests and any test or e2e that asserts
the old `not reported` string are updated. Add a test that, for every severity and for an unreported cell, the cell's visible text
(whitespace-normalised, case-insensitive, the aria-hidden glyph excluded) is a substring of its accessible name.

## D2 BASECAMP: the edit-op set and the edit-kind map are two literals that must stay in sync
`apps/basecamp/src/model.ts` declares `EDIT_KIND: Record<string, EditKind>` and, separately, `EDIT_OPS = new Set([...])` with the same
five op names. `lifeKind` admits an op to the resurrect rule as `'edit'` when `EDIT_OPS.has(op.op)`, and `materialize` then reads
`EDIT_KIND[o.op]!` for every resurrecting op (the `coverage-full` pass removed the old `?? 'add'` fallback). Today the two lists agree,
so the `!` is safe, but an op name added to `EDIT_OPS` and not to `EDIT_KIND` would materialise `kind: undefined` with no type error.
The same pass replaced three register fallbacks with `!` (`name.value!.name`, `pos.value!.key`, `amount.value!.amountCents`) whose
safety rests on an invariant that is not written down: each register's write list always contains the item's (or expense's) first add
op (`nameWrites`/`keyWrites` spread `adds`; `amountOf` in `apps/basecamp/src/ops/expense.state.ts` seeds `base`), and the causal buffer
never applies an op whose deps form a cycle, so `causalLww` of a non-empty list always has a winner.
Expected: one source of truth — `EDIT_OPS` is derived from `EDIT_KIND`'s keys (or `EDIT_KIND` is typed so a missing key is a type
error), so the lookup is total by construction; a one-line comment at each of the three register `!` sites states the invariant above
(as AFTERSHOCK's `sectorFold` already does); a unit test asserts that every op name `lifeKind` classifies as `'edit'` has an `EDIT_KIND`
entry, and a test that a group holding only an item's add op materialises its name and position from that add.

## Unchanged (examples; add any others the code shows)
Every op's merge rule, every materialised state, the seed ops and `seedVersion`, the convergence properties and the full property tier,
the grid's roving focus and keyboard behaviour (arrows, Home/End), the grid's look at 390 px and 1440 px, the chip strings, and the
100% coverage thresholds in `vitest.config.ts`. No new dependency.

Keep tasks small and numbered (a failing test first, then the fix), each ending with `pnpm typecheck && pnpm test && pnpm props` green,
plus a last cross-cutting task that also runs `pnpm test:coverage` (100% must still hold) and `pnpm e2e`.
