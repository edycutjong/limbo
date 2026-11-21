# Requirements: aftershock

AFTERSHOCK is app 2 on the LIMBO skeleton and the second distinct app of the Skeleton Crew entry. BASECAMP is an ordered list built on the skeleton's named merges. AFTERSHOCK is a set of keyed records on a drawn grid: a small team of surveyors fills the same sector report form from several devices while the network is down, and the reports merge into one shared grid without a lost or downgraded report. Its fields merge by rules the app declares itself, mostly as `commutes` ops. First line of the page (who it is for): "For small teams who fill the same form when the signal is gone." It is a static Vite + React SPA in `apps/aftershock/` that uses `@limbo/skeleton` and `@limbo/skeleton/limbo` unchanged. Everything sector-specific lives in the app. The op contract in `.kiro/steering/local-first.md` is binding. Wording everywhere (UI, comments, README): convergence is "measured, property-tested", never "proven" or "guaranteed". Offline claims are provisional. Every number shown in a page or comment comes from `evidence/` or is computed live from the replica's state. **Demo data only. No field use is claimed anywhere in the app.**

Specs this one builds on: `merge-kit` (merges, kit, goldens), `skeleton-sync` (replica, pair, link), `limbo-layer` (Fog, Wisps, Twin, Inspector, ReplicaPair, ShuffleTest), `basecamp` (the sibling app; its shape, shell and task granularity are mirrored). Existing app code to mirror, not import: `apps/basecamp/`.

## Glossary

- **Pair view**: `ReplicaPair` with replica `a` (Sari) and replica `b` (Budi), joined by the in-page link. Fixed ids so runs are reproducible.
- **Sector**: one cell of the grid, id `<column letter><row number>`: `A1` to `F4` (columns A–F, rows 1–4, 24 sectors).
- **Severity**: `safe < damaged < unsafe`, in that order.
- **Surveyor id**: lowercase person id used as `who` and in count targets: `sari`, `budi`, `rina`. Replica `a` acts as `sari`, replica `b` as `budi`. `rina` exists only in the seed.
- **Need**: one of `water`, `medical`, `shelter`, `food`, `power`.
- **Seed**: the deterministic op script authored by replica `seed` ("Block 7 survey"), the same bytes on every replica.
- **Survey scene**: the scripted partition scenario of R10: three edits per replica while the link is cut on sector C3, then restore and one resolve.
- **Scripted edit**: an op the **Play the survey scene** button performs, labelled as such on screen.
- **Twin descriptor**: the app's record `{ id, target, rule, caption }` for one conflict the user should see (limbo-layer R2.6). `twinCount(state)` equals the number of descriptors.
- **Observing op**: an op whose `deps` cover the ops it targets. `covers(x, y)` as in the op contract.

## R1 Scope, reuse and budget

1. The app shall build its UI from the `@limbo/skeleton/limbo` components (`LimboShell`, `ReplicaPair`, `Fog`, `Wisps`, `StatusChip`, `FixedStamp`, `Twin`, `Inspector`, `ShuffleTest`) and shall not copy or fork them.
2. The success metric is zero changed files outside `apps/aftershock/`. The only files allowed to change elsewhere are: `e2e/aftershock-offline.spec.ts` (new), `playwright.config.ts`, `pnpm-lock.yaml`, and the two kit edits of R6.7 if the owner accepts them (design §10, point 1). No file under `skeleton/` shall change. The app shall import skeleton code by path, as BASECAMP does, and shall not add to `skeleton/src/index.ts` or `skeleton/package.json`.
3. IF a skeleton change is truly unavoidable, THEN it shall be the smallest possible, shall be reported before it is made, and shall be recorded in `## Adoption log` at the end of `design.md` (file, why, lines). The skeleton budget (30 files, 2,400 TS/TSX lines, 15 exports) shall be measured before and after with the command in `evidence/budget-basecamp-baseline.md` and shall be equal.
4. The app shall import nothing from `yjs` or `y-indexeddb`, shall not import from `apps/basecamp/`, and shall not use `BroadcastChannel` or `SharedWorker`.
5. The app shall run no server-side polling and shall make no network request in a production build.

