# Tasks: ui-polish

Each task ends with `pnpm typecheck && pnpm test && pnpm props` green. The last task also ends with `pnpm e2e` green. Tests, properties, hooks and the vacuity guard are never weakened, skipped, or run with a lower `numRuns`. Existing tests change only where a task says so, and only selectors or class names, never an assertion's meaning. No git. Skeleton edits are limited to `twin.tsx`, `marks.tsx` and `tokens.css`; record each in `design.md` section 12.

- [ ] 1. Baselines
  - Record in `evidence/ui-polish/baseline.md`: `pnpm test` file and test counts (85 files, 697 tests when this spec was written; re-measure), the skeleton budget with the command of `evidence/aftershock/budget-baseline.md`, and screenshots-free notes of the eight defects on the dev servers (one line each).
  - Resolve the four open decisions of `design.md` section 1 with the owner. If one is reversed, edit the design before task 2.
  - Tests: none new. All suites green before any change.
  - _Requirements: R9.2, R9.3_

- [x] 2. Focus ring and transition tokens
  - Add the `:focus-visible` rule (3 px `--ink`, 2 px offset) at the end of `skeleton/src/limbo/tokens.css`. Do not touch the `:root` block.
  - Add `apps/controls.css` with the `--ui-dur` and `--ui-ease` properties on `body` and the reduced-motion block. Import it in both apps after `tokens.css`.
  - Tests: `skeleton/src/limbo/focus.test.ts` reads `tokens.css` and checks the rule, the `3px` width, the `2px` offset, and that no other `:focus-visible` rule sets `outline`. `tokens.test.ts` stays green unchanged.
  - _Requirements: R7.1, R7.3_

- [ ] 3. Shared control classes
  - In `apps/controls.css` write `.ui-btn`, `.ui-btn--quiet`, `.ui-input`, `.ui-check` (drawn checkbox, 44 px label), `.ui-chip`, `.ui-card`, `.ui-note`, with rest, hover, press, disabled states (focus comes from task 2). Extend the selector list to `.limbo-button`, `.limbo-lever`, `.limbo-reset`. Tokens only: no hex value, no new font.
  - Tests: `apps/controls.test.ts` reads the sheet and checks that it has no `#` colour literal, no `url(`, no `@import` of a network address, every `transition` uses `var(--ui-dur)`, and every state of R1.5 has a selector.
  - _Requirements: R1.5, R1.7, R6.5, R7.3_

- [ ] 4. BASECAMP tokens and item rows
  - `apps/basecamp/src/main.tsx` imports `tokens.css` before `app.css` and `../../controls.css`. Write `body` and `h1` rules in `app.css` (`h1` gets `limbo-title`).
  - `ItemRow.tsx`: add `data-ticked`, the `ui-check` hooks on the tick input, `ui-btn` on the handle and overflow button, `ui-btn--quiet` on menu items. Grid layout, drawn tick with check mark and strike-through, two-line layout at 390 px. `.bc-twin-row` is `display: block`.
  - Tests: `ItemRow.test.tsx` gains `data-ticked` true and false; `build.test.ts` (or `app-shell.test.tsx`) checks that the built CSS contains the font-face rules of the tokens. Existing ItemRow, Reorder and ItemTwins tests unchanged.
  - _Requirements: R1.1 to R1.5, R1.7_

- [ ] 5. BASECAMP expenses, add form, claim chip
  - `ExpenseRow.tsx`, `AddItem.tsx`, `ClaimChip.tsx`: class names only (`ui-card`, `ui-btn`, `ui-btn--quiet` for Remove, `ui-input`, `ui-chip`). `app.css`: expenses as a bullet-free card list, amount in tabular numerals, shares in a wrapping row.
  - Tests: `ExpenseRow.test.tsx` checks the list has no bullet class (`list-style` via the sheet test) and that Remove keeps its accessible name. Existing assertions unchanged.
  - _Requirements: R1.5, R1.6, R1.7_

- [ ] 6. Twin ghost bugfix
  - First write `skeleton/src/limbo/twin-layout.test.tsx` and see it fail: the ghost and the at-rest content share one parent, and that parent contains no caption, rule line or action.
  - Fix `twin.tsx` (stage wrapper, inline style untouched) and the twin rules in `tokens.css` per design section 5. Record the line delta in `design.md` section 12 and re-measure the budget.
  - Tests: new layout test passes; `twin.test.tsx`, `motion.test.tsx`, `fixed.test.tsx` and the app twin tests pass with no edit (Unchanged clause).
  - _Requirements: R2.1 to R2.4, R9.3, R9.4_

