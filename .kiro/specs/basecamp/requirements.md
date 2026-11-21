# Requirements: basecamp

BASECAMP is app 1 on the LIMBO skeleton: a group trip packing list that keeps working with the signal gone and merges back without silently losing an edit. First line of the page: "For people whose shared list breaks when the signal does." It is a static Vite + React SPA in `apps/basecamp/`. It uses `@limbo/skeleton` and `@limbo/skeleton/limbo` as they are, apart from the two additions in R1.2. Everything list-specific lives in the app. The op contract in `.kiro/steering/local-first.md` is binding. Wording everywhere (UI, comments, README): convergence is "measured, property-tested", never "proven" or "guaranteed". Offline claims are provisional. Every number shown in a page or comment comes from `evidence/`.

Specs this one builds on: `merge-kit` (merges, kit, goldens), `skeleton-sync` (replica, pair, link), `limbo-layer` (Fog, Wisps, Twin, Inspector, ReplicaPair, ShuffleTest). Existing app code: `apps/basecamp/src/model.ts` and the eight `item.*` ops.

## Glossary

- **Pair view**: `ReplicaPair` with replica `a` (Sari) and replica `b` (Budi), joined by the in-page link. Fixed ids so runs are reproducible.
- **Member id**: lowercase person id used as `who` and in expense `payer` and `members`: `sari`, `budi`, `citra`, `dewi`. Replica `a` acts as `sari`, replica `b` as `budi`.
- **Seed**: the deterministic op script authored by replica `seed` (`makeSeedOps`), the same bytes on every replica.
- **Lake scene**: the scripted partition scenario of R10: two edits per replica while the link is cut, then restore and two resolves.
- **Scripted edit**: an op the **Play the lake scene** button performs, labelled as such on screen.
- **Twin descriptor**: the app's record `{ id, target, rule, caption }` for one conflict the user should see (limbo-layer R2.6). `twinCount(state)` equals the number of descriptors.
- **Share**: one member's part of an expense in integer cents, derived by `sumSplit`.

## R1 Scope, reuse and budget

1. The app shall build its UI from the `@limbo/skeleton/limbo` components (`LimboShell`, `ReplicaPair`, `Fog`, `Wisps`, `StatusChip`, `FixedStamp`, `Twin`, `Inspector`, `ShuffleTest`) and shall not copy or fork them.
2. The only changes to `skeleton/` shall be: the `sumSplit` reducer in `skeleton/src/core/merges.ts` (R5), and `skeleton/src/sync/dev-relay-link.ts` with its test (R14). No other skeleton file shall change, except a package subpath export for the dev relay link if the app needs it.
3. IF a skeleton edit would take the measured skeleton past its provisional budget (30 files, 1,800 TS/TSX lines excluding tests, CSS and tokens, 15 exports from `skeleton/src/index.ts`), THEN the task shall report the measured total and the added lines, and shall not raise the budget or trim another file to hide the change. The `skeleton/src/index.ts` export list shall not change.
4. The app shall import nothing from `yjs` or `y-indexeddb`, and shall not use `BroadcastChannel` or `SharedWorker`.
5. The app shall run no server-side polling and shall make no network request in a production build.

## R2 Seed

1. `apps/basecamp/src/seed.ts` shall export the seed script and `seedOps`, built with `makeSeedOps` so replica `seed` authors every op with fixed counters. The script shall hold no clock, randomness or locale call.
2. The list shall be named "Lake camp · Sat–Sun". Items, in this order, with ids and units:

   | id | name | units |
   |---|---|---|
   | `tent` | Tent (2-person) | 1 |
   | `stove` | Stove (the last one) | 1 |
   | `gas` | Gas canister ×2 | 2 |
   | `filter` | Water filter | 1 |
   | `headlamps` | Headlamps ×4 | 4 |
   | `firstaid` | First-aid kit | 1 |
   | `mats` | Sleeping mats ×4 | 4 |
   | `rope` | Rope (10 m) | 1 |
   | `cooler` | Cooler | 1 |
   | `coffee` | Coffee + filters | 1 |