## R2 Seed

1. `apps/aftershock/src/seed.ts` shall export the seed script and `seedOps`, built with `makeSeedOps` so replica `seed` authors every op with fixed counters 1..n. The script shall hold no clock, randomness or locale call.
2. The survey shall be named "Block 7 survey" and shall cover 24 sectors, `A1` to `F4`.
3. The seed shall report 10 sectors: 8 `safe` (`A1`, `A3`, `B1`, `C1`, `D1`, `D2`, `E1`, `F1`) and 2 `damaged` (`B2`, `E3`). `C3` shall have no report and no other op, so the survey scene starts from an empty sector. Reports come first, in sector order.
4. The seed shall hold counts on 4 sectors: `A1` sari 2; `A3` budi 1; `B2` rina 3 and sari 1; `E3` rina 2. Each is a `sector.count` on target `<sector>#<who>`.
5. The seed shall hold needs on 3 sectors: `B2` water, `E3` medical, `A3` shelter.
6. The seed therefore holds 18 ops (10 reports, 5 counts, 3 needs), and the next Lamport counter on every replica after the seed is 19.
7. WHEN materialized, the seed shall give: 10 reported sectors; `A1` safe with total 2; `B2` damaged with total 4 (rina 3, sari 1) and need water; `E3` damaged with total 2 and need medical; `A3` safe with total 1 and need shelter; `C3` absent; zero twins.
8. A unit test shall print the sha256 of the seed's canonical JSON and shall assert it equals a recorded constant, so a change to the seed is a visible edit of that constant.
9. A unit test shall assert that building the seed twice gives byte-identical ops, that every seed op is authored by `seed`, and that no counter exceeds the number of seed ops.

## R3 Ops (all in `apps/aftershock/src/ops/`)

Every op is a `*.op.ts` with one op per file, a `*.props.ts` and the scaffolded `*.props.test.ts`, registered in `registry.gen.ts` by the hooks. Every op declares `merge` and `intent`, and the intent matches `kit/props/intents.json`. The shared state helpers live in `sector.state.ts` (not an op file). No op file and no `sector.state.ts` shall read `Date.now`, `new Date`, `performance.now`, `Math.random`, `crypto.randomUUID` or `toLocale*`, and none shall toggle, read-modify-write, break a tie by wall clock, or use a float.

