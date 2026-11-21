# Bugfix: five defects from the architecture review (merge, sync and Limbo layers)

## Introduction

An architecture review of the merge, sync and Limbo layers found five defects. Each was reproduced locally. They are independent: D1 is app wiring, D2 is key allocation, D3 is ingress validation, D4 is two derived-state mismatches, D5 is a missing view. This spec fixes them without changing any merge result on valid histories.

Code references are symbols and files read on 2026-11-21. The request gave no line numbers, so none needed correcting. Two statements in older specs become stale after D1 (see Unchanged 12).

Wording: convergence stays "measured, property-tested". Offline claims stay provisional. Kit-owned files (`kit/**`) are out of scope.

---

## D1 Two tabs write into one pair's databases

### Current Behavior (Defect)

1.1 `skeleton/src/sync/identity.ts` `acquireIdentity` implements `skeleton-sync` R14 (session id in `sessionStorage`, a Web Lock on `limbo:<app>:pair-<session>`, databases `limbo:<app>:pair-<session>:a|b`, a duplicated tab mints a new session, `reset()` deletes only its own databases). `skeleton/src/index.ts` exports it. Neither app calls it.
1.2 WHEN `boot()` in `apps/basecamp/src/main.tsx` or `apps/aftershock/src/main.tsx` runs THEN `createPair` gets no `store` option, so `skeleton/src/sync/pair.ts` opens the fixed names `limbo:<app>:a` and `limbo:<app>:b`.
1.3 WHEN two tabs of one app are open THEN both write the same two databases. The `store.ts` `Meta` comment assumes "Single writer per database (R14)". Two tabs that boot together can read the same incarnation `k` and mint the same dots.
1.4 WHEN Reset demo runs THEN `boot()`'s `reset` deletes the fixed names, which can belong to another tab.

### Expected Behavior (Correct)

