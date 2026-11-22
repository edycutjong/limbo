# Tasks: bugfix-final-pass

Each task writes its failing test first, runs it and records the failure, then applies the fix, and ends with `pnpm typecheck && pnpm test && pnpm props` green. The red step is expected only for the new tests. Tests and properties are never weakened, skipped, or run with a lower `numRuns`. Do not run git. Do not edit `kit/**`, `skeleton/`, `vitest.config.ts` or `package.json`. No new dependency.

Order: D1, D2, then the cross-cutting pass.

- [x] 1. D1 (part 1): failing tests for Label in Name
  - In `apps/aftershock/src/views/SectorGrid.test.tsx`, add the helpers `norm`, `visibleText` (clone the cell, drop `[aria-hidden="true"]`, normalise) and `nameOf` (aria-label without commas, normalised), as in `design.md`.
  - Add "every cell's visible text is contained in its accessible name": a hand-built `sectors` map with `safe`, `damaged`, `unsafe`, one reported cell with total 2, one reported cell with no counts, and unreported cells; also the 24 seed cells. Assert all four `data-severity` values (`safe`, `damaged`, `unsafe`, `none`) occur, so the loop is not vacuous.
  - Add "visible spans are separated by whitespace" for `A1`.
  - Add the `app.css` assertion that `.as-cell` is `display: flex` with `flex-direction: column`.
  - Change the `C3` expectation to `C3, no report`.
  - Run and record the failures (today: `a1safe2` not in the name, `a2no report` not in `a2 not reported`, no text nodes, `C3` label).
  - Run `pnpm typecheck && pnpm test && pnpm props` (the red tests are expected until task 2).
  - _Requirements: D1 1.6 to 1.10_

- [x] 2. D1 (part 2): fix the cell text and the unreported label
  - `SectorGrid.tsx`: put `{' '}` between the id, glyph, word and total spans. `cellLabel`: unreported returns `${id}, no report`. No CSS change.
  - Update R17.3 in `.kiro/specs/aftershock/requirements.md` (line 177) to "no report".
  - Grep `e2e/`, `apps/*/src` and `skeleton/src` for `not reported`: no hit left in code or tests.
  - Confirm unchanged: the other `SectorGrid.test.tsx` tests (seed counts, A1 total, single tab stop, arrows, Home/End, Enter/Space, input guard, 44 px), `survey-scene.test.tsx`, `apps/aftershock/src/app.test.tsx`.
  - Run `pnpm typecheck && pnpm test && pnpm props` green.
  - _Requirements: D1 1.6 to 1.10; Unchanged 1.11 to 1.17_

- [x] 3. D2 (part 1): tests for the edit-op lookup and the register invariant
  - In `apps/basecamp/src/model.test.ts`:
    - add "every op `lifeKind` treats as an edit has an `EDIT_KIND` entry", over the op names in `ops` (`registry.gen.ts`) and every `EDIT_KIND` key, plus the `create`, `restore`, `delete` and `undefined` classifications in `design.md`;
    - add "a group holding only an item's add materialises name and position from it" and the expense twin (amount from the only `expense.add`);
    - extend "reports the kind of each resurrecting edit" with `item.add` (`add`) and `item.tick` (`tick`).
  - These need `lifeKind` and `EDIT_KIND` exported from `model.ts`. Export them in this task (no behaviour change); the import is the only red step (the test file fails to compile until then).
  - Mutation check, recorded and not kept: add `'item.move'` to `EDIT_OPS` only and confirm the new test fails on the missing `EDIT_KIND` entry; then revert.
  - Run `pnpm typecheck && pnpm test && pnpm props`. The characterisation tests pass today; say so in the record, since D2 has no runtime failure.
  - _Requirements: D2 2.7, 2.8; Unchanged 2.9 to 2.13_

- [ ] 4. D2 (part 2): one source of truth and the invariant comments
  - `model.ts`: `const EDIT_KIND = { ... } as const satisfies Record<string, EditKind>;` and `const EDIT_OPS = new Set<string>(Object.keys(EDIT_KIND));` so no second list of names exists. Keep `EDIT_KIND[o.op]!` (no fallback branch).
  - Add the three one-line invariant comments at `amount.value!`, `name.value!` and `pos.value!` as worded in `design.md`.
  - Re-run the mutation check from task 3 as a compile-time check: there is no second literal left to edit.
  - Confirm unchanged: `model.test.ts`, `actions.test.ts`, `conflicts.test.ts`, `scene.test.ts`, `seed.test.ts`, goldens G01 to G21, and every property with the same `numRuns`.
  - Run `pnpm typecheck && pnpm test && pnpm props` green.
  - _Requirements: D2 2.5, 2.6; Unchanged 2.9 to 2.13_

- [ ] 5. Cross-cutting pass
  - Run `pnpm typecheck && pnpm test && pnpm props && pnpm test:coverage && pnpm e2e`.
  - `pnpm test:coverage`: 100% on lines, statements, functions and branches, with `vitest.config.ts` untouched. `pnpm e2e`: if it exceeds the session time, report it as not run, never as passed.
  - Grep the touched files for `Date.now|new Date|performance.now|Math.random|randomUUID|toLocale`: no hit.
  - Confirm `skeleton/` has no edit (its files and the budget measured with the command in `evidence/budget-basecamp-baseline.md` are unchanged) and `package.json` is unchanged.
  - Ask the owner to re-run the axe audit on the live AFTERSHOCK page (`/` and `/?replicas=2`, both replicas) and expect `label-content-name-mismatch` to pass on all cells. If not run, state that.
  - Write the measured test counts into `design.md` under a new `## Results` heading. Write to `evidence/` only if the session may; the kitsmith cannot.
  - _Requirements: Unchanged 3.1 to 3.5_