3. The seed shall also hold: a claim by `citra` on `gas`, a claim by `dewi` on `filter`, and a tick (`ticked: true`) on `coffee`.
4. The seed shall hold two expenses: `campsite` ("Campsite fee", 4800 cents, payer `sari`, members `sari`, `budi`, `citra`, `dewi`) and `gas-snacks` ("Gas + snacks", 2500 cents, payer `budi`, members `sari`, `budi`, `citra`).
5. WHEN materialized, the seed shall give: `campsite` shares of 1200 cents for each of four members; `gas-snacks` shares `budi` 834, `citra` 833, `sari` 833; `coffee` ticked; `gas` with winners `citra` (1 of 2 claimed); `filter` won by `dewi`; zero twins.
6. A unit test shall print the sha256 of the seed's canonical JSON and shall assert it equals a recorded constant, so a change to the seed is a visible edit of that constant.
7. A unit test shall assert that building the seed twice gives byte-identical ops, and that the seed ops contain no counter above the number of seed ops.

## R3 Item ops (existing merges stay)

The eight `item.*` ops keep their names, merges and intents. They may change only where this section says so.

1. WHEN a user adds an item, the app shall create `item.add` (`commutes`, intent `create`) with a unique target, a fixed `units` (an integer ≥ 1), and a fractional key allocated at op creation after the last visible item. The target shall be the add op's own id, so two replicas cannot choose the same id.
2. WHEN a user renames an item, the app shall create `item.rename` with an explicit name (`causal-lww`, intent `set`). WHEN two renames are concurrent with different names, the item shall show a value twin with one button per name. A button tap shall write an `item.rename` that observes both, carrying the picked name.
3. WHEN a user ticks or unticks an item, the app shall create `item.tick` with an explicit `ticked` value (`causal-lww`). The app shall never toggle. Concurrent ticks with equal values shall not be a conflict. Concurrent different values shall be a value twin with the buttons "Ticked" and "Not ticked".
4. WHEN a user deletes an item, the app shall create `item.delete` (`resurrect`). WHEN a user restores it, the app shall create `item.restore`. A concurrent edit and delete shall be a resurrect twin (R4.3).
5. WHEN a user taps "I'll bring it", the app shall create `item.claim` with `who` = the replica's member id (`claim-one`, intent `claim`). The winners are the first `min(units, eligible)` eligible claims by ascending stamp. WHEN the winner taps "Stop bringing it", the app shall create `item.release` with the same `who`. A release shall cancel only claims it observed.
6. WHEN the winner releases and another eligible claimant exists, that claimant shall see "Now you're bringing it". The note shall derive from the viewer moving from losers to winners, and shall be presentation state only.
7. WHERE `units > 1`, the claim chip shall show "k of units claimed", with k from the winners count in the model.
8. WHEN a user reorders an item, the app shall create `item.move` with a fractional key allocated at op creation between the new neighbours (`ordered-move`). Drag handle and keyboard shall both work (R4.8).
9. `item.claims.ts` keeps its single-unit constant for the op-level state and invariant. The model, not the op state, applies `units` (design §3). No op property shall be weakened to allow this.
10. No item op file shall read `Date.now`, `new Date`, `performance.now`, `Math.random`, `crypto.randomUUID` or `toLocale*`.

## R4 Item views

1. `ItemRow` shall render, left to right: drag handle, tick box, name, `ClaimChip`, and an overflow menu with Rename and Delete. Every control shall be at least 44 px by 44 px. Each row shall carry `data-limbo-row`.
2. `ClaimChip` shall show, by case:
   - no claimant: a button "I'll bring it";
   - a winner exists and `units` is 1: "{Name} is bringing it" (member display name), also for the viewer's own claim; WHERE the viewer is the winner, a "Stop bringing it" button as well;
   - the viewer's own claim is queued (not yet acknowledged by the peer): "Yours? waiting" (provisional), in place of the line above;
   - the viewer's claim is applied and eligible but lost: the loser twin of R4.4;
   - `units > 1`: "k of units claimed" in addition.
   "Queued" shall come from `pair.queued(id)` containing the viewer's `item.claim` for that item. The chip shall not use a timer.