1. `sector.report` shall carry `{ severity }`, with severity one of `safe`, `damaged`, `unsafe`, on target `<sector>`. Merge `commutes`. Declared intent `{ kind: 'max', field: 'severity', order: ['safe', 'damaged', 'unsafe'] }`: the severity of a sector is the maximum over the reports that no clear covers (a max-lattice). A concurrent report shall never lower it. The intent sentence ("two surveyors reporting one sector offline must keep the worse report") shall head the file.
2. `sector.clear` (re-inspection) shall carry `{}` on target `<sector>`. Merge `commutes`. Intent `max` (same field and order). It is an observing op: it clears exactly the reports it covers, that is, the reports in its causal deps. A re-inspection that saw `unsafe` may lower the severity. A report concurrent with the clear shall not be cleared.
3. WHEN every report of a sector is cleared, the sector shall read as not reported.
4. `sector.count` shall carry `{ count }`, an integer from 0 to 100000, on target `<sector>#<who>`. Merge `causal-lww`, intent `{ kind: 'set', field: 'count' }`. There is one register per surveyor, so no surveyor's count is ever lost. The sector total shall be the sum of each surveyor's current count. Concurrent different counts from one surveyor (the same person on two devices) shall be a value twin (R9.2).
5. `sector.need` shall carry `{ need }` and `sector.unneed` shall carry `{ need }`, both on target `<sector>`. Merge `commutes` for both, intent `{ kind: 'add-remove', field: 'needs' }`. This is an add-wins set: a need is present iff some add of it is not covered by an unneed that observed that add. An add concurrent with an unneed shall survive.
6. `sector.note` shall carry `{ note }`, a string of at most 280 characters, on target `<sector>`. Merge `causal-lww`, intent `{ kind: 'set', field: 'note' }`. Concurrent different notes shall be a value twin (R9.2). The resolve shall be a pick-one `sector.note` that observes both, as BASECAMP does for item names.
7. `kit/props/intents.json` already maps `sector.report`, `sector.clear`, `sector.count`, `sector.need` and `sector.note`. `sector.unneed` has no entry. Two kit edits are needed to register it: one line `"sector.unneed": { "kind": "add-remove" }` in `intents.json`, and in `kit/props/manifest.test.ts` the expected map and the count (18 to 19). They are spec-sanctioned (as BASECAMP's `expense.removeMember` was), shall be made in one task, shall weaken no assertion, and shall be recorded in the adoption log. Open point 1 offers a zero-edit alternative.
8. Ops shall be idempotent: state is keyed by op id, so order and duplicates cannot change it.
9. An invalid payload (unknown severity, non-integer or out-of-range count, unknown need, non-string or over-long note) shall fail the op's invariant. The UI shall never create one (R7.6).

## R4 Model (`src/model.ts`)

1. `materialize(ops)` shall be pure and shall read only `stamp` and `deps`. It shall apply ops through a fresh causal buffer (any order, duplicates ignored) and return `{ sectors: Record<string, Sector> }`.
2. A `Sector` shall hold: `id`; `severity` (the lattice value of R3.1 and R3.2, or `undefined` when not reported); `reports` (the number of uncovered reports); `counts` (one entry per surveyor: `who`, `value`, and `values` = the frontier values with their author when twinned, else empty); `total` (the sum of `value`); `needs` (sorted by UTF-16 code unit); `note` (the current note or `undefined`); `noteValues` (the frontier notes with their author when twinned, else empty).
3. A target of the form `<sector>#<who>` shall feed the count of `who` on `<sector>`. The model shall accept any target string without throwing: a count target without `#` shall be keyed by `who = ''` and shall not appear in a surveyor list.
4. A sector exists in the state iff some applied op names it. Sectors with no op are absent.
5. The model shall use `causalLww` from `skeleton/src/core/merges.ts` for counts and notes. Severity and needs shall come from helpers in `sector.state.ts`, which the op states and the model both use, so they cannot disagree.
6. Surveyor display order shall be the roster order `sari`, `budi`, `rina`, then any other id by UTF-16 code unit.

## R5 Conflicts and twin count

1. `apps/aftershock/src/conflicts.ts` shall export `describeConflicts(state)` and `twinCount(state)`, with `twinCount(state) === describeConflicts(state).length`. The same functions shall be given to `createPair` and `LimboShell`.
2. A descriptor shall exist for: each sector whose note is twinned (id `<sector>:note`, rule `causal-lww`); each surveyor count that is twinned (id `<sector>:count:<who>`, rule `causal-lww`).
3. Severity and needs shall produce no descriptor. They are lattices and add-wins sets: nothing is lost, and the user has nothing to decide. The decision is recorded in design §10.
4. Descriptor ids shall be stable across re-renders and equal on both replicas for the same conflict. `describeConflicts` shall be pure and shall read only the materialized state. Descriptors shall be ordered by (target, rule, id).

## R6 Properties, hooks and gates

1. Each new op shall have its scaffolded `*.props.test.ts` and an entry in `registry.gen.ts`. The hooks create them when an `*.op.ts` is created. The app shall not hand-edit `registry.gen.ts`.
2. Each op's `*.props.ts` shall supply a `conflictGen` with payload generators and a `targets` pool (count ops use `<sector>#<who>` targets), and the kit intent that matches its declared intent: `maxIntent` for `sector.report`, `setIntent` for `sector.count` and `sector.note`, `addRemoveIntent` for `sector.need` and `sector.unneed`.
3. `sector.clear` has no reports in its own per-op runs, so a companion file `ops/sector.severity.props.test.ts` (not an op file) shall run `simulate` over both `sector.report` and `sector.clear` with the kit `maxIntent`, `config.orderings` runs, and shall also run a local wrong variant (a clear that ignores its deps) and assert that the oracle fails on it. No property is skipped or weakened.
4. `apps/aftershock/src/ops/app.props.ts` shall export `app: AppProps` with `materialize` (the app's real fold), so the mixed-script properties (app convergence, replay equivalence, idempotence) run over the AFTERSHOCK op set. `AppProps` has no `max` or `add-remove` slot, so those two intents are checked per op and by R6.3. The task shall say so.
5. The vacuity guard shall find the applicable conflict classes (`lww-equal`, `lww-different`, via `sector.count` and `sector.note`) in the generated runs. The generators shall give small value pools in hot scripts so equal and different concurrent writes both occur. The classes that need BASECAMP ops stay `n/a`.
6. `pnpm props` shall stay green at the fast tier. `pnpm props:full` (10,000 orderings) shall pass at the end, and its output shall be saved under `evidence/aftershock/`.
7. No property, test, hook or vacuity guard shall be weakened, skipped, or have `numRuns` lowered. IF a property fails, THEN the op shall be fixed. A property change needs a spec change.
8. Every task shall end with `pnpm typecheck && pnpm test && pnpm props` green, and e2e tasks also with `pnpm e2e`.

## R7 Views (`src/views/`)

1. `SectorGrid` shall draw a 6 × 4 grid (columns A–F, rows 1–4) with no map tiles. Each cell shall show the sector id, a severity glyph and the word `SAFE`, `DAMAGED` or `UNSAFE` (a non-colour cue), and the total count when the sector has a count. A sector with no report shall show a dash and `NO REPORT`. Each cell shall be at least 44 px by 44 px and carry `data-sector="<id>"`.
2. The grid shall be keyboard navigable with roving focus: one cell has `tabindex="0"`, the others `-1`. Arrow keys move one cell and stop at the edges, Home and End go to the first and last cell of the row, Enter and Space select the focused cell. Selecting a cell shall not create an op.
3. `SectorCard` shall show the selected sector (each replica card keeps its own selection): its severity and word, the counts by surveyor with names and the total, the needs chips, the note, and the note and count twins (R9). WHEN the severity is `unsafe`, the card shall end in the instruction line "`<sector>` — do not enter" (for example "C3 — do not enter"). The line shall not appear for any other severity.
4. The total line shall read "`<total>` reported — `<Name> <n>`, `<Name> <n>`" with surveyors in R4.6 order, for example "5 reported — Sari 2, Budi 3", and "may overlap" shall sit beside the total as its own element, not in the instruction line.
5. `ReportForm` shall hold: a severity segmented control (`Safe`, `Damaged`, `Unsafe`), a "People found" stepper, needs chips (`water`, `medical`, `shelter`, `food`, `power`, each pressed or not), a note field, a "Re-inspection" checkbox, and **Save**. Every control shall be at least 44 px by 44 px.
6. **Save** shall write only what the form changed, each as an explicit value, never a toggle or a delta: `sector.report` if a severity is set and differs from this surveyor's last report on the sector or the sector has none; `sector.count` for this surveyor's target if the stepper value was set; `sector.need` for each need newly pressed and `sector.unneed` for each need newly unpressed; `sector.note` if the text is non-empty and differs from the current note. WHEN "Re-inspection" is checked, Save shall first write `sector.clear`, then the `sector.report`, so the clear observes the earlier reports and the new report observes the clear. WHEN nothing changed, Save shall be disabled.
7. A rejected form value (a count that is not a whole number from 0 to 100000, a note over 280 characters, Save with no severity on a sector that has no report) shall show an inline error naming the field and shall create no op. The form shall keep what the user typed.
8. The empty state, WHEN no sector has a report, shall read "No sectors reported yet. Tap a sector to report."
9. The twin variants shall use the skeleton's `Twin` (R9). Item text (notes, surveyor names) shall render as text. The app shall not use `dangerouslySetInnerHTML`.
10. `Space` and `Enter` on a focused grid cell select it. They shall be inactive while focus is in a text input, so typing a note never selects a cell.

## R8 Shell, build and dev hooks

1. `apps/aftershock/` shall hold `index.html`, `vite.config.ts` (`base: './'`, port **5176**, `strictPort`, static `dist/`), `app.config.ts`, `app.css`, `package.json` and `src/main.tsx`. `app.config.ts` shall export `name` (`aftershock`), `defs` (from `registry.gen.ts`), `materialize`, `describeConflicts`, `twinCount`, `seedOps` and `goldens`, exactly as BASECAMP's does, plus the member map (`a` → `sari`, `b` → `budi`, with display names Sari and Budi).
2. `apps/aftershock/package.json` shall add scripts `dev`, `build`, `preview` so `pnpm --filter @limbo/aftershock dev|build|preview` work, with `react`, `react-dom` and `vite` as BASECAMP declares them. `build` shall produce a static `dist/` that opens with no server logic.
3. The page shall show one `<h1>` ("AFTERSHOCK"), then the line "For small teams who fill the same form when the signal is gone.", and a permanent **DEMO DATA** chip in the header with the text "Demonstration data shape — not used in the field". The chip shall not be dismissible.
4. Pair view shall be the default at 640 px and wider. A single replica shall show below 640 px. `?replicas=1` and `?replicas=2` shall override the width.
5. WHEN the page loads in a dev or test build, `window.limbo` shall expose `ready` (a promise), `state(a|b)` (canonical JSON of the materialized state), `ops(a|b)`, `view(a|b)`, `queued(a|b)`, and `pair`.
6. A production build shall not define `window.limbo` and shall not contain the strings `devrelay` or `DevRelayLink`. A test shall check the built `dist/` text.
7. The database names shall be `limbo:aftershock:pair-<id>:a` and `limbo:aftershock:pair-<id>:b`, where `<id>` is the session id (R14). Reload shall keep the survey and its queued ops. **Reset demo** shall delete this session's two databases through the app, clear the session key and reload.
8. Every text colour in the app CSS shall be a skeleton token pair of at least 4.5:1. The app shall add no colour literal that is not a token, load no font, script or style from a CDN, and carry no `https://` string in its source.
9. The root `tsconfig.json` and `vitest.config.ts` shall pick up the new app through their existing `apps/*` globs. A task shall verify this, and shall change them only if it is false.
10. The app's controls shall respect `prefers-reduced-motion`, with the layer's `data-motion` flag.

## R9 Twin variants

1. WHEN two surveyors write different notes on one sector concurrently, the sector card shall render the note through `Twin`: at-rest row with the current note, a ghost with the other note, the caption "TWIN · {A} wrote “{n1}” while {B} wrote “{n2}” · rule: causal-lww", and one button **Keep this note** per note (accessible name "Keep this note: {note}"). A tap shall create `sector.note` with the picked text, observing both.
2. WHEN one surveyor has two different concurrent counts on one sector, the card shall render a `Twin` with one button **Keep this count** per value (accessible name "Keep this count: {n}"). A tap shall create `sector.count` on the same `<sector>#<who>` target with the picked integer, observing both.
3. WHEN a twin has resolved, no ghost, caption or button shall remain on either replica.
4. Value twins shall use the rule line `causal-lww`. The ghost content shall be `aria-hidden`; the readable caption shall be at full opacity.

## R10 The survey scene (the judge's path)

Setup: pair view, replica `a` = Sari, replica `b` = Budi, fresh databases, seeded survey "Block 7 survey", both "Live". Each step below is an acceptance criterion and an assertion of `e2e/aftershock-offline.spec.ts` (a). The scripted ops come from the **Play the survey scene** button or from manual edits, with the same result.

1. WHEN the link is cut, both cards shall be fogged and the chip shall read "Offline".
2. WHEN A opens sector C3 and reports **damaged**, **2 people**, note "cracked stairwell", and B opens C3 and reports **unsafe**, **3 people**, note "gas smell, east wall", each card shall show "3 waiting" (report, count, note; the number is read from the page) with that many wisps. C3 shall show the local view only: DAMAGED, "2 reported — Sari 2" on A; UNSAFE, "3 reported — Budi 3" on B.
3. WHEN the link is restored, wisps shall cross in each direction. While ops are unacked or the peer's ops are not applied, the card shall show the haze "Syncing …". WHEN both directions are done, both cards shall hold the same state and the fog shall lift.
4. C3 shall then show, on both cards: **UNSAFE** (max severity; the concurrent report never lowered it); "5 reported — Sari 2, Budi 3" with "may overlap" beside the total; both notes as a note twin with one **Keep this note** button per note; and the instruction line "C3 — do not enter".
5. WHEN A taps one note, the resolve op shall sync. Both cards shall then be deep-equal (canonical state) with 0 twins, and the FIXED stamp shall fire.
6. The Inspector on A shall list Recent exchanges newest first: the resolve op, then the partition-era ops, each with merge, stamp `l·r·n` and deps. Conflicts shall list the resolved note twin and its rule (`causal-lww`).
7. The shuffle test over the ops on screen shall print how many orderings it ran and "matches the specified result ✓" against the golden outcome (R12).
8. Manual edits shall stay possible at every step. Cutting the link, editing and restoring shall work with no scripted button.
9. The note-twin tap shall write a pick-one value: its stamp covers both notes, so on every replica it is the only frontier note.

## R11 Play the survey scene

1. WHILE the link is down and the survey scene has not run since the last reset, the app shall show a **Play the survey scene** button. It shall not show while the link is up.
2. WHEN the button is tapped, the app shall perform, one op at a time and alternating between replicas, on A: `sector.report` C3 damaged, `sector.count` C3#sari 2, `sector.note` C3 "cracked stairwell"; on B: `sector.report` C3 unsafe, `sector.count` C3#budi 3, `sector.note` C3 "gas smell, east wall".
3. Each performed op shall be labelled "scripted edit" on screen, next to the sector it changed, until the next link restore.
4. The button shall not restore the link and shall not tap a **Keep this note** button. The user restores and resolves.
5. WHERE the user made other edits first, the button shall still perform its six edits. The golden line then does not print (R12.3).
6. **Reset demo** shall delete this session's two databases (`limbo:aftershock:pair-<id>:a` and `:b`) through the app, clear the session key and the scene flag, and reload.

## R12 Shuffle test and golden

1. The app shall mount `ShuffleTest` with the on-screen ops (both replicas' applied ops, de-duplicated by op id, seed ops included), N = 1,000, and a worker-backed runner. The worker file `apps/aftershock/src/shuffle.worker.ts` shall import `runShuffle` and the app's `materialize`.
2. The app shall hold two goldens: the seed alone, and the finished survey scene (the seed, the six partition ops and the resolve, with fixed ids). Each `state` is a hand-written canonical state.
3. The app shall pass `ShuffleTest` the golden whose `opIds` equals the on-screen op ids, and none when no golden matches, so "matches the specified result ✓" never prints for an edited survey.
4. A unit test shall check that each golden's `state` equals the canonical `materialize` of its ops in several fixed shuffled orders. The expected summary (C3 unsafe, counts sari 2 and budi 3 and total 5, one note, no needs, zero twins) shall be asserted field by field in the same test, so the golden is not a copy of the code's output.
5. The golden ids rely on fresh databases: replica `a` makes `a#1:n`, replica `b` makes `b#1:n`. The partition ops are `a#1:1..3` and `b#1:1..3`, the resolve is `a#1:4`. The test shall state that assumption.

## R13 Actions

1. `apps/aftershock/src/actions.ts` shall hold one function per user action, each taking a `Replica` and creating the op with `replica.local(name, target, payload)`: report, re-inspect (clear then report), set count (target `<sector>#<memberOf(replica)>`), add need, remove need, set note, and the two resolves (pick a note, pick a count).
2. Resolves shall create one op each, observing every op the replica holds on that target at that moment (the op's `deps` is the replica's version vector).
3. No action shall toggle. Pressing the same need twice offline shall create two adds, not an add and a remove.

## R14 DevRelayLink solo page (dev and test only)

1. The app shall enable the dev relay only when the URL has `?devrelay=<url>` and `import.meta.env.DEV` or `MODE === 'test'`. It shall import `skeleton/src/sync/dev-relay-link.ts` by path through a dynamic `import()` guarded by the same test, so a production bundle does not hold it.
2. WHEN `?devrelay` is present, the page shall run one replica (`?r=a|b`, default `a`) with no `LimboShell`. It shall render the sector list as text (`[data-sector]` lines with id, severity, total, note), a text status line (`[data-status]`, the `deriveSync` chip) and `window.limbo` with `{ ready, state, ops, queued, report, count, note }`.
3. The solo page shall use the database name `limbo:aftershock:solo-<r>`.

## R15 E2E

`e2e/aftershock-offline.spec.ts` (Playwright 1.59), with a Playwright project and `webServer` for the AFTERSHOCK dev server on 5176 beside BASECAMP's. The other specs shall keep passing, unchanged.

1. Test (a), pair view in one page: it shall perform R10 steps 1 to 6 and assert the on-screen text of every line of R10.1 to R10.7, and that the canonical states of replica A and replica B deep-equal at the end. It shall assert the page opens with the tagline and the DEMO DATA chip text.
2. Test (a) shall use **Play the survey scene** for step 2 on one run of the flow, and shall assert each scripted op is labelled "scripted edit". Manual edits shall give the same end state.
3. Test (b), two browser contexts, one replica each, joined by `DevRelayLink` through `?devrelay=http://localhost:5175` on the existing relay: reset the relay (`POST /reset`) first; both contexts `setOffline(true)`; A reports C3 damaged and sets its count 2, B reports C3 unsafe and sets its count 3; while offline no edit crosses (several poll periods), asserted by each side's state and by the relay log; `setOffline(false)`; wait on state equality, not on fixed sleeps; then the canonical states deep-equal, C3 is `unsafe` on both, and both counts (sari 2, budi 3) are present.
4. Every assertion that reads a count (waiting, syncing, orderings run) shall read it from the page, not from a constant in the test.
5. `pnpm e2e` shall run the spike, BASECAMP and AFTERSHOCK specs. Tests (a) and (b) shall be run ten times and the pass count recorded (a flaky test is a failing test; fix the wait, not the assertion).

## R16 Wording and honesty

1. No page, comment or README shall say "proven" or "guaranteed", and none shall claim field use. A unit test shall scan the app's non-test sources, `index.html` and `README.md` for those words.
2. The page shall state that offline claims are provisional wherever it explains a merge, and shall describe the claim-free parts as they are: the severity is the max over reports no re-inspection has seen, and the total "may overlap".
3. The README shall say that the data is a demonstration shape and that no field use is claimed.

## R17 Accessibility and legibility

1. Severity shall be conveyed by a word and a glyph, never by colour alone. Every conflict shall have a word and an icon (the layer's `Twin` provides this).
2. The UI shall be operable by keyboard: grid (arrows, Enter, Space), report form, **Keep this note**, **Keep this count**, Inspector (`I`), link (`L`).
3. The grid shall have an accessible name ("Block 7 survey, sectors A1 to F4"), and each cell the name "`<id>`, `<WORD>`, `<n>` people reported" (or "not reported").
4. Counts and totals shall use tabular numerals.
5. The page shall have one `<h1>` and a landmark `main`.

## Out of scope

Map tiles, real geodata, photo or file attachments, accounts, per-surveyor permissions, a field-use claim, a service-worker offline shell, any production relay, deleting a sector, undo, and editing the seed. The dev relay link is not a product feature.
