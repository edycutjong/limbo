# Design: coverage-full

Requirements: `requirements.md` (R1 to R8). The gate is `pnpm test:coverage` (v8 provider, thresholds in `vitest.config.ts`). The gap list is `pnpm coverage:gaps` (`kit/scripts/coverage-gaps.mjs`, reads `coverage/coverage-final.json`). Neither is edited. Wording: "measured, property-tested".

## 1. What is measured

| Item | Value |
|---|---|
| Include | `skeleton/src/**/*.{ts,tsx}`, `apps/*/src/**/*.{ts,tsx}` |
| Excluded (reasons in `vitest.config.ts`) | tests, `skeleton/src/limbo/test/**`, `*.props.ts`, `env.d.ts`, `main.tsx`, `shuffle.worker.ts`, `shuffle-runner.ts`, `devrelay.ts`, `views/**` |
| Test projects that count | `unit` (`*.test.ts`), `limbo` (`*.test.tsx`, jsdom), `props` (`*.props.test.ts`) |
| Start | lines and statements 99.96%, functions 97.5%, branches 93.3%; 103 gaps in 33 files (to be re-measured in Task 1) |

New tests go in the `unit` or `limbo` project, beside the module, so they run in `pnpm test`. Coverage from the `props` project also counts, but no gap is closed by relying on it.

## 2. Method per gap

1. Read the module and the gap line. Name the behaviour the branch decides (a default, an arm, an error path).
2. Classify:

| Kind | Action |
|---|---|
| Default (`?? x`, `= x` in destructuring, `\|\| x`) | Test once with the value absent and assert the default result. The present case is usually already covered. |
| `if` / ternary arm | Test the input that takes the missing arm; assert the different result. |
| Optional chain, `&&` short circuit | Test with the nullish or falsy operand. |
| `onerror`, `catch`, defensive throw on a corrupt store | Injected failure: a fake store, link or callback that fails; assert the thrown error, the state left behind, or the reported failure. |
| Uncalled function (callback, unsubscribe, noop) | Call it through the public path that owns it (unsubscribe after subscribe, `close` twice) and assert the effect. |
| Dead branch | Show it dead (types, callers), then remove it and record it (§5). |
| Unremovable and untestable | Last resort: `/* v8 ignore next */ reason` and record it (§6). |

3. Name the test after the behaviour. Group it in the existing `describe` for the module when one exists; add a new `describe` otherwise.
4. Run the file's tests, then `pnpm test:coverage` and `pnpm coverage:gaps`, and repeat until the file has no gap.

## 3. Test conventions

- Reuse the helpers existing tests use: the stub app and `renderApp` in `skeleton/src/limbo/test/`, op builders in the app tests, and the in-memory store and link fakes in `sync`. Add a helper only in a test file.
- Ops in tests are built the way the contract says: `l = 1 + max(l seen)`, `n = ++counter`, `deps` from the current VV, with fixed replica ids such as `a` and `b`. No wall clock, no randomness (R5.3).
- Do not read private state to make a branch reachable. Reach it through the public function, or through the injected failure of the thing it depends on.
- Money is integer cents. Orderings use UTF-16 code-unit order, never `localeCompare`.

## 4. Groups and likely gap shapes

The exact gaps come from Task 1. This table lists the kind of branch to expect, from the file list in the requirements.

| Task | Files | Likely shapes |
|---|---|---|
| 2 | `core/causal`, `core/merges`, `core/simulate` | empty inputs, missing VV entries, unit counts at 0, `life === 'deleted'` arms, default options |
| 3 | `sync/identity`, `inpage-link`, `link`, `replica`, `status`, `store`, `dev-relay-link` | store `onerror`, closed or double-closed link, unsubscribe, duplicate or out-of-order delivery, stalled own ops, relay close |
| 4 | `limbo/inspector`, `marks`, `pair-view`, `shell`, `shuffle-test`, `shuffle`, `twin` | empty queue, `k` above the wisp cap, reduced motion, missing descriptor, shuffle abort or failure, twin without actions |
| 5 | `basecamp/actions`, `members`, `model`, `money` | missing member, empty list, zero amount, default arguments |
| 6 | `basecamp/ops/*` | payload defaults, absent target, deleted item, empty claims, `ordered-move` with no neighbour, no-op writes |
| 7 | `aftershock/model`, `ops/sector.count.op`, `ops/sector.note.op`, `ops/sector.state` | default sector state, absent count or note, clear without a report |

Op tests assert `apply` results and `invariant` results only, and keep every op idempotent (applying twice gives the same state). They do not change any op's `merge` or `intent`.

## 5. Production changes

Only dead-code removals (R3.1, R4.2). Format: `file:line, what was removed, why it is dead, line delta`.

| File | Line | Removed | Why dead | Delta |
|---|---|---|---|---|
| none yet | | | | |

## 6. Ignored branches

Target: zero. Format: `file:line, reason (same text as the comment)`.

| File | Line | Reason |
|---|---|---|
| none yet | | |

## 7. Baseline

Filled by Task 1 from `pnpm test:coverage` and `pnpm coverage:gaps`.

| Directory | Files with gaps | Gaps (statement / branch / function) |
|---|---|---|
| `skeleton/src/core` | | |
| `skeleton/src/sync` | | |
| `skeleton/src/limbo` | | |
| `apps/basecamp/src` | | |
| `apps/basecamp/src/ops` | | |
| `apps/aftershock/src` (and `ops`) | | |
| Total | 33 (expected) | 103 (expected) |

Summary numbers at baseline: lines, statements, functions, branches (expected 99.96 / 99.96 / 97.5 / 93.3).

## 8. Final

Filled by Task 8: the four summary percentages, total duration of `pnpm test:coverage` (under 3 minutes, R5.2), and `pnpm coverage:gaps` output `No coverage gaps.`

## 9. Risks

- A removed dead branch changes a line count in the skeleton budget. It can only lower it. Task 8 re-measures with the command in `evidence/budget-basecamp-baseline.md`.
- A test written only to hit a line can pass while checking nothing. R1.3 requires an assertion on an observable result, and review of each task checks this.
- Coverage from the `props` project can hide a gap in the unit run. Each task also confirms the gap is closed by a unit or limbo test, by running `pnpm test` on its own files.
- Time: jsdom tests are the slowest. New limbo tests render small stub apps and avoid the 1,000-ordering shuffle.