3. WHEN an item is a resurrect twin, the app shall render it through `Twin` as the at-rest row (the ticked or edited row) plus a ghost, with the caption "TWIN · {deleter} deleted this while {editor} {verb} it · rule: resurrect" (verb: ticked, renamed, claimed, restored), and the buttons **Keep** and **Delete**. **Keep** shall create `item.restore`. **Delete** shall create `item.delete`. Each shall observe every op the replica holds on that target, so it resolves the twin on every replica.
4. WHEN a claim has a loser, on the loser's replica the app shall render a `Twin` whose ghost reads "Your claim — {winner} is bringing it", with the rule line "claim-one: offline nobody can know who was first, so every phone applies the same order (lower Lamport stamp, then replica id)", and the buttons **OK** and **Why {winner}?**. **OK** shall create `item.release` with the loser's `who`. **Why {winner}?** shall open the Inspector (R10.8) and show the winning and losing claim stamps as `l·r·n` in the twin.
5. WHEN a claim has a loser, on the winner's replica the app shall show a quiet note "{loser}'s claim lost · rule: claim-one" and no buttons. The descriptor shall still count as a twin until the loser releases.
6. WHEN a claim twin has resolved, no ghost, note or button shall remain on either replica.
7. Value twins (rename, tick) shall use `Twin` with the caption "TWIN · {A} set this to “{v1}” while {B} set it to “{v2}”", the rule line naming `causal-lww`, and one button per value.
8. Reorder: the drag handle shall support pointer drag. WHEN the handle has focus, ArrowUp and ArrowDown shall move the item one place and shall not move focus to another row. The handle shall have an accessible name "Move {name}". Alt+Arrow shall not be taken by the app.
9. `Space` on a focused row shall tick or untick (an explicit value). `Delete` on a focused row shall delete it. Both shall be inactive while focus is in a text input.
10. The add-item field shall create an item on Enter or the Add button. WHEN the list has no visible item, the app shall show "Nothing packed yet. Add the first thing."
11. Item names, expense labels and member names shall render as text. The app shall not use `dangerouslySetInnerHTML`.

## R5 `sum-split` reducer

1. `skeleton/src/core/merges.ts` shall export `sumSplit(amountCents, members): Record<string, number>`.
2. IF `amountCents` is not a non-negative integer, THEN `sumSplit` shall throw.
3. The members shall be de-duplicated and sorted by UTF-16 code unit (never `localeCompare`). k is the number of distinct members.
4. WHEN k = 0, `sumSplit` shall return `{}`.
5. WHEN k > 0, each member shall get `floor(amountCents / k)`. The first `amountCents mod k` members in sorted order shall get one more cent. The shares shall sum to `amountCents`.
6. `sumSplit` shall use no float division and shall read no clock, randomness or locale.
7. Unit tests shall cover: 2500 over `sari`, `budi`, `dewi` (budi 834, dewi 833, sari 833); k = 0; k = 1; amount 0; amount smaller than k; duplicate members; input order independence; and a fast-check property that shares are integers ≥ 0, sum to the amount, and differ by at most 1.

## R6 Expense ops

All expense ops are `*.op.ts` in `apps/basecamp/src/ops/`, one op per file, with a `*.props.ts` and the scaffolded `*.props.test.ts`, registered in `registry.gen.ts`.

