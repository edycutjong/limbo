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
| `skeleton/src/core/causal.ts` | 86 | `?? ''` after `by.split('#')[0]`; now `[0]!` | `split` always returns at least one element | 0 |
| `skeleton/src/core/causal.ts` | 123 | `op.deps[r] ?? 0` in `ready`; loop now iterates `Object.entries(op.deps)` | `r` comes from the keys of `op.deps`, so the entry exists (`VV` values are numbers) | 0 |
| `skeleton/src/core/simulate.ts` | 88 | `o.deps[r] ?? 0` in `deliveryOrder`; now `Object.entries(o.deps).every(([r, n]) => ...)` | same: `r` comes from the keys of `o.deps` | 0 |
| `skeleton/src/sync/identity.ts` | 38-48 | `take`: initial no-op `release` and the `granted` boolean; the promise now resolves the release function (or `undefined`) directly | `release` is assigned synchronously in the lock callback before the boolean resolved, so the no-op was never called | -3 |
| `skeleton/src/sync/link.ts` | 32 | `if (!y) return false` in `same`; `y` is now `VV`, call site passes `lastSeen!` | `observeVV` runs only after a hello, which sets `lastSeen`; `reset` clears `helloSeen` and `lastSeen` together | -1 |
| `skeleton/src/sync/link.ts` | 125 | `peerVV ?? {}` in the replica subscriber; now `peerVV!` | the subscriber runs only when `helloSeen`, and a hello sets `peerVV` (cleared together with `helloSeen`) | 0 |
| `skeleton/src/sync/status.ts` | 55 | `peerVV[r] ?? 0` in `countBehind`; loop now iterates `Object.entries(peerVV)` | `r` comes from the keys of `peerVV` | 0 |
| `apps/basecamp/src/members.ts` | 18, 22 | `?? op.stamp.r` and `?? replicaId` after `split('#')[0]`; now `[0]!` | `split` always returns at least one element | 0 |
| `apps/basecamp/src/model.ts` | 122, 208, 216 | `?? first.payload.*` after `amount.value?.`, `name.value?.`, `pos.value?.`; now `value!` | `amountOf`, `nameWrites` and `keyWrites` always include the first add, so the lww winner exists | 0 |
| `apps/basecamp/src/ops/item.move.op.ts` | 20 | `?? op.payload.key` after `value?.key`; now `value!.key` | `writes` always contains this op, so the lww winner exists | 0 |
| `apps/basecamp/src/model.ts` | 223 | `EDIT_KIND[o.op] ?? 'add'`; now `!` | resurrecting ops are only `EDIT_OPS`, all keys of `EDIT_KIND` | 0 |
| `apps/aftershock/src/model.ts` | 37 | local `byStamp` comparator (nested ternaries); now `compareStamp(a.stamp, b.stamp)` from `core/causal.ts` | same total order (l, then r by UTF-16 code unit, then n). The `a.r > b.r` arm was unreachable: the frontier array is always built winner first, then twins, in descending stamp order, so the sort never compares a later, larger element | -2 |
| `apps/aftershock/src/model.ts` | 71 | `?? 0` after `r.value?.count`; now `r.value!.count` | `byWho` lists are never empty, so the lww winner exists | 0 |

## 6. Ignored branches

Target: zero. Format: `file:line, reason (same text as the comment)`.

| File | Line | Reason |
|---|---|---|
| none yet | | |

## 7. Baseline

Measured by Task 1 from `pnpm test:coverage` (exit 1, thresholds unmet as expected; 116 test files passed, 1289 tests passed, 9 skipped by existing tests) and `pnpm coverage:gaps` (103 gaps).

Duration of `pnpm test:coverage`: 91.07 s vitest, 1:31.89 wall (limit 3 minutes).