1.5 WHEN `boot()` runs THEN the system SHALL first call `acquireIdentity` in `mode: 'pair'` with `sessionStorage`, `navigator.locks` when present (otherwise `undefined`), an id generator supplied by the app, and `location.search`.
1.6 WHEN the identity is acquired THEN the system SHALL call `createPair` with a `store` opener that maps side `a` to `identity.names[0]` and side `b` to `identity.names[1]`.
1.7 WHEN a second tab boots with a session id that is already locked THEN the system SHALL open different database names (a new session id), never the held ones.
1.8 WHEN Reset demo runs THEN the system SHALL close the pair, call `identity.reset()` (which deletes only this session's two databases and clears its session key) and then reload.
1.9 The identity module SHALL remain the only skeleton module that draws random ids. The id generator is passed in by the app.
1.10 The existing tests that assert the fixed names SHALL assert the R14 names instead (for example `apps/basecamp/src/app.test.tsx` "Reset demo deletes both databases and calls reload", and the aftershock twin).

---

## D2 Equal position keys make a move between two items throw

### Current Behavior (Defect)

2.1 `allocKey` (`skeleton/src/core/causal.ts`) returns `generateKeyBetween(left, right)` plus a suffix built only from the part of the replica id before `#`. WHEN one replica, in any incarnation, allocates into the same (left, right) gap twice THEN both keys are identical: `allocKey(L, R, 'a#1') === allocKey(L, R, 'a#2')`.
2.2 Reachable in BASECAMP: replica A places X between L and R, deletes X (deleted items leave `order`: the filter at the end of `materialize` in `apps/basecamp/src/model.ts`), moves or adds Y into the same gap (Y gets X's key), and X comes back (Keep on its twin, or a restore). X and Y now hold equal keys.
2.3 WHEN `moveItem` (`apps/basecamp/src/actions.ts`) targets an index between X and Y THEN it calls `allocKey(K, K, …)`, `generateKeyBetween(K, K)` throws "K >= K", and the move is lost.
2.4 The `orderedMove` doc comment in `skeleton/src/core/merges.ts` says "Keys carry a replica suffix, so two moves into one gap give distinct keys". That holds across replicas, not for one replica.

### Expected Behavior (Correct)

2.5 Every allocation SHALL yield a key no other allocation can yield. The suffix SHALL encode, injectively, the full dot of the op that will carry the key (the namespace including the incarnation, plus that op's counter).
2.6 Seed keys SHALL stay byte-identical. Seed ops and `seedVersion` SHALL NOT change.
2.7 `moveItem` and `addItem` SHALL never call `allocKey` with `left >= right`. WHEN neighbours already hold equal keys (data written before the fix) THEN they SHALL allocate between the left key and the first strictly greater key to the right, or `null` when none exists.
2.8 The `orderedMove` doc comment SHALL state only what is true: keys from different dots are distinct; identical keys can exist in data written before the fix, and the id then breaks the tie.
2.9 The repro sequence SHALL be a test on BASECAMP's model and actions that ends with the move applied and both replicas converged.

---

## D3 Ingress validation gaps can crash the replica

### Current Behavior (Defect)

3.1 `malformed()` in `skeleton/src/sync/replica.ts` checks only `id` and `stamp`. WHEN an incoming op has `deps: null`, non-integer deps, a non-string `target` or `op`, or an undefined payload THEN it passes.
3.2 WHEN such an op is offered THEN `causalBuffer`'s `ready` (`skeleton/src/core/causal.ts`) throws a `TypeError` on `Object.keys(op.deps)`, inside `receive`.
3.3 Stored ops loaded in `createReplica` skip validation. WHEN one stored entry is bad THEN the loop calls `observe` and `buf.offer` on it and the replica does not start.
3.4 `apps/basecamp/src/ops/expense.add.op.ts` stores `{ target: op.target, ...op.payload, op }`. WHEN a payload has a field named `target` THEN it overrides the envelope target.

### Expected Behavior (Correct)

3.5 `malformed` SHALL also reject: `deps` that is not a plain object of non-negative safe integers, a non-string `target`, a non-string `op`, and an undefined payload.
3.6 Stored ops SHALL go through the same check. A malformed stored op SHALL be skipped (not observed, not offered, not marked saved) and recorded as a rejection with `reason: 'malformed'`. The replica SHALL start.
3.7 The `expense.add` entry SHALL spread the payload first and set `target: op.target` after it.
3.8 Valid ops SHALL behave exactly as before.

---

## D4 Buffered-only state shows no haze, and the exchange log settles while ops are held

### Current Behavior (Defect)

4.1 `deriveSync` (`skeleton/src/sync/status.ts`) returns `DEVELOPING` (chip "Syncing…") when `buffered > 0`, even with `unacked` and `behind` at 0.
4.2 `Fog` (`skeleton/src/limbo/marks.tsx`) shows haze only when `unacked + behind > 0`. WHEN a replica only holds buffered ops THEN the chip says "Syncing…" and the card shows no haze.
4.3 `createPair` (`skeleton/src/sync/pair.ts`, the `log.settle(...)` call in `tickAll`) settles an exchange when unacked and behind are 0 on both sides, ignoring `buffered`. WHEN an op is held THEN the exchange moves to "Recent exchanges" while the replica is still not live.

### Expected Behavior (Correct)

4.4 `Fog` SHALL show haze in every `DEVELOPING` state.
4.5 The haze label SHALL read `Syncing N…` when N = unacked + behind > 0, and `Syncing…` otherwise (the chip's wording).
4.6 An exchange SHALL settle only when unacked, behind and buffered are 0 on both sides.

---

## D5 Rejected ops are invisible

### Current Behavior (Defect)

5.1 `replica.rejected()` (malformed, unknown-op and store-failed rejections, the last 50) is never read by any view.
5.2 WHEN a local save fails or an incoming op is dropped THEN nothing on screen shows it.

### Expected Behavior (Correct)

5.3 The Inspector (`skeleton/src/limbo/inspector.tsx`) SHALL have a "Rejected ops" section with a table of op id and reason, fed by `replica.rejected()`, oldest first as the replica returns them.
5.4 WHEN there are no rejections THEN the section SHALL read "No rejected ops.".
5.5 WHEN a rejection happens while the Inspector is open THEN the table SHALL update without a reopen.

---

## Unchanged Behavior (Regression Prevention)

1. WHEN a valid history is merged THEN the system SHALL CONTINUE TO give the same result: golden histories G01 to G21 and every property in `pnpm props` pass unchanged, with no property weakened, skipped or run at a lower `numRuns`.
2. WHEN seed ops are built THEN the system SHALL CONTINUE TO produce byte-identical ops, keys and `seedVersion`. `apps/basecamp/src/seed.test.ts` and the aftershock seed tests pass unchanged.
3. WHEN the status chip renders THEN the system SHALL CONTINUE TO show the same strings ("Live", "Offline", "Offline — N waiting", "Syncing N…", "Syncing…", and the " · N conflict(s)" suffix). `deriveSync` output is unchanged.
4. WHEN ops are queued THEN the system SHALL CONTINUE TO show wisps equal to the `unacked` count.
5. WHEN a replica reaches LIVE and CLEAR after a FOGGED or CONFLICT state THEN the system SHALL CONTINUE TO fire FIXED once (`nextFixed` unchanged).
6. WHEN the link is down THEN the system SHALL CONTINUE TO show full fog with the label "Offline". Haze, `data-fog` values `full|haze|none` and the saturation filter on full fog SHALL CONTINUE TO behave as in `fog.test.tsx`.
7. WHEN reduced motion is on THEN the system SHALL CONTINUE TO add no Fog animation class and no wisp rows.
8. WHEN tests look up controls THEN the system SHALL CONTINUE TO find the same accessible names (for example the "Reset demo" button, the "Inspector" button, the "Queued ops", "Recent exchanges", "Conflicts" and "Replica" sections, and the "Exchange N" tables).
9. WHEN the in-page judge flow runs (cut, edit both sides, reconnect) THEN the system SHALL CONTINUE TO converge, queue and cross ops as before. The in-page link, the shuffle test and the scripted scenes SHALL CONTINUE TO work unchanged.
10. WHEN an op is created or applied THEN the system SHALL CONTINUE TO read no wall clock, randomness or locale (`Date.now`, `new Date`, `performance.now`, `Math.random`, `crypto.randomUUID`, `toLocale*`). The app's id generator for D1 is called only inside `acquireIdentity`, never on an op path.
11. WHEN the system syncs THEN it SHALL CONTINUE TO use no `BroadcastChannel` and no `SharedWorker`, and the skeleton SHALL CONTINUE TO contain no app-specific code.
12. WHEN the pair opens its stores THEN `createPair` SHALL CONTINUE TO default to `limbo:<app>:a|b` when no `store` option is given (this keeps `pair.test.ts`, `lake-scene.test.tsx` and the other direct `createPair` users unchanged). The database-name requirements ("The database names shall be `limbo:basecamp:a` and `limbo:basecamp:b`" in `.kiro/specs/basecamp/requirements.md`, and the aftershock twin in `.kiro/specs/aftershock/requirements.md`) and the Reset demo wording ("shall delete both databases") are superseded for the booted apps by D1. The implementing task edits that wording.
13. WHEN `reset=1` is in the query string THEN the system SHALL CONTINUE TO wipe this identity's databases before the stores open (existing `acquireIdentity` behaviour). WHEN no Web Locks exist (jsdom) THEN the app SHALL CONTINUE TO boot, with `identity.exclusive` false.
14. WHEN `allocKey` is called with a plain replica id string THEN it SHALL CONTINUE TO return the existing key, byte for byte (`causal.test.ts` "uses only the part before # and drops dashes", "gives distinct keys for two replicas in one gap" and "loops when right starts with the generated key" pass unchanged). Existing documents with old keys SHALL CONTINUE TO load and sort in the same order.
15. WHEN the replica rejects an op THEN it SHALL CONTINUE TO keep the last 50 (`replica.test.ts` "keeps the last 50" passes unchanged), and a valid op with `deps: {}` or a payload of `{}` SHALL CONTINUE TO be accepted.
16. WHEN the Inspector is open THEN it SHALL CONTINUE TO trap focus, close on Escape and return focus to its opener, and `useLimbo` SHALL CONTINUE TO return a referentially stable snapshot between changes.
17. WHEN the change is made THEN the skeleton SHALL CONTINUE TO stay within the budget in `tech.md` (30 files, 2,400 lines, 15 exports; last recorded 21 files, 2,149 lines) and `skeleton/src/index.ts` SHALL CONTINUE TO export the same names (`index.test.ts` unchanged).
