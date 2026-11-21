Create a Kiro **bugfix spec** named `bugfix-arch-review` under `.kiro/specs/bugfix-arch-review/`: `bugfix.md` (Current Behavior /
Expected Behavior / Unchanged Behavior, with "WHEN … THEN the system SHALL CONTINUE TO …" clauses for the unchanged part, one section
per defect D1–D5), `design.md` (root cause per defect, fix approach, the failing test that shows each bug, the test that shows the fix,
and the checks that show unchanged behaviour still holds) and `tasks.md`. Write only those three files. Do not implement anything yet.
Do not run git.

These defects were found in an architecture review of the merge, sync and Limbo layers and each was reproduced locally. Read the cited
files before writing; correct any line reference that has drifted.

## D1 Two tabs write into one pair's databases (skeleton-sync R14 is implemented but not wired)
`skeleton/src/sync/identity.ts` `acquireIdentity` implements R14 of `.kiro/specs/skeleton-sync/requirements.md` (session id in
`sessionStorage`, a Web Lock on `limbo:<app>:pair-<session>`, databases `limbo:<app>:pair-<session>:a|b`, a duplicated tab mints a new
session, `reset()` deletes only its own databases) and `skeleton/src/index.ts` exports it, but neither app calls it.
`apps/basecamp/src/main.tsx` and `apps/aftershock/src/main.tsx` `boot()` call `createPair` without a `store` option, so the pair opens the
fixed names `limbo:<app>:a` / `limbo:<app>:b` (`skeleton/src/sync/pair.ts`, the `stores` line), and Reset demo deletes those fixed names.
Two tabs of one app are two writers on the same databases (the `store.ts` header assumes "Single writer per database (R14)"), and two
tabs that boot together can read the same incarnation `k` and mint the same dots.
Expected: each app's `boot()` acquires a pair identity first (`sessionStorage`, `navigator.locks` when present, an id generator passed in
by the app, `location.search`), then calls `createPair` with a `store` opener that maps side `a` to `identity.names[0]` and side `b` to
`identity.names[1]`; Reset demo closes the pair, calls `identity.reset()` and reloads. Identity stays the only module that draws random
ids. Tests: a second boot whose session id is already locked opens different database names; Reset deletes only this session's two
databases; update the existing tests that assert the fixed names (e.g. `apps/basecamp/src/app.test.tsx` "Reset demo deletes both
databases") to the R14 names.

## D2 One replica allocating into the same gap twice gets the same position key, and the next move between the two items throws
`allocKey` (`skeleton/src/core/causal.ts`) suffixes `generateKeyBetween(left, right)` with only the replica id before `#`, so one replica
(in any of its incarnations) allocating into the same (left, right) gap twice gets an identical key. Reachable in BASECAMP: replica A
places X between L and R, deletes X (deleted items leave `order`, `apps/basecamp/src/model.ts`, the `order` filter), moves or adds Y into
the same gap (same key as X), and X comes back (Keep on its twin, or a restore). X and Y now hold equal keys and `moveItem`
(`apps/basecamp/src/actions.ts`) between them calls `generateKeyBetween(K, K)`, which throws "K >= K", so the move is lost.
Repro: `allocKey(L, R, 'a#1') === allocKey(L, R, 'a#2')` is true, and `allocKey(K, K, 'b#1')` throws.
Expected: (a) every allocation yields a key no other allocation can yield: the suffix encodes, injectively, the full dot of the op that
will carry the key (namespace including the incarnation, plus that op's counter); (b) seed keys stay byte-identical (seed ops and
`seedVersion` must not change); (c) `moveItem` and `addItem` never call `allocKey` with `left >= right`: when neighbours already hold
equal keys (data written before the fix), allocate between the left key and the first strictly greater key to the right, or `null`;
(d) the `orderedMove` doc comment in `skeleton/src/core/merges.ts` states only what is true. Tests: unit tests for (a)–(c), and the repro
sequence as a test on BASECAMP's model and actions that ends with the move applied and both replicas converged.

## D3 Ingress validation gaps can crash the replica
`malformed()` in `skeleton/src/sync/replica.ts` checks only `id` and `stamp`. An op with `deps: null` (or non-integer deps, a non-string
`target` or `op`, an undefined payload) passes, and `causalBuffer`'s `ready` throws a `TypeError` on `Object.keys(op.deps)`
(`skeleton/src/core/causal.ts`). Stored ops loaded at startup skip validation entirely, so one bad stored entry stops the replica from
starting. Separately, `apps/basecamp/src/ops/expense.add.op.ts` stores `{ target: op.target, ...op.payload, op }`, so a payload field named
`target` overrides the envelope target.
Expected: `malformed` also rejects `deps` that is not a plain object of non-negative safe integers, a non-string `target` or `op`, and an
undefined payload; stored ops go through the same check, and a malformed stored op is skipped and recorded as a rejection
(`reason: 'malformed'`) instead of throwing; the expense.add entry spreads the payload first and sets `target: op.target` after it.
Valid ops behave exactly as before.

## D4 A buffered-only sync state shows no haze, and the exchange log settles while ops are held
`deriveSync` (`skeleton/src/sync/status.ts`) returns `DEVELOPING` (chip "Syncing…") when `buffered > 0` even if `unacked` and `behind` are 0,
but `Fog` (`skeleton/src/limbo/marks.tsx`) shows haze only when `unacked + behind > 0`, so the chip says Syncing while the replica shows no
haze. `createPair` (`skeleton/src/sync/pair.ts`, the `log.settle(...)` call) settles an exchange while ops are still held.
Expected: Fog shows haze in every `DEVELOPING` state; its label reads `Syncing N…` when N = unacked + behind > 0 and `Syncing…` otherwise
(the chip's wording); an exchange settles only when unacked, behind and buffered are 0 on both sides.

## D5 Rejected ops are invisible
`replica.rejected()` (malformed, unknown-op and store-failed rejections, the last 50) is never shown, so a failed local save or a dropped
incoming op leaves no trace on screen. Expected: the Inspector (`skeleton/src/limbo/inspector.tsx`) gets a "Rejected ops" table (op id,
reason) fed by `replica.rejected()`, with the empty text "No rejected ops.", updating when a rejection happens.

## Unchanged (add any others the code shows)
Every merge result on valid histories (golden histories G01–G21 and every property pass unchanged); seed ops and `seedVersion`; chip strings;
wisps = the unacked count; FIXED firing; full fog while the link is down; reduced-motion behaviour; accessible names that tests use; the
in-page judge flow (cut, edit both sides, reconnect, converge); no wall clock, randomness or locale in any path that creates or applies an op;
no `BroadcastChannel`; the skeleton gains no app-specific code.

Keep tasks small and numbered (a failing test first, then the fix), one defect per task where possible, each ending with
`pnpm typecheck && pnpm test && pnpm props` green. Kit-owned files (`kit/**`) are out of scope for this spec.