- [ ] 7. Wisps
  - Split the `Wisps` markup in `marks.tsx` per design section 6; add the flex row rules to `tokens.css`. Record the line delta and re-measure the budget.
  - Tests: `wisps.test.tsx` gains a case: with 2 queued ops, `.limbo-wisp-summary` text is `2waiting` as separate `.wisp-count` ("2") and `.limbo-wisp-word` ("waiting"), and `.limbo-plate` text is `PLATE 7 · 2 WAITING`. Existing wisps, single, pair-view and app scene tests unchanged.
  - _Requirements: R3.1 to R3.3, R9.3_

- [ ] 8. Fog veil
  - Replace the flat veil in `tokens.css` with the gradient and grain of design section 7, including the `haze` variant. Style `.limbo-fog-label` as a corner tag in `controls.css`.
  - Tests: `skeleton/src/limbo/fog-veil.test.ts` parses the veil percentages from `tokens.css` and requires `--ink` contrast ≥ 4.5:1 over the composited veil on `--card` and on `--bg`; asserts no `url(`, no `animation` on `.limbo-fog-veil` outside the existing `limbo-drain` rule; `fog.test.tsx` and `motion.test.tsx` unchanged and green.
  - _Requirements: R4.1 to R4.6, R6.2_

- [ ] 9. Phones: stacked pair by default
  - Add `withReplicas(search)` to each app's `main.tsx` and pass it as `ReplicaPair`'s `search`. Add the pair, solo bar, overflow and caption rules to `controls.css` per design section 8.
  - Tests: unit tests of `withReplicas` in both apps (no param gives `replicas=2`; `1` and `2` are kept; other params are kept). `app.test.tsx` of each app: with no `replicas` param, both `[data-replica]` cards render and the "Cut link" button is present. Skeleton `pair-view.test.tsx` and `single.test.tsx` are unchanged. Reason for the commit: the apps now default to two replicas on phones so the first screen shows Cut link, fog, wisps and twins.
  - _Requirements: R5.1 to R5.5_

- [ ] 10. AFTERSHOCK
  - `SectorCard.tsx`: one spaced tag per edited field (design section 9). `ReportForm.tsx`: `ui-btn`, `ui-input`, `ui-check` (Re-inspection label with a 44 px hit area). `SectorGrid.tsx` and `app.css`: gridcell hover with 1 px lift, selection as a border, delete the per-component focus outlines.
  - Update selectors of tests that use `.as-btn`, `.as-input` or `.as-check` to the new class names. No assertion changes.
  - Tests: `SectorCard.test.tsx`: two scripted fields render two tags, each with a field name and the text `scripted edit`. `ReportForm.test.tsx`: the Re-inspection input is inside a `.ui-check` label. `app.css` check in `controls.test.ts` or a sibling: `.as-cell:hover` has a `transform` and a `border-color` and uses `var(--ui-dur)`.
  - _Requirements: R6.1 to R6.5, R7.1_

- [ ] 11. Shuffle blurb
  - Add the one-line note under `ShuffleTest` in both `ShuffleSection.tsx` files.
  - Tests: both `Shuffle.test.tsx` files assert the sentence is present, contains no digit, and that the existing "orderings → same state" line is unchanged.
  - _Requirements: R8.1, R8.2_

- [ ] 12. Playwright check, final record (last)
  - Add `e2e/ui-polish.spec.ts` per design section 11, and the two projects (`ui-polish-basecamp` on 5174, `ui-polish-aftershock` on 5176) to `playwright.config.ts`. No existing e2e file changes.
  - Run `pnpm typecheck && pnpm test && pnpm props && pnpm e2e`. If a check fails because of a product defect, fix the CSS or markup of the owning task; do not loosen the check.
  - Fill in `design.md` sections 12 and 13: skeleton files touched with line deltas, the measured budget (files and lines against 30 and 2,400), test counts before and after, the `pnpm props` and `pnpm e2e` results, and every file changed outside `apps/` (expected: `skeleton/src/limbo/{twin.tsx,marks.tsx,tokens.css}`, new `skeleton/src/limbo/{focus,twin-layout,fog-veil}` tests, `e2e/ui-polish.spec.ts`, `playwright.config.ts`, `evidence/ui-polish/*`). Write the same into `evidence/ui-polish/final.md`.
  - Tests: the new spec (a to f at both viewports on both apps, solo-page trial click, focus-ring size check) and all existing e2e tests.
  - _Requirements: R9.1 to R9.4_
