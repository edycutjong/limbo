# Tasks: bugfix-arch-review

Each task writes its failing tests first, runs them and records the failure, then applies the fix, and ends with `pnpm typecheck && pnpm test && pnpm props` green. Within a task, the red step is expected only for the new tests. Tests and properties are never weakened, skipped, or run with a lower `numRuns`. Do not run git. Do not edit `kit/**`. Do not change `skeleton/src/index.ts` exports.

Order: D3, D2, D4, D5, D1 (the largest, last), then the cross-cutting pass.

- [x] 1. D3: ingress validation
  - Failing tests first, in `skeleton/src/sync/replica.test.ts`: `receive` rejects `deps: null`, `deps: { x: 1.5 }`, `deps: { x: -1 }`, `deps: []`, a non-string `target`, a non-string `op`, and an undefined payload, each as `[{ id, reason: 'malformed' }]` with no throw, nothing applied or persisted. Startup test: a store whose `all()` holds one valid and one `deps: null` op; the replica starts, applies the valid op, `rejected()` lists the bad id, `saved(badId)` is false. In the basecamp expense ops test file: a payload field `target: 'evil'` leaves `adds[op.id].target === op.target`. Run them and record the failures (today: `TypeError`, accepted ops, override).
  - Fix: `skeleton/src/sync/replica.ts` `malformed` (plain-object deps of non-negative safe integers, string `target` and `op`, defined payload) and validate stored ops before `observe` and `offer`, recording `reason: 'malformed'`. `apps/basecamp/src/ops/expense.add.op.ts`: `{ ...op.payload, target: op.target, op }`.
  - Add the positive table test (valid ops, `deps: {}`, payload `{}` and `null`, a seed op are accepted as before).
  - Confirm unchanged: all of `replica.test.ts` (including "keeps the last 50"), `link.test.ts`, `pair.test.ts`, `store.test.ts`, expense model tests, goldens.
  - Run `pnpm typecheck && pnpm test && pnpm props`.
  - _Requirements: D3 3.1 to 3.8; Unchanged 1, 10, 15, 17_

- [x] 2. D2 (part 1): unique keys in `allocKey`
  - Failing tests first, in `skeleton/src/core/causal.test.ts`: a dot form `allocKey(L, R, { r, n })` gives distinct keys for different `n`, different incarnations (`a#1` vs `a#2`), and dashed ids (`a-b#1` vs `ab#1`); `decode(key)` (a helper in the test) returns the dot; every key lies strictly between `left` and `right`; length is at most `len(k) + 3 * len(dotString) + 4`; a dot key never equals the real seed key. A fast-check property over random gaps and dots checks pairwise distinctness. Keep the legacy-form lines: `allocKey(L, R, 'a#1') === allocKey(L, R, 'a#2')` and `allocKey(K, K, 'b#1')` throws. Run and record the failure (the dot form does not exist yet).
  - Fix: `skeleton/src/core/causal.ts` `allocKey(left, right, by: ReplicaId | Dot)`; a string keeps the exact current output. Update the `orderedMove` doc comment in `skeleton/src/core/merges.ts` (comment only).
  - Confirm unchanged: existing `allocKey` tests, `seed.test.ts` (assert one literal seed key plus `seedVersion`), goldens G01 to G21, `pnpm props`.
  - Run `pnpm typecheck && pnpm test && pnpm props`.
  - _Requirements: D2 2.5, 2.6, 2.8; Unchanged 1, 2, 14, 17_

- [x] 3. D2 (part 2): BASECAMP callers and the repro
  - Failing tests first, in `apps/basecamp/src/actions.test.ts`: (i) the repro (A places X in the L/R gap, deletes X, places Y in the same gap, restores X, then `moveItem` between them): assert X and Y hold different `pos`, the move op is applied, and after exchanging ops both replicas have equal `canonical(state())`; (ii) hand-built pre-fix state with two items holding the same key `K`: `moveItem` between them does not throw and the new key is `> K`; (iii) the key of every op made by `addItem` and `moveItem` decodes to that op's `id`; (iv) `addItem` calls `allocKey` with `right === null`. Run and record the failures (today the move throws "K >= K").
  - Fix: `apps/basecamp/src/actions.ts`: a `nextDot(r)` helper used by `addItem` and `moveItem`; the `gap` helper that skips keys equal to the left key.
  - Add to `model.test.ts`: ordering with equal keys is still (key, id).
  - Confirm unchanged: `lake-scene.test.tsx` order assertions, `scene.test.ts`, the shuffle golden.
  - Run `pnpm typecheck && pnpm test && pnpm props`.
  - _Requirements: D2 2.1 to 2.4, 2.7, 2.9; Unchanged 1, 2, 9, 14_

- [x] 4. D4: haze and settle follow the derived state
  - Failing tests first: in `skeleton/src/limbo/fog.test.tsx`, a replica holding only a buffered op (the `chip.test.tsx` pattern) has `buffered === 1`, `unacked + behind === 0`, `data-fog="haze"` and label `Syncing…`. In `skeleton/src/sync/pair.test.ts`, an exchange stays open while a side holds a buffered op and settles into `last` once the missing op arrives. Run and record the failures (today: `none`, and an early settle).
  - Fix: `skeleton/src/limbo/marks.tsx` (mode follows the axis; label `Syncing N…` or `Syncing…`) and the `log.settle(...)` argument in `skeleton/src/sync/pair.ts` (add both `buffered` counts).
  - Confirm unchanged: `fog.test.tsx` "haze reads Syncing n…", `chip.test.tsx` (five strings and icons), `status.test.ts`, wisps tests, reduced-motion Fog tests, `pair-view.test.tsx`.
  - Run `pnpm typecheck && pnpm test && pnpm props`.
  - _Requirements: D4 4.1 to 4.6; Unchanged 3 to 8, 16_

