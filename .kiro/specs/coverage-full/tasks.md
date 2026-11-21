# Tasks: coverage-full

Each task ends with `pnpm typecheck && pnpm test && pnpm props` green, then `pnpm test:coverage` and `pnpm coverage:gaps` showing zero gaps for the files of that task. Tests and properties are never weakened, skipped, or run with a lower `numRuns`. Never edit `kit/`, `vitest.config.ts` thresholds or its `exclude` list. Each new test is named after the behaviour it pins and asserts an observable result. Dead code is removed only when behaviour is unchanged, and is recorded in `design.md` under `## Production changes`. Any `/* v8 ignore next */` needs a one-line reason and an entry under `## Ignored branches` (target: zero). Do not run git. Note the duration of each `pnpm test:coverage` run (limit: 3 minutes).

- [ ] 1. Baseline
  - Run `pnpm test:coverage`, then `pnpm coverage:gaps`. Fill `design.md` §7: gaps per directory (statement / branch / function), files with gaps, and the four summary percentages.
  - Classify each gap with the table in `design.md` §2 and note, per file, any branch that looks dead.
  - Write nothing else. No test or product file changes.
  - _Requirements: R6.2, R8.3_

- [ ] 2. `skeleton/src/core/*`
  - Files: `causal`, `merges`, `simulate`. Extend `causal.test.ts`, `merges.test.ts`, `simulate.test.ts` (create beside the module if missing).
  - Cover each gap with a behaviour test (defaults, empty inputs, arms, uncalled callbacks). Merges stay pure joins: assert one result for any order and for duplicates where the branch is about input handling.
  - Remove a branch only if dead, and record it.
  - _Requirements: R1, R2, R3, R4, R5, R6, R7.1_

- [ ] 3. `skeleton/src/sync/*`
  - Files: `identity`, `inpage-link`, `link`, `replica`, `status`, `store`, `dev-relay-link`. Extend the matching `*.test.ts` files.
  - Failure paths (store `onerror`, closed link, throwing callback) are covered by injected failures through fakes. Assert the surfaced error or the state afterwards.
  - Do not touch the adapter contract of `store.ts` (the only module that imports Yjs).
  - _Requirements: R1, R2, R3, R4, R5, R6, R7.2_

- [ ] 4. `skeleton/src/limbo/*`
  - Files: `inspector`, `marks`, `pair-view`, `shell`, `shuffle-test`, `shuffle`, `twin`. Extend the matching `*.test.tsx` (limbo project) and `shuffle.test.ts` (unit).
  - Use the stub app and `renderApp` from `skeleton/src/limbo/test/`. Keep the shuffle runs small (a few orderings); do not run the 1,000-ordering shuffle for coverage.
  - The layer keeps reading only `Pair` state. A test never makes the layer compute a sync number.
  - _Requirements: R1, R2, R3, R4, R5, R6, R7.3_

- [ ] 5. `apps/basecamp/src/` non-op modules
  - Files: `actions`, `members`, `model`, `money`. Extend the matching `*.test.ts`.
  - Money cases use integer cents and `sum-split`. Assert shares sum to the amount.
  - _Requirements: R1, R2, R3, R4, R5, R6, R7.4_

- [ ] 6. `apps/basecamp/src/ops/*`
  - Files: `expense.add.op`, `expense.setAmount.op`, `expense.state`, `item.add.op`, `item.claims`, `item.life`, `item.move.op`, `item.rename.op`, `item.tick.op`. Extend the matching tests.
  - Ops keep their `merge` and `intent` (check against `kit/props/intents.json`). Assert `apply` and `invariant` results, and that applying the same op twice gives the same state.
  - Do not edit `registry.gen.ts`.
  - _Requirements: R1, R2, R3, R4, R5, R6, R7.5_

- [ ] 7. `apps/aftershock/src/`
  - Files: `model.ts`, `ops/sector.count.op`, `ops/sector.note.op`, `ops/sector.state`. Extend or create the matching tests.
  - Demo data only. Do not add a field-use claim to any test name or comment.
  - _Requirements: R1, R2, R3, R4, R5, R6, R7.6_

- [ ] 8. Final
  - Run `pnpm typecheck && pnpm test && pnpm props`, then `pnpm test:coverage` (exit 0, all four thresholds at 100%) and `pnpm coverage:gaps` (prints `No coverage gaps.`).
  - Record in `design.md` §8 the four summary percentages and the run duration, from the measured output. Confirm §5 and §6 list every removal and every ignore (ignores: target none).
  - Re-measure the skeleton budget with the command in `evidence/budget-basecamp-baseline.md` and confirm it did not grow.
  - _Requirements: R4.4, R5.2, R8_
