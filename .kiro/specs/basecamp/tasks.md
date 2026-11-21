# Tasks: basecamp

Each task ends with `pnpm typecheck && pnpm test && pnpm props` green. The e2e tasks (20, 21) also end with `pnpm e2e` green. Tests, properties, hooks and the vacuity guard are never weakened, skipped, or run with a lower `numRuns`. IF a property fails, THEN fix the op. Do not run git. Op files are created as `*.op.ts` so the hooks scaffold `*.props.test.ts` and `registry.gen.ts`; never hand-edit `registry.gen.ts`. After a task that touches `skeleton/`, record the measured non-test line and file count (R1.3). Wording: "measured, property-tested".

- [x] 1. Tooling and app shell
  - `tsconfig.json` `include`: add `apps/*/src/**/*.tsx` and `apps/*/*.ts`. `vitest.config.ts` `limbo` project `include`: add `apps/*/src/**/*.test.tsx` (nothing else changes). `apps/basecamp/package.json`: dependencies `react`, `react-dom` (19), scripts `dev`, `build`, `preview` (`vite`, `vite build`, `vite preview`), dev dependency `vite`. Add `apps/basecamp/index.html`, `vite.config.ts` (static `dist/`, port 5174), a minimal `src/main.tsx` that renders the tagline, and `app.css`.
  - Record the skeleton baseline (file count and non-blank, non-comment lines, excluding tests and `limbo/test/`) in `evidence/budget-basecamp-baseline.md`, with the command used.
  - Tests: `app-shell.test.tsx` renders `main`'s root component and finds the `h1` and the line "For people whose shared list breaks when the signal does."; `pnpm --filter @limbo/basecamp build` produces `dist/index.html`.
  - _Requirements: R1.2, R1.3, R13.2, R13.3, R17.5_

- [x] 2. Money and members helpers
  - `apps/basecamp/src/money.ts` (`parseCents`, `formatCents`) and `members.ts` (replica id to member, display names `Sari`/`Budi`/`Citra`/`Dewi`, `authorOf(op)` = `stamp.r.split('#')[0]`).
  - Tests: parse `26`, `26.5`, `26.50`, `$26.00` → 2600, 2650, 2650, 2600; reject `26.555`, `-1`, `abc`, empty; `formatCents` 0, 5, 834, 2600, 100000; round trip over fast-check integers; no `toLocale`, `Intl` or `/` on money (source scan).
  - _Requirements: R7.4, R7.6_

- [x] 3. `sumSplit` reducer (skeleton)
  - `skeleton/src/core/merges.ts`: add `sumSplit` as in design §5. No change to `skeleton/src/index.ts`. Record the new measured skeleton total and report it (R1.3).
  - Tests (`merges.test.ts`): 2500 over `sari, budi, dewi`; k = 0 gives `{}`; k = 1; amount 0; amount < k; duplicate members; input order independence; throws on a float, a negative and `NaN`; fast-check: integers ≥ 0, sum = amount, max − min ≤ 1.
  - _Requirements: R5_

- [x] 4. `expense.add` and `expense.setAmount`
  - Create `ops/expense.add.op.ts`, `ops/expense.setAmount.op.ts` and `ops/expense.state.ts` (shared membership and amount helpers, `present(addsOf, removes)`). Write each op's intent sentence at the top of the file first. Write `*.props.ts` with `conflictGen` payload generators and the kit `splitIntent`; `setAmount` also asserts causal dominance. Let the hooks scaffold `*.props.test.ts` and `registry.gen.ts`.
  - Tests: `expense.state.test.ts` for `present` (add observed by a remove is gone; concurrent add and remove survives; duplicate adds; remove before add); the two scaffolded props suites pass, and the vacuity guard sees concurrent amount edits.
  - _Requirements: R6.1, R6.2, R6.7, R6.8, R6.9, R16.1, R16.4_