1. `expense.add` (`commutes`, intent `split`) shall carry `{ label, amountCents, payer, members }` as in G20 and G21. State shall be keyed by op id, so order and duplicates cannot change it. The invariant shall reject a non-integer or negative `amountCents`, a non-string label or payer, and a non-string member.
2. `expense.setAmount` (`causal-lww`, intent `split`) shall carry `{ amountCents }`, an explicit integer number of cents. Concurrent different amounts shall be a value twin (R7.5). Money shall never be a float.
3. `expense.addMember` (`commutes`, intent `split`) shall carry `{ member }`. `expense.removeMember` (`commutes`, intent `split`) shall carry `{ member }`.
4. A member shall be present iff some add of that member (the initial members of `expense.add` count as adds by that op, `expense.addMember` ops count as adds) is not covered by a remove of that member that observed it. An add concurrent with a remove shall survive.
5. The kit manifest `kit/props/intents.json` already maps `expense.add`, `expense.setAmount` and `expense.addMember` to `split`. A task shall add `expense.removeMember` as `split`. The declared intent of each op shall match its manifest entry.
6. The props of the three member-related ops shall use the kit `split` intent and shall also use the kit `add-remove` intent on membership, so both the split sum and add-wins are checked.
7. The props of `expense.setAmount` shall use the kit `split` intent and shall assert causal dominance: an amount that observed another amount beats it, with any stamp order.
8. The scaffolded `*.props.test.ts` of every new op shall run in the `props` project. No new op shall skip a property or lower `numRuns`.
9. No expense op file shall read a clock, randomness or locale.

## R7 Expense views and model

