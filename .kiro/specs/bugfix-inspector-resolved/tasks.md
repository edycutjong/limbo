# Tasks: bugfix-inspector-resolved

Each task ends with `pnpm typecheck && pnpm test && pnpm props` green, except task 1, whose new tests are expected to fail until task 2 (see its note). The e2e task also runs `pnpm e2e`. Tests and properties are never weakened, skipped, or run with a lower `numRuns`. Do not run git.

- [x] 1. Failing tests that show the bug
  - `skeleton/src/limbo/inspector.test.tsx`: add the "Incoming resolve is listed" case (concurrent claims, B deletes, A's Conflicts section has a `[data-resolved]` row naming `claim-one`, and it is gone after the next crossing).
  - `apps/basecamp/src/views/lake-scene.test.tsx`: assert two resolved rows on A (`resurrect` and `claim-one`) and remove the "KNOWN GAP (R10.8)" comment.
  - Run both and record the failure (the inspector case reads "No conflicts."; the lake scene has one row). Keep them failing. This is the one task where `pnpm test` is expected red, and only for these two tests. `pnpm typecheck` and `pnpm props` stay green.
  - _Requirements: Current Behavior 1, 2, 4; Expected Behavior 1, 2, 4_

- [x] 2. Fix `useLimbo`
  - `skeleton/src/limbo/shell.tsx`: extract `mark(now)` from `build()`; add `at` (log length when first marked resolved, cleared on reappearance); in `onCross`, run `mark(describe(replica.state()))` first, then delete only entries with `resolved && at <= replica.log().length - ops.length`. No new export, file or timer.
  - Verify the assumption in design §2 (ops of `onCross` are already in `replica.log()`); if not, use the fallback described there.
  - Update the limbo-layer design §3 sentence about `onCross` clearing resolved entries to match.
  - Tests that must now pass: the task 1 tests. Add to `inspector.test.tsx`: mixed order (local resolve in N-1, incoming in N), re-twinned Keep ‖ Delete stays an open twin and is not in `resolved`. Add to `shell.test.tsx`: fake timers change neither `resolved` nor `crossing`.
  - Run `pnpm typecheck && pnpm test && pnpm props`. Record the skeleton line count with the command in `evidence/budget-basecamp-baseline.md`. If it passes 2,400 lines, 30 files or 15 exports, stop and report.
  - _Requirements: Expected Behavior 1 to 3; Unchanged Behavior 1, 2, 4 to 10_

- [ ] 3. Regression pass on the layer and the app
  - Confirm unchanged: the existing "keeps a resolved conflict until the next crossing, then drops it", `shell.test.tsx` (stable snapshot, unsubscribe, live-region sequence), chip, wisps, fog and Recent exchanges tests, and the rest of `lake-scene.test.tsx`. Fix any failure in the fix, never in the test.
  - Run `pnpm typecheck && pnpm test && pnpm props`.
  - _Requirements: Unchanged Behavior 1 to 9_

- [ ] 4. Update the e2e
  - `e2e/basecamp-offline.spec.ts` (~lines 198-201): assert two rows on A, one ending `(rule: resurrect) resolved` and one ending `(rule: claim-one) resolved`; remove the "KNOWN GAP (R10.8)" comment.
  - Run `pnpm typecheck && pnpm test && pnpm props && pnpm e2e`.
  - Search the repo for the string "KNOWN GAP" and confirm no hit remains for R10.8.
  - _Requirements: Expected Behavior 2, 4_