- [x] 5. `expense.addMember` and `expense.removeMember`
  - Add the two ops and their `*.props.ts` (`splitIntent` and `addRemoveIntent` in `checks`). Add `"expense.removeMember": { "kind": "split" }` to `kit/props/intents.json` (the only edit to that file). Confirm the manifest test still passes.
  - Tests: scaffolded props pass; a concurrent add and remove of the same member keeps the member; a remove that observed the add removes it; the vacuity guard finds concurrent add and remove.
  - _Requirements: R6.3 to R6.6, R6.8, R16.4_

- [x] 6. Model: expenses, claims with units, lifeInfo, values; un-pend G20 and G21
  - Extend `model.ts` per design §3 (`expenses`, `claims`, `lifeInfo`, `values`; existing fields unchanged). `State` gains `expenses`.
  - Remove `pending` from `kit/props/golden/G20.json` and `G21.json` and nothing else; update the expectation in `kit/props/golden.test.ts` so it no longer lists them as pending.
  - Tests (`model.test.ts`): G20 and G21 shares and `unallocated`; seed-like expense with a concurrent add of Dewi and a set to 2600 gives four members, 650 each, sum 2600 in every order of a fixed shuffle; an expense with no `expense.add` is absent; `gas` with units 2 and two claims gives two winners and no loser; units 1 with two claims gives a loser; `lifeInfo` names the active deleter and the resurrecting editor; `values` lists both names on a concurrent rename; the spike's item results are unchanged (existing tests pass). `pnpm props` shows G20 and G21 as passing; `split-float` and `split-first-member` still fail a property or golden.
  - _Requirements: R3.9, R5, R7.1, R7.2, R7.7, R8_

- [x] 7. Conflict descriptors
  - `apps/basecamp/src/conflicts.ts` per design §6.
  - Tests (`conflicts.test.ts`): each row of the table; `twinCount === describeConflicts.length`; move twins are ignored; ids are stable and equal on two replicas built from the same ops in different orders.
  - _Requirements: R9_

- [x] 8. Seed
  - `apps/basecamp/src/seed.ts` per R2 with `makeSeedOps` and the item and expense scripts. Items use `allocKey` with replica `seed` for keys, in list order.
  - Tests (`seed.test.ts`): materialized values of R2.5; byte-identical on two builds; sha256 of the canonical JSON equals a recorded constant (print it); ops are all authored by `seed` with counters 1..n.
  - _Requirements: R2_

- [x] 9. Actions
  - `apps/basecamp/src/actions.ts`: every row of the design §6 table, add item (target = own op id, key between neighbours), rename, tick (explicit value), delete, restore, claim, release, move, add expense member, remove member, set amount.
  - Tests (`actions.test.ts`, over two real `createReplica` instances with manual delivery): each resolve action clears its twin on both replicas after delivery; add item gives distinct ids on two replicas; tick never toggles (two ticks of `true` stay `true`); move allocates a key between neighbours; delete then restore.
  - _Requirements: R3.1 to R3.8, R4.3, R4.4, R7.5_

- [x] 10. Lake scene script and goldens
  - `apps/basecamp/src/scene.ts`: `lakeScript` (A tick tent, B delete tent, A claim stove, B claim stove), the two goldens (hand-written canonical states), the assumption comment about fresh databases.
  - Tests (`scene.test.ts`, over a real `createPair` with a manual scheduler): after the four edits and a restore, the stove claims both have `l = 17` and different `r`, the winner is `sari`, the op ids are `a#1:1`, `a#1:2`, `b#1:1`, `b#1:2`, the resolves are `a#1:3` and `b#1:3`; the golden `state` strings equal the canonical `materialize` of their ops in several shuffled orders; the stated expectations (tent alive and ticked, stove won by `sari`, zero twins) are asserted field by field.
  - _Requirements: R10.3, R10.6, R12.2, R12.4, R12.5_