| Directory | Files with gaps | Gaps (statement / branch / function) |
|---|---|---|
| `skeleton/src/core` | 3 (`causal`, `merges`, `simulate`) | 1 / 8 / 1 |
| `skeleton/src/sync` | 7 (`dev-relay-link`, `identity`, `inpage-link`, `link`, `replica`, `status`, `store`) | 0 / 14 / 5 |
| `skeleton/src/limbo` | 7 (`inspector`, `marks`, `pair-view`, `shell`, `shuffle-test`, `shuffle`, `twin`) | 0 / 19 / 2 |
| `apps/basecamp/src` | 4 (`actions`, `members`, `model`, `money`) | 0 / 12 / 0 |
| `apps/basecamp/src/ops` | 9 (`expense.add.op`, `expense.setAmount.op`, `expense.state`, `item.add.op`, `item.claims`, `item.life`, `item.move.op`, `item.rename.op`, `item.tick.op`) | 0 / 29 / 0 |
| `apps/aftershock/src` (and `ops`) | 4 (`model`, `ops/sector.count.op`, `ops/sector.note.op`, `ops/sector.state`) | 0 / 12 / 0 |
| Total | 34 (measured; the requirements text says 33) | 1 / 94 / 8 = 103 |

Summary numbers at baseline (measured):

| Metric | Percent | Covered / total |
|---|---|---|
| Lines | 99.96 | 2680 / 2681 |
| Statements | 99.96 | 2680 / 2681 |
| Functions | 97.48 | 310 / 318 |
| Branches | 93.28 | 1305 / 1399 |

### Classification per file (table in section 2)

Kinds: D = default (`??`), A = if/ternary arm, O = optional chain / short circuit, F = failure path (injected failure), U = uncalled function, X = candidate dead branch (to confirm by types or callers in the task).

| File | Gap lines | Kind | Dead-branch note |
|---|---|---|---|
| `core/causal.ts` | 8 | A | none |
| | 86 | D | X: `split('#')[0] ?? ''` always has element 0 (`split` never returns empty); only `noUncheckedIndexedAccess` needs it |
| | 100 | A | array with `undefined` element (test it) |
| | 105-106 | F | defensive throw on unsupported type (function, symbol, bigint); injected input test |
| | 123 | D | X: `op.deps[r] ?? 0` where `r` comes from `Object.keys(op.deps)` |
| `core/merges.ts` | 150 | A | none (equal keys tie-break by id, both arms testable) |
| `core/simulate.ts` | 38 | U | `performance.now` override never called |
| | 88 | D | X: `o.deps[r] ?? 0` with `r` from `Object.keys(o.deps)` |
| | 123 | D | default `steps = 12` |
| `sync/dev-relay-link.ts` | 15, 16 | D | defaults for fetch and pollMs |
| | 40, 90 | F | `!res.ok` throw; injected fetch |
| | 42 | A | `!active()` after fetch |
| `sync/identity.ts` | 42, 61 | U | noop `release` initial values |
| `sync/inpage-link.ts` | 91, 98 | A | `!up` / `up` early returns |
| `sync/link.ts` | 33 | A | `!y` |
| | 38 | A | stamp comparator `r` arm |
| | 65 | A | `!link.isUp()` |
| | 127 | D | `peerVV ?? {}`; X if `helloSeen` implies `peerVV` set |
| `sync/replica.ts` | 69 | F | unknown op name throw |
| `sync/status.ts` | 55 | D | X: `peerVV[r] ?? 0` with `r` from `Object.keys(peerVV)` (the `vv[r] ?? 0` side is reachable) |
| | 101 | D | `merge ?? 'unknown'` for an op with no def |
| `sync/store.ts` | 53, 54, 94 | U, F | `tx.onerror`, `tx.onabort`, `req.onerror` plus their `?? new Error` fallbacks; injected fake IndexedDB |
| `limbo/inspector.tsx` | 100 | A | `!first \|\| !last` focus trap with no focusable |
| | 102, 105 | A | shift-tab / tab wrap arms, focus outside drawer |
| | 126 | D | `peerId() ?? 'none yet'` |
| | 150 | A | arm inside mapped rows |
| `limbo/marks.tsx` | 40 | A | `data-enter` false arm |
| | 115 | U | `onAnimationEnd` |
| `limbo/pair-view.tsx` | 57 | D, A | `p.search` absent and `location` undefined arm; X for `typeof location === 'undefined'` in jsdom (always defined) |
| `limbo/shell.tsx` | 71 | A | no rows |
| | 75 | A | focus move arms (`at < 0`, up, clamp) |
| | 178 | A | `e.at ?? 0` and unresolved entries |
| | 210 | F | `useDefs` outside `<LimboShell>` throw |
| `limbo/shuffle-test.tsx` | 46 | A, F | non-Error rejection and stale token |
| `limbo/shuffle.ts` | 41 | A | empty steps |
| | 92 | A | `MAX_ATTEMPTS` break |
| | 95 | A | `smaller.length` equals set or zero |
| | 105, 106 | A | no disagreement found (no trace) |
| `limbo/twin.tsx` | 22 | A | `done` reset |
| | 28 | A | key not Enter, or target inside a button |
| | 45 | U | `onAnimationEnd` when leaving |
| `basecamp/actions.ts` | 24 | D | `memberOfReplica(r.id) ?? r.id` |
| | 32 | A | `last === undefined` (empty list) |
| `basecamp/members.ts` | 18, 22 | D | X: `split('#')[0] ?? x` is always defined |
| | 26 | D | member with no display name |
| `basecamp/model.ts` | 91 | A | stamp comparator `r` arm |
| | 122, 208, 216 | D | X: `value?.x ?? first.payload.x` where the lww winner exists whenever `first` exists (writes include the create op); confirm in Task 5 |
| | 223 | D | `EDIT_KIND[o.op] ?? 'add'` (edit op not in map) |
| `basecamp/money.ts` | 12 | A | non-safe-integer returns null |
| | 17 | F | `formatCents` bad amount throw |
| `basecamp/ops/*.op.ts`, `item.*`, `expense.*` | listed in the gap output | D, A, F | `s.x ?? {}` defaults and `invariant` guards against corrupt state (type, range, shape); cover by feeding a corrupt state to `invariant` (injected failure). `item.move.op.ts:20` `value?.key ?? op.payload.key`: X, winner always exists because `writes` holds this op |
| `aftershock/model.ts` | 37 | A | stamp comparator `r` arm |
| | 71 | D | `r.value?.count ?? 0`; X if the lww result is never empty |
| `aftershock/ops/sector.*` | see gap output | D, A | `invariant` guards on corrupt state; same method as basecamp ops |