1. `materialize` shall return `expenses: Record<string, Expense>` beside `items` and `order`. An `Expense` shall hold `label`, `amountCents`, `payer`, `members` (sorted), `shares` (from `sumSplit` over the converged amount and member set), `unallocated` (the amount when k = 0, else 0), and `twins` (fields whose frontier values differ).
2. The model shall derive an expense with no applied `expense.add` as absent. It shall not invent one from `setAmount` or member ops alone.
3. `ExpenseRow` shall show label, amount as dollars and cents (for example `$26.00`), payer, members, and each member's share in cents-exact dollars, in tabular numerals. The row shall name the rule that derives the shares: `sum-split`.
4. The row shall show an "Add member" control and a "Remove" control per member, and an amount field that accepts whole and two-decimal amounts. The parser shall convert text to integer cents by string operations. It shall reject more than two decimals, negative values and non-numbers with an inline message.
5. Concurrent different amounts shall be a value twin with one button per amount; the tap shall write `expense.setAmount` observing both.
6. Money formatting shall not use `toLocale*`, `Intl` or float division.
7. Scripted moment (the app's only one): offline, A adds Dewi to "Gas + snacks" while B sets the amount to $26.00. After reconnect both replicas shall hold four members, $6.50 each, and shares summing to $26.00.

## R8 Goldens and kit wiring for the split

1. WHEN `sumSplit` passes G20 and G21 through `materialize`, the `pending` field shall be removed from `kit/props/golden/G20.json` and `G21.json`, and no other field shall change.
2. The golden runner shall then run both histories as passing tests. `kit/props/golden.test.ts` shall be updated so it no longer expects G20 and G21 to be pending. That is a spec-sanctioned change, and it shall not weaken any other assertion.
3. G20 shall give shares `budi` 834, `dewi` 833, `sari` 833. G21 shall give shares `{}` and `unallocated` 2500.
4. The `split` intent for the expense ops shall be wired through each op's declared intent in its `*.props.ts` (`splitIntent` with `relevant`, `read`). The `read` shall derive `{ amount, members, shares }` from the op's own state, not from `materialize`.
5. `kit/props/bad/split-float` and `split-first-member` shall still fail at least one property or golden history. The mutation check shall stay green.
6. The app's `app.props.ts` shall gain a `split` hook only if `kit/props/mixed.ts` has a slot for it. Otherwise the per-op props cover it, and the task notes that.

## R9 Conflicts and twin count

1. `apps/basecamp/src/conflicts.ts` shall export `describeConflicts(state)` and `twinCount(state)`, with `twinCount(state) === describeConflicts(state).length`. The same functions shall be given to `createPair` and `LimboShell`.
2. A descriptor shall exist for: each item with `life === 'twin'` (rule `resurrect`); each item claim loser (rule `claim-one`, one per loser); each item field twin on `name` or `ticked` (rule `causal-lww`); each expense field twin on `amountCents` (rule `causal-lww`).
3. Concurrent `item.move` writes with different keys shall not be a twin. The order is deterministic and the user has nothing to decide. The decision is recorded in design §10.
4. Descriptor ids shall be stable across re-renders and equal on both replicas for the same conflict.
5. `describeConflicts` shall be pure and shall read only the materialized state.

## R10 The lake scene (the judge's path)

Setup: pair view, replica `a` = Sari, replica `b` = Budi, fresh databases, seeded list, both "Live". Each step below is an acceptance criterion and an assertion of `e2e/basecamp-offline.spec.ts` (a). The scripted ops come from the **Play the lake scene** button or from manual edits, with the same result.

1. WHEN the link is cut, both cards shall be fogged (full fog) and the chip shall read "Offline".
2. WHEN A ticks **Tent (2-person)** and B deletes it, A shall show "1 waiting" (plate caption `1 WAITING`, one wisp), and B shall show "1 waiting" with the tent gone from B's list.
3. WHEN both claim **Stove (the last one)**, both cards shall show "2 waiting" and the chip "Yours? waiting" on the stove row. The scripted order shall be one op, then the claim, on each replica, so both claims carry the same Lamport counter after the same seed.
4. WHEN the link is restored, two wisps shall cross in each direction. While ops are unacked or the peer's ops are not applied, the card shall show the haze "Syncing 2…". WHEN both directions are done, both cards shall hold the same list, twins included, and the fog shall lift.
5. The tent shall return on both as the ticked row plus a ghost twin: "TWIN · Budi deleted this while Sari ticked it · rule: resurrect", with the buttons **Keep** and **Delete**.
6. The stove shall read "Sari is bringing it" on both. The tie goes to replica id `a` over `b`. On B the loser twin of R4.4 shall show. On A the quiet note of R4.5 shall show.
7. WHEN A taps **Keep** and B taps **OK**, the two resolve ops shall sync. Both cards shall then be deep-equal (canonical state) with 0 twins, and the FIXED stamp shall fire.
8. The Inspector on A shall list Recent exchanges newest first: the two resolve ops, then the four partition-era ops, each with merge, stamp `l·r·n` and deps. Conflicts shall list the two resolved twins with their rules (`resurrect`, `claim-one`).
9. The shuffle test over the ops on screen shall print how many orderings it ran, and "matches the specified result ✓" against the golden outcome (R12).
10. Manual edits shall stay possible at every step. Cutting the link, editing and restoring shall work with no scripted button.
11. WHEN the viewer taps **Why Sari?**, the Inspector shall open. The twin shall show both claim stamps. The two claims shall have equal `l` and different `r`.

## R11 Play the lake scene

1. WHILE the link is down and the lake scene has not run since the last reset, the app shall show a **Play the lake scene** button. It shall not show while the link is up.
2. WHEN the button is tapped, the app shall perform on replica A the tent tick and the stove claim, and on replica B the tent delete and the stove claim, one op at a time, in the order of R10.3.
3. Each performed op shall be labelled "scripted edit" on screen, next to the row it changed, until the next link restore.
4. The button shall not restore the link and shall not tap Keep or OK. The user restores and resolves.
5. WHERE the user made other edits first, the button shall still perform its four edits. The golden line then does not print (R12.3), and the app shall make no claim about the claims tying.
6. **Reset demo** shall delete this session's two databases (`limbo:basecamp:pair-<id>:a` and `:b`) through the app, clear the session key and the scene flag, and reload.

## R12 Shuffle test and golden

1. The app shall mount `ShuffleTest` with the on-screen ops (both replicas' applied ops, de-duplicated by op id, seed ops included), N = 1,000, and a worker-backed runner. The worker file `apps/basecamp/src/shuffle.worker.ts` shall import `runShuffle` and the app's `materialize`.
2. The app shall hold two goldens: the seed alone (`opIds` of the seed, `state` = a hand-written canonical state), and the lake scene (the seed plus the four partition ops plus the two resolve ops, with fixed ids, `state` = a hand-written canonical state).
3. The app shall pass `ShuffleTest` the golden whose `opIds` equals the on-screen op ids, and none when no golden matches, so the line "matches the specified result ✓" never prints for an edited list.
4. A unit test shall check that each golden's `state` equals the canonical `materialize` of its ops in any of several fixed shuffled orders. The expected summary the golden was written from (tent alive and ticked, stove won by `sari`, zero twins, and so on) shall be asserted field by field in the same test, so the golden is not a copy of the code's output.
5. The golden ids shall rely on fresh databases: replica `a` makes `a#1:n`, replica `b` makes `b#1:n`. The test shall state that assumption.

## R13 Shell, build and dev hooks

1. `apps/basecamp/` shall hold `index.html`, `vite.config.ts`, `app.config.ts`, and `src/`. `app.config.ts` shall export the app name `basecamp`, the defs (from `registry.gen.ts`), `materialize`, `describeConflicts`, `twinCount`, the seed ops, the goldens, and the member map (`a` → `sari`, `b` → `budi`, with display names Sari and Budi).
2. `apps/basecamp/package.json` shall add scripts `dev`, `build`, `preview` so `pnpm --filter @limbo/basecamp dev|build|preview` work. `build` shall produce a static `dist/` that opens with no server logic.
3. The page shall show, first, the line "For people whose shared list breaks when the signal does."
4. Pair view shall be the default at 640 px and wider. A single replica shall show below 640 px. `?replicas=1` and `?replicas=2` shall override the width.
5. WHEN the page loads in a dev or test build, `window.limbo` shall expose `ready` (a promise), `state(a|b)` (canonical JSON of the materialized state), `ops(a|b)`, `view(a|b)`, `queued(a|b)`, and `pair`.
6. A production build shall not define `window.limbo` and shall not contain the strings `devrelay` or `DevRelayLink`. A test shall check the built `dist/` text.
7. The database names shall be `limbo:basecamp:pair-<id>:a` and `limbo:basecamp:pair-<id>:b`, where `<id>` is the session id (R14). Reload shall keep the list and its queued ops.
8. Every text colour in the app CSS shall be a skeleton token pair of at least 4.5:1. The app shall not load a font, script or style from a CDN, and shall carry no `https://` string in its source except the Playwright and docs files.
9. The app's controls shall respect `prefers-reduced-motion`, with the layer's `data-motion` flag.

## R14 DevRelayLink (dev and test only)

1. `skeleton/src/sync/dev-relay-link.ts` shall export `createDevRelayLink({ url, replicaId, fetch?, pollMs? })`, which returns a `Link` (limbo `Link` type) that talks to the store-and-forward relay of `e2e/spike/relay.mjs` (`GET /ops?since=n`, `POST /ops`).
2. The link shall be `up` after a request to the relay succeeds and `down` after one fails. It shall send nothing the relay does not accept. WHILE the browser context is offline, no op shall reach the relay and none shall arrive.
3. The link shall run a client-side poll with `setTimeout` only while it is open. It shall never poll in a production build. The relay itself shall have no timer.
4. WHEN the link goes `up`, it shall give the session a `hello` for the relay's vv, deliver the relay's ops as `ops` messages, POST the session's `ops` messages, and `ack` after a POST succeeds, so `unacked` counts ops the relay has not accepted. The link shall skip ops whose author is the local replica when delivering.
5. A unit test shall drive the link against a fake `fetch` over an in-memory relay, and shall cover: ops cross only while up; a failed POST leaves `unacked` unchanged and retries on the next `up`; duplicates change nothing; the session's `link()` reads `down` while the fake fetch rejects.
6. The app shall enable the link only when the URL has `?devrelay=<url>` and `import.meta.env.DEV` or `MODE === 'test'`. It shall import the link by a dynamic `import()` guarded by the same test, so a production bundle does not hold it.
7. WHEN `?devrelay` is present, the page shall run one replica (`?r=a|b`, default `a`) with no `LimboShell`. It shall render the item list, a text status line (`deriveSync` chip) and `window.limbo`.
8. `skeleton/src/sync` shall stay free of React and of `BroadcastChannel` and `SharedWorker`. The new file shall use `fetch` only.

## R15 E2E

`e2e/basecamp-offline.spec.ts` (Playwright 1.59), with a Playwright project and `webServer` for the BASECAMP dev server beside the spike's. `e2e/offline-spike.spec.ts` shall keep passing, unchanged.

1. Test (a), pair view in one page: it shall perform R10 steps 1 to 8 and assert on-screen text for every line of R10.1 to R10.9, and that the canonical states of replica A and replica B deep-equal at the end.
2. Test (a) shall use **Play the lake scene** for steps 2 and 3, and shall assert each scripted op is labelled "scripted edit".
3. Test (b), two browser contexts, one replica each, joined by `DevRelayLink` through `?devrelay=http://localhost:5175` on the existing relay: both contexts shall `setOffline(true)`; A ticks the tent; B deletes it; both claim the stove; while offline no edit crosses (several poll periods), asserted by each side's state; then `setOffline(false)`; then the canonical states shall deep-equal, the tent shall be a twin on both, and exactly one stove claimant shall win.
4. Test (b) shall reset the relay (`POST /reset`) first and shall wait on state, not on fixed sleeps, after reconnect.
5. Every e2e assertion that reads a count (waiting, syncing, orderings run) shall read it from the page, not from a constant in the test.
6. `pnpm e2e` shall run both the spike and the BASECAMP specs.

## R16 Properties, hooks and gates

1. Each new op shall have its scaffolded `*.props.test.ts` and an entry in `registry.gen.ts`. The hooks create them when an `*.op.ts` file is created. The app shall not hand-edit `registry.gen.ts`.
2. `pnpm props` shall stay green at the fast tier. `pnpm props:full` (10,000 orderings) shall pass at the end, and its output shall be saved under `evidence/`.
3. No property, test, hook or vacuity guard shall be weakened, skipped, or have `numRuns` lowered. IF a property fails, THEN the op shall be fixed.
4. The vacuity guard shall still find each conflict class in the generated runs for the new ops. The new ops' generators shall produce concurrent amount edits, concurrent member add and remove, and duplicate member adds.
5. Every task shall end with `pnpm typecheck && pnpm test && pnpm props` green, and e2e tasks also with `pnpm e2e`.
6. No op file shall use a toggle, a read-modify-write, a wall-clock tiebreak or a float split.

## R17 Accessibility and legibility

1. Every conflict shall have a word and an icon, not colour alone (the layer's `Twin` provides this).
2. The UI shall be operable by keyboard: tick (Space), delete (Delete), reorder (arrows on the handle), claim and release (buttons), Keep, Delete, OK, **Why {name}?**, expense controls, Inspector (`I`), link (`L`).
3. The ghost content shall be `aria-hidden`. The readable caption shall be at full opacity.
4. Amounts and counts shall use tabular numerals.
5. The page shall have one `<h1>` and a landmark `main`.

## Out of scope

AFTERSHOCK, the service-worker offline shell, any cross-device relay in production, accounts, per-member permissions, currency conversion, expense deletion, editing an expense's payer or label, undo, and any claim about field use. The dev relay link is not a product feature.