- [ ] 11. App assembly and `ReplicaBody`
  - `app.config.ts`, `main.tsx`: `createPair` with the seed, `LimboShell`, `ReplicaPair` (`names`, `plate` 1 and 2, `onReset` using `deleteStore` then reload), `ReplicaBody` skeleton, `window.limbo` behind the dev/test guard, `?replicas` handled by the layer.
  - Tests (`app.test.tsx`, jsdom, fake-indexeddb): both cards render the seeded list in the seed order; both chips read "Live"; the single layout shows below 640 px; `window.limbo` exists in test and the production check is in task 19; Reset demo deletes both databases and calls reload (injected).
  - _Requirements: R1.1, R13.1, R13.4, R13.5, R13.7, R9.1_

- [ ] 12. `ItemRow`, `ClaimChip`, add field, empty state, keys
  - `views/ItemRow.tsx`, `ClaimChip.tsx`, `AddItem.tsx`, and the empty state. Space ticks (explicit value), Delete deletes, both inactive in text inputs. Overflow menu with Rename and Delete.
  - Tests: tick sets `true` then `false`; units 2 shows "1 of 2 claimed" and a claim button for another member; "I'll bring it" → "Yours? waiting" while queued → "{Name} is bringing it" with "Stop bringing it" after sync; release lets the next claimant see "Now you're bringing it"; empty list shows "Nothing packed yet. Add the first thing."; every control is 44 px or larger; names render as text.
  - _Requirements: R3.5 to R3.7, R4.1, R4.2, R4.9 to R4.11, R17.2_

- [ ] 13. Twin variants
  - `views/ItemTwins.tsx`: life, claim loser (both sides), value variants, via the layer's `Twin` and the rule lines of design §7.
  - Tests (two real replicas over `createPair`, manual `settle()`): tent twin caption equals "TWIN · Budi deleted this while Sari ticked it · rule: resurrect" with Keep and Delete; Keep and Delete each clear it on both; stove loser caption on B, quiet note on A, OK clears both; Why Sari? opens the Inspector and prints both stamps; concurrent renames show one button per name and the pick clears the twin; tick values twin; resolved twins leave no ghost.
  - _Requirements: R3.2, R3.3, R4.3 to R4.7_

- [ ] 14. Reorder
  - Drag handle and keyboard on the handle; `actions.move`. ArrowUp and ArrowDown on the handle move one place and do not move focus to another row.
  - Tests: keyboard move up and down changes `order` and emits one `item.move`; first and last rows do not move past the ends; pointer drag over jsdom rect stubs calls `move` with the right index; two concurrent moves converge on both replicas and show no twin.
  - _Requirements: R3.8, R4.8, R9.3, R17.2_

- [ ] 15. `ExpenseRow`
  - `views/ExpenseRow.tsx`: amount, payer, members, shares, `sum-split` rule line, amount field, add and remove member, amount value twin.
  - Tests: seed shows `$12.00` ×4 and `$8.34` / `$8.33` / `$8.33`; offline A adds Dewi while B sets `$26.00`, after `settle()` both show four members, `$6.50` each and the shares sum to `$26.00`; concurrent amounts show a twin with two buttons and the pick resolves it; invalid input shows an inline message and creates no op; shares use tabular numerals.
  - _Requirements: R7.3 to R7.7, R17.4_

- [ ] 16. Inspector and ShuffleTest wiring
  - Render `Inspector` per card (controlled `open`, also set by Why Sari?). Check that `I` toggles a controlled drawer. If it does not, bind `I` in `ReplicaBody` with the layer's exclusions. Mount `ShuffleTest` with the on-screen ops, N = 1,000, a worker-backed runner (`shuffle.worker.ts`) and the matching golden or none.
  - Tests: Inspector queued rows equal `view.unacked`; the shuffle test with an injected inline runner prints "1,000 / 1,000 orderings → same state" and, for the seed, "matches the specified result ✓"; after an extra edit no golden line prints; the worker file imports `runShuffle` and `materialize` and nothing else app-specific.
  - _Requirements: R10.8, R10.9, R12.1 to R12.3_