Dead-branch candidates (X) are only confirmed by the owning task, which then removes them and records them in section 5. Task 1 changed no file other than this section.

## 8. Final

Measured by Task 8. `pnpm typecheck`, `pnpm test` (103 files, 1034 tests), and `pnpm props` (22 files, 359 passed, 9 skipped) all exit 0. `pnpm test:coverage` exits 0 (125 test files, 1393 tests passed, 9 skipped).

| Metric | Percent | Covered / total |
|---|---|---|
| Statements | 100 | 2675 / 2675 |
| Branches | 100 | 1463 / 1463 |
| Functions | 100 | 316 / 316 |
| Lines | 100 | 2675 / 2675 |

Duration of `pnpm test:coverage`: 90.34 s vitest, 1:31.02 wall (limit 3 minutes, R5.2).

`pnpm coverage:gaps` prints `No coverage gaps.`

Ignores: a search of `skeleton/src` and `apps/*/src` for `v8 ignore`, `istanbul ignore` and `c8 ignore` finds none, so §6 (none) is correct. §5 lists the dead-code removals made by Tasks 2 to 7.

Skeleton budget, command from `evidence/budget-basecamp-baseline.md`: 21 files, 2,189 non-blank, non-comment lines. The last recorded figure is 2,142 (after bugfix-inspector-resolved task 2), so the count is 47 lines higher than that record, not lower. The removals in §5 only lower it, and this spec adds no skeleton product code. The growth is not explained by this spec; the source of the +47 is not established here. It is within the 30-file, 2,400-line budget.

## 9. Risks

- A removed dead branch changes a line count in the skeleton budget. It can only lower it. Task 8 re-measures with the command in `evidence/budget-basecamp-baseline.md`.
- A test written only to hit a line can pass while checking nothing. R1.3 requires an assertion on an observable result, and review of each task checks this.
- Coverage from the `props` project can hide a gap in the unit run. Each task also confirms the gap is closed by a unit or limbo test, by running `pnpm test` on its own files.
- Time: jsdom tests are the slowest. New limbo tests render small stub apps and avoid the 1,000-ordering shuffle.
