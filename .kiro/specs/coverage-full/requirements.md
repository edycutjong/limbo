# Requirements: coverage-full

CI runs `pnpm test:coverage`, which enforces 100% lines, statements, functions and branches on the domain code: `skeleton/src/**` and each app's non-view modules (`apps/*/src/**`, minus the exclusions in `vitest.config.ts`, each with a reason there). At the start of this spec lines and statements are at 99.96%, functions at 97.5% and branches at 93.3%. `pnpm coverage:gaps` lists 103 gaps in 33 files. This spec closes every gap with tests that pin behaviour. It adds no product behaviour. The op contract in `.kiro/steering/local-first.md` is binding. Wording everywhere: "measured, property-tested", never "proven" or "guaranteed". Any number in a page or comment comes from `evidence/`.

## Glossary

- **Gap**: one line printed by `pnpm coverage:gaps` as `file: kind line N` (`statement`, `branch` or `function`).
- **Gate**: `pnpm test:coverage` with the thresholds in `vitest.config.ts` (100 for lines, statements, functions, branches).
- **Behaviour test**: a `*.test.ts` or `*.test.tsx` beside the module that exercises a behaviour a caller can observe, named after that behaviour.
- **Dead branch**: a branch no input can reach, shown by the types or by a test of its callers.
- **Injected failure**: a test that forces a failure path (a corrupt store, a failing `onerror`, a throwing callback) through a stub or fake, with no change to the module.
- **Protected**: files the gate manifest protects (`kit/`), plus existing tests, properties, hooks and vacuity checks.

## R1 Every gap closed by a behaviour test

User story: as a maintainer, I want each uncovered branch pinned by a test of what it does, so the 100% means the behaviour is checked and not only executed.

1. For each gap, the work shall add or extend a behaviour test in a `*.test.ts` or `*.test.tsx` beside the module (unit project for `.ts`, limbo project for `.tsx`).
2. Each test shall be named after the behaviour it pins (for example `uses the default replica count when none is given`), never after a line number or a branch kind.
3. Each test shall assert an observable result (a return value, a state, a thrown error, a callback argument, a rendered output). A test that only calls the code without an assertion shall not count as closing a gap.
4. Tests shall not import from `kit/` internals beyond what existing tests already import, and shall not read `coverage/` output.

## R2 Nothing weakened

1. The work shall not weaken, skip (`skip`, `todo`, `only`, `.fails`), rename away or delete any existing test, property, hook, vacuity check or the gate manifest.
2. The work shall not lower any threshold, and shall not add to the `exclude` list or remove from the `include` list in `vitest.config.ts`.
3. The work shall not edit anything under `kit/`.
4. The work shall not change `numRuns` or any other property configuration.

## R3 Unreachable branches

1. When a branch is a dead branch, the work shall remove it, provided behaviour is unchanged and a test or the types show it dead. Each removal shall be recorded in `design.md` under `## Production changes` with the file and the line delta.
2. When a branch must stay (a guard against a corrupt store, an `onerror` handler, a defensive throw), the work shall cover it with an injected failure test.
3. The work may use `/* v8 ignore next */` (or `ignore next N`) only as a last resort. Each use shall carry a one-line reason after the comment and shall be listed in `design.md` under `## Ignored branches` with file, line and reason. The target is zero.
4. The work shall not widen a type, add a cast, or add a parameter only to make a branch reachable.

## R4 No product behaviour change

1. Public behaviour of every module shall be the same before and after: the same exports, signatures and results for the same inputs.
2. Production edits shall be limited to removing dead code (R3.1) and shall be listed under `## Production changes`.
3. Op files shall keep their declared `merge` and `intent`, and shall still match `kit/props/intents.json`.
4. The skeleton budget in `tech.md` (files, lines, exports) shall not be exceeded. Removing dead code only lowers the line count. If a removal would raise an export count, the task stops and reports.

## R5 Run time

1. Properties shall stay at their CI-sized tier. New tests shall be fast unit or jsdom tests and shall not run simulations beyond a few replicas and ops.
2. The whole `pnpm test:coverage` run shall finish in under 3 minutes. Each task shall note the measured duration.
3. New tests shall be deterministic: no wall clock, randomness without a fixed seed, real timers longer than 50 ms, or network.

## R6 Per-task verification

1. Each task shall end with `pnpm typecheck && pnpm test && pnpm props` green.
2. Each task shall end with `pnpm test:coverage` followed by `pnpm coverage:gaps` showing zero gaps for the files of that task. A gap in a file of a later task is allowed until that task.
3. A task shall touch only the files of its group, their tests, and (R3.1) the dead code it removes.

## R7 Scope by group

The gaps are in these groups. Each group is one task in `tasks.md`.

1. `skeleton/src/core/*`: `causal`, `merges`, `simulate`.
2. `skeleton/src/sync/*`: `identity`, `inpage-link`, `link`, `replica`, `status`, `store`, `dev-relay-link`.
3. `skeleton/src/limbo/*`: `inspector`, `marks`, `pair-view`, `shell`, `shuffle-test`, `shuffle`, `twin`.
4. `apps/basecamp/src/` non-op modules: `actions`, `members`, `model`, `money`.
5. `apps/basecamp/src/ops/*`: `expense.add.op`, `expense.setAmount.op`, `expense.state`, `item.add.op`, `item.claims`, `item.life`, `item.move.op`, `item.rename.op`, `item.tick.op`.
6. `apps/aftershock/src/`: `model`, `ops/sector.count.op`, `ops/sector.note.op`, `ops/sector.state`.

## R8 Final state

1. `pnpm test:coverage` shall exit 0 with lines, statements, functions and branches each at 100%.
2. `pnpm coverage:gaps` shall print `No coverage gaps.`
3. `design.md` shall record the baseline and final summary numbers, the production changes, and the ignored branches (target: none).
4. Final numbers shall be copied from the measured run. No number shall appear without that run behind it.