- [ ] 17. ScenePanel and the lake scene in jsdom
  - `views/ScenePanel.tsx`: button shown while the link is down and the scene is unset; four scripted edits with an injectable delay (0 in tests); "scripted edit" tags; clears on link up; Reset clears the flag.
  - Test (`lake-scene.test.tsx`, real `createPair`, manual `settle()`): R10.1 to R10.9 asserted on the DOM text, in order: fog and "Offline", `1 WAITING` and tent gone on B, `2 WAITING` and "Yours? waiting" on both, haze "Syncing 2…" before `settle()`, both lists equal after, tent twin and stove lines of R10.5 and R10.6, Keep and OK, deep-equal canonical states, zero twins, FIXED, Inspector order (2 resolves, then 4 partition ops, with merge, `l·r·n` and deps), Conflicts list of two resolved twins, shuffle test line and golden line. Manual edits (no button) give the same result.
  - _Requirements: R10, R11_

- [ ] 18. `DevRelayLink` (skeleton, dev/test only)
  - `skeleton/src/sync/dev-relay-link.ts` per design §9; `skeleton/package.json` subpath `./dev-relay-link`. Record the new measured skeleton total and report it (R1.3).
  - Tests (`dev-relay-link.test.ts` with a fake `fetch` over an in-memory relay): ops cross only while up; a failed POST leaves `unacked` unchanged and the retry works after the next `up`; duplicates change nothing; the session reads `down` while fetch rejects and `up` after; the link skips ops authored by its own replica; source scan: no `BroadcastChannel`, `SharedWorker`, `Date.now`, `Math.random`, React or DOM import.
  - _Requirements: R14.1 to R14.5, R14.8, R1.3_

- [ ] 19. Solo page and production build check
  - `apps/basecamp/src/devrelay.ts` and the guarded dynamic import in `main.tsx` (R14.6, R14.7).
  - Tests: unit test spawns `vite build` and asserts the built `dist/` text contains none of `devrelay`, `DevRelayLink`, `window.limbo`, `localhost:5175`, `https://fonts`; a jsdom test mounts the solo page with a fake fetch and finds the list, the status line and `window.limbo`.
  - _Requirements: R13.6, R13.8, R14.6, R14.7, R1.5_

- [ ] 20. E2E (a): the lake scene in one page
  - `playwright.config.ts`: two projects (`spike`, `basecamp`) and a `webServer` entry for the BASECAMP dev server on 5174, beside the spike's and the relay's. `e2e/basecamp-offline.spec.ts` test (a): each R10 line, read from the page; **Play the lake scene** for the partition edits; each "scripted edit" label; canonical states from `window.limbo.state('a'|'b')` deep-equal at the end. Fresh browser context so databases are empty.
  - Run `pnpm e2e`: the spike test and this test both pass. Save the run output under `evidence/e2e/`.
  - _Requirements: R10, R11, R15.1, R15.2, R15.5, R15.6_

- [ ] 21. E2E (b): two contexts through the dev relay
  - Test (b) in the same spec: `POST /reset`, two contexts, `?devrelay=http://localhost:5175&r=a|b`, `setOffline(true)` on both, tick, delete, both claim, assert no edit crosses over several poll periods, `setOffline(false)`, wait on state equality, then canonical states deep-equal, tent twin on both, exactly one stove claimant.
  - Run `pnpm e2e`; save the output under `evidence/e2e/`. Run the (a) and (b) tests ten times and record the pass count in `evidence/e2e/` (a flaky test is a failing test; fix the wait, not the assertion).
  - _Requirements: R14, R15.3 to R15.6_

- [ ] 22. Final verification
  - Run `pnpm typecheck && pnpm test && pnpm props && pnpm e2e`, then `pnpm props:full` (10,000 orderings). Save the full-tier output under `evidence/convergence/`. Record the final skeleton file count and line count next to the baseline (R1.3).
  - Check the README of `apps/basecamp/` for wording ("measured, property-tested") and that every number on a page comes from `evidence/`.
  - _Requirements: R1.3, R16, R12, R13.6_