- [ ] 5. D5: "Rejected ops" in the Inspector
  - Failing tests first, in `skeleton/src/limbo/inspector.test.tsx`: with the drawer open, "No rejected ops." shows; after `pair.a.receive([...])` with a malformed op and an unknown-op op, rows with the ids and `malformed` / `unknown-op` appear without reopening; a store stub whose `put` rejects shows `store-failed` after `replica.local(...)`. Run and record the failure (no such section).
  - Fix: `skeleton/src/limbo/inspector.tsx` adds the section and table (`aria-label="Rejected ops"`) fed by `replica.rejected()`.
  - Add: rows follow `replica.rejected()` order and stop at 50; the focus trap and Escape still work.
  - Confirm unchanged: every existing `inspector.test.tsx` case and section name, `shell.test.tsx`.
  - Run `pnpm typecheck && pnpm test && pnpm props`.
  - _Requirements: D5 5.1 to 5.5; Unchanged 8, 16_

- [ ] 6. D1 (part 1): shared identity helper
  - Failing tests first: `apps/pair-identity.test.ts` expects `acquirePairIdentity(app, opts)` to default to `sessionStorage`, to pass `navigator.locks` only when defined, to pass `location.search` (so `?reset=1` wipes before open), and to call the id generator only inside `acquireIdentity`. Run and record the failure (the file does not exist).
  - Add `apps/pair-identity.ts` exporting `IdentityOptions` and `acquirePairIdentity`; the default id generator uses `crypto.getRandomValues` (hex). It is the only place in the apps that draws a random value.
  - Confirm `skeleton/src/sync/identity.test.ts` and `skeleton/src/index.test.ts` pass unchanged.
  - Run `pnpm typecheck && pnpm test && pnpm props`.
  - _Requirements: D1 1.5, 1.9; Unchanged 10, 13_

- [ ] 7. D1 (part 2): wire both apps and update the tests that assert fixed names
  - Failing tests first, in `apps/basecamp/src/app.test.tsx` and `apps/aftershock/src/app.test.tsx`, through `boot(el, { identity })` with in-memory storage and locks and ids `s1`, `s2`: the pair opens `limbo:<app>:pair-s1:a|b` and not the fixed names; a second boot with the same session id and the same locks opens `pair-s2:a|b`; Reset demo deletes only `pair-s1:a|b` (a bystander `pair-other:a` and the second tab's databases remain), clears the session key and calls `reload` once; booting again with the same storage after a plain reload opens the same names and keeps the list and queued ops. Update the existing "Reset demo deletes both databases and calls reload" tests and the `afterEach` cleanups to the R14 names; add a `beforeEach` that clears `sessionStorage` where storage is not injected. Run and record the failures.
  - Fix: `boot()` in both `main.tsx` files acquires the identity first, passes the `store` opener (side `:a` to `names[0]`, `:b` to `names[1]`), and `reset` runs `identity.reset(() => pair?.close())` then reload. `BootOptions` gains `identity?: IdentityOptions`. The aftershock `seedOps` option stays.
  - Update the database-name wording in `.kiro/specs/basecamp/requirements.md` (R14.7 and the Reset demo item) and `.kiro/specs/aftershock/requirements.md` (the database-name item and the Reset demo item) to the R14 names.
  - Confirm unchanged: `survey-scene.test.tsx` and `lake-scene.test.tsx` "Reset demo clears the flag", `pair.test.ts` and other direct `createPair` users (default names), `app-shell.test.tsx`, `devrelay.test.tsx`, `build.test.ts` (no `devrelay` string in a production build).
  - Run `pnpm typecheck && pnpm test && pnpm props`.
  - _Requirements: D1 1.1 to 1.10; Unchanged 8, 9, 12, 13_

- [ ] 8. Cross-cutting pass and records
  - Run `pnpm typecheck && pnpm test && pnpm props && pnpm e2e`. If `pnpm e2e` exceeds the session time, report it as not run, never as passed.
  - Grep the apps and skeleton for `Date.now|new Date|performance.now|Math.random|randomUUID|toLocale|BroadcastChannel|SharedWorker`: the only new hit is `apps/pair-identity.ts` (`crypto.getRandomValues`), and none is in an op file, `replica.ts`, `causal.ts` or `merges.ts`. Grep the skeleton for app names outside tests: no new hit.
  - Re-measure the skeleton budget with the command in `evidence/budget-basecamp-baseline.md`; confirm at most 30 files, 2,400 lines and 15 exports, and that `skeleton/src/index.test.ts` passes unchanged. If a limit is passed, stop and report.
  - Fill `## Skeleton changes` in `design.md`: each skeleton file touched, its line delta, and the measured totals. Record the measured test counts. Write them to `evidence/bugfix-arch-review/final.md` only if the owner lets this session write under `evidence/` (the kitsmith cannot); otherwise put them in `design.md` and report.
  - Confirm every golden history G01 to G21 and every property still pass, with no property file edited.
  - _Requirements: Unchanged 1 to 17_
