# Tasks: aftershock

Each task ends with `pnpm typecheck && pnpm test && pnpm props` green. The e2e tasks (22, 23) also end with `pnpm e2e` green. Tests, properties, hooks and the vacuity guard are never weakened, skipped, or run with a lower `numRuns`. IF a property fails, THEN fix the op. Do not run git. Op files are created as `*.op.ts` so the hooks scaffold `*.props.test.ts` and `registry.gen.ts`; never hand-edit `registry.gen.ts`. Touch nothing outside `apps/aftershock/` except `e2e/aftershock-offline.spec.ts`, `playwright.config.ts`, `pnpm-lock.yaml`, and the two kit edits of task 6 if the owner accepted them (design §10, point 1). If any other outside file seems necessary, stop and report it before making the change, then log it in design `## Adoption log`. Do not import from `apps/basecamp/`. Wording: "measured, property-tested". Demo data only; no field use is claimed.

- [x] 1. Tooling and app shell
  - `apps/aftershock/package.json`: dependencies `react`, `react-dom` (as BASECAMP), dev dependency `vite`, scripts `dev`, `build`, `preview`. Run `pnpm install` (the lockfile change is allowed). Add `index.html` (title AFTERSHOCK), `vite.config.ts` (`base: './'`, `server` and `preview` port 5176 with `strictPort`, `outDir: 'dist'`), `app.css` (layout only, skeleton tokens only), a minimal `src/main.tsx` that renders `<main>`, one `<h1>AFTERSHOCK</h1>`, the tagline "For small teams who fill the same form when the signal is gone." and the DEMO DATA chip ("DEMO DATA" and "Demonstration data shape — not used in the field", `role="note"`, not dismissible), and `src/env.d.ts`. Update `README.md` (demonstration data shape, no field use claimed).
  - Verify that root `tsconfig.json` and `vitest.config.ts` pick up the app with no edit (the `apps/*` globs). Change them only if the check fails, and log it.
  - Record the skeleton baseline (file count and non-blank, non-comment lines, excluding tests and `limbo/test/`) with the command of `evidence/budget-basecamp-baseline.md`, in `evidence/aftershock/budget-baseline.md` (a new file).
  - Tests: `app-shell.test.tsx` finds the `h1`, the tagline and the chip text; `pnpm --filter @limbo/aftershock build` produces `dist/index.html`.
  - _Requirements: R1.2, R1.3, R8.1 to R8.3, R8.8, R8.9, R17.5_

- [x] 2. Constants and members
  - `src/sectors.ts`: `SECTOR_IDS` (columns A–F, rows 1–4, 24 ids), `SEVERITIES` (`safe, damaged, unsafe`), `NEEDS`, `MAX_COUNT` (100000), `MAX_NOTE` (280). `src/members.ts`: replica `a` → `sari`, `b` → `budi`, roster `sari, budi, rina`, display names, `authorOf(op)` = `stamp.r.split('#')[0]`, `memberOfReplica`, `displayName`.
  - Tests: 24 distinct ids in row-major order for the grid; `authorOf` of `a#1`, `seed`; roster order; unknown member displays as its id.
  - _Requirements: R4.6, R8.1_

- [x] 3. `sector.state.ts` and `sector.report`
  - Create `ops/sector.state.ts` (`severityOf`, `applySeverityOp`, `severityInvariant`, `present`, `applyNeedOp`, `needInvariant`) with `covers` from `skeleton/src/core/causal.ts`. Create `ops/sector.report.op.ts` with the intent sentence at the top, `merge: 'commutes'`, intent `{ kind: 'max', field: 'severity', order: ['safe','damaged','unsafe'] }`. Write `sector.report.props.ts` with `conflictGen` and `maxIntent`. Let the hooks scaffold the props test and the registry.
  - Tests: `sector.state.test.ts` for `severityOf` (max of several reports; a clear that saw a report removes it; a concurrent report survives the clear; a report made after the clear is kept; all cleared gives `undefined`; duplicates and order do not change it); the scaffolded props suite passes and the vacuity guard still reports.
  - _Requirements: R3.1, R3.8, R3.9, R6.1, R6.2_

- [x] 4. `sector.clear` and the severity companion
  - Create `ops/sector.clear.op.ts` (`merge: 'commutes'`, same `max` intent) and `sector.clear.props.ts`. Add `ops/sector.severity.props.test.ts` per design §9: `simulate` over `sector.report` and `sector.clear`, `maxIntent` over `config.orderings` runs, plus the local `clearAll` variant asserted to fail the oracle. State in the file that this covers what a per-op run of `sector.clear` cannot.
  - Tests: the scaffolded props suite passes; the companion passes on the real ops and fails on `clearAll`; a hand-built example shows a clear that saw `unsafe` lowers the severity and a concurrent `unsafe` report does not get cleared.
  - _Requirements: R3.2, R3.3, R6.2, R6.3, R6.7_

- [x] 5. `sector.count` and `sector.note`
  - Create both ops (`causal-lww`, intent `set` on `count` and `note`) with state like `item.rename` (writes by op id, value re-derived) and invariants (integer 0..100000; string at most 280 characters). Write each `*.props.ts` with `setIntent`, a `targets` pool (`C3#sari`, `C3#budi`, `D1#sari`, `D1#budi` for counts) and small hot value pools so equal and different concurrent writes both occur.
  - Tests: scaffolded props suites pass; the vacuity guard finds `lww-equal` and `lww-different`; invariants reject a float, a negative, 100001 and a 281-character note.
  - _Requirements: R3.4, R3.6, R3.8, R3.9, R6.2, R6.5_

- [x] 6. `sector.need` and `sector.unneed`
  - Resolve design §10 point 1 first. Default: create both ops (`commutes`, intent `add-remove` on `needs`) and make the two kit edits in this task only: add `"sector.unneed": { "kind": "add-remove" }` to `kit/props/intents.json`, and in `kit/props/manifest.test.ts` add the entry to `EXPECTED` and change the count from 18 to 19 in the name and in the assertion text. Weaken nothing else. If the owner chose the zero-edit alternative, create one op `sector.need { need, on }` instead and skip the kit edits. Say which in the task notes.
  - `*.props.ts` use `addRemoveIntent` with the add and remove roles (as BASECAMP's member ops) and a 2-value hot pool, so concurrent add and unneed of one need happen.
  - Tests: scaffolded props suites pass; `present` cases (an unneed that observed the add removes it; an add concurrent with an unneed survives; duplicate adds; unneed before add); manifest test passes with the new count.
  - _Requirements: R3.5, R3.7, R6.2_

- [x] 7. Mixed-script hook
  - `ops/app.props.ts` exporting `app: AppProps = { materialize }` once the model of task 8 exists (create a stub model first only if needed, and replace it in task 8). A comment states that `AppProps` has no `max` or `add-remove` slot and that those intents run per op and in the companion.
  - Tests: `pnpm props` shows the `mixed aftershock` convergence, replay equivalence and idempotence passing, and the vacuity guard listing `lww-equal` and `lww-different` as applicable, the rest `n/a`.
  - _Requirements: R6.4, R6.5_

- [x] 8. Model
  - `src/model.ts` per design §4, including `frontier` for `values` and `noteValues`, sector grouping by `target.split('#')[0]`, roster order, and tolerance for targets without `#`.
  - Tests (`model.test.ts`): two surveyors' counts on one sector give total 5 and "Sari 2, Budi 3" order; the same surveyor's two concurrent counts give `values` of 2; an absent sector; severity is the max for concurrent reports in every one of several shuffled orders; a clear that saw `unsafe` lowers to the next report or `undefined`; a concurrent report survives a clear; needs add-wins; concurrent notes give `noteValues` of 2 and a pick-one resolves it; `sector.count` on target `t0` does not throw.
  - _Requirements: R4_

- [x] 9. Conflict descriptors
  - `src/conflicts.ts` per design §5.
  - Tests (`conflicts.test.ts`): each row of the table; `twinCount === describeConflicts.length`; severity and needs produce nothing; ids are stable and equal on two replicas built from the same ops in different orders; ordering by (target, rule, id).
  - _Requirements: R5_

- [x] 10. Seed
  - `src/seed.ts` per R2 and design §7 with `makeSeedOps`.
  - Tests (`seed.test.ts`): materialized values of R2.7 (10 reported, 8 safe, B2 and E3 damaged, totals, needs, `C3` absent, zero twins); 18 ops, all by `seed`, counters 1..18; byte-identical on two builds; sha256 of the canonical JSON equals a recorded constant (print it).
  - _Requirements: R2_

- [x] 11. Actions
  - `src/actions.ts` per R13: report, re-inspect (clear then report), set count, add need, remove need, set note, pick note, pick count. `memberOf(replica)`.
  - Tests (`actions.test.ts`, two real `createReplica` instances with manual delivery): each resolve clears its twin on both replicas after delivery; the count target is `C3#sari` on `a` and `C3#budi` on `b`; pressing a need twice makes two adds; re-inspection lowers an observed `unsafe` and leaves a concurrent report standing; no action reads state to compute a delta or a flip.
  - _Requirements: R13, R9.1, R9.2, R3.2_

- [x] 12. Survey scene script and goldens
  - `src/scene.ts`: `surveyScript` (six edits, alternating A then B), `SEED_OP_IDS`, `PARTITION_OP_IDS`, `RESOLVE_OP_IDS`, the two goldens (hand-written canonical states), the assumption comment about fresh databases.
  - Tests (`scene.test.ts`, real `createPair` with a manual scheduler): after the six edits and a restore, ids are `a#1:1..3` and `b#1:1..3`, the two reports have `l = 19` and different `r`, the counts `l = 20`, the notes `l = 21`, the resolve is `a#1:4` with `l = 22`; severity `unsafe`, total 5, two note values before the resolve and none after; golden `state` strings equal the canonical `materialize` of their ops in several shuffled orders; the stated expectations are asserted field by field.
  - _Requirements: R10.2 to R10.5, R12.2, R12.4, R12.5_

- [x] 13. App assembly and `ReplicaBody`
  - `app.config.ts`, `main.tsx`: `createPair` with the seed, `LimboShell`, `ReplicaPair` (`names` SARI and BUDI, `plate` 1 and 2, `onReset` using `deleteStore` then reload), a `ReplicaBody` that shows the empty state and a selected-sector placeholder, `window.limbo` behind the dev/test guard, `?replicas` handled by the layer. The header keeps the h1, the tagline and the chip.
  - Tests (`app.test.tsx`, jsdom, fake-indexeddb): both cards render; both chips read "Live"; the single layout shows below 640 px; `window.limbo` exists in test; Reset demo deletes `limbo:aftershock:a` and `limbo:aftershock:b` and calls an injected reload; with no seed ops the empty state "No sectors reported yet. Tap a sector to report." shows.
  - _Requirements: R1.1, R7.8, R8.1, R8.3 to R8.5, R8.7_

- [x] 14. `SectorGrid`
  - `views/SectorGrid.tsx`: 6 × 4 grid, headers, glyph and word per cell, totals, roving tabindex, arrow, Home, End, Enter and Space handling, selection callback, accessible names, 44 px cells, `data-sector`.
  - Tests: the seed shows 10 cells with a word and 14 `NO REPORT` cells; B2 and E3 read `DAMAGED`, A1 reads `SAFE` and a total of 2; arrows move focus and stop at the edges; Home and End; Enter and Space select and create no op; typing in a text input does not select; each cell's `aria-label` follows R17.3; only one cell has `tabindex="0"`.
  - _Requirements: R7.1, R7.2, R7.10, R17.1, R17.3_

- [x] 15. `SectorCard`
  - `views/SectorCard.tsx` for the selected sector: severity word and glyph, counts by surveyor, total line with "may overlap" beside it, needs chips, note, the instruction line, "scripted edit" slot. Selection is per replica card.
  - Tests: C3 with Sari 2 and Budi 3 reads "5 reported — Sari 2, Budi 3" and `[data-may-overlap]` is a sibling of the total, not inside the instruction line; the instruction "C3 — do not enter" is present for `unsafe` and absent for `safe` and `damaged`; B2 shows rina 3 and sari 1 in roster order (Sari first); the two cards select different sectors independently; names render as text.
  - _Requirements: R7.3, R7.4, R7.9, R4.6_

- [x] 16. `ReportForm`
  - `views/ReportForm.tsx` per R7.5 to R7.7 and design §6: segmented control, stepper, needs chips, note field, Re-inspection checkbox, Save with the diff rules, inline errors, 44 px controls. Wire Save to `actions`.
  - Tests: A saves C3 damaged, 2, "cracked stairwell" and exactly three ops (report, count, note) are created; Save with nothing changed is disabled; a lower report without Re-inspection is not written; with Re-inspection a clear then a report are written in that order; a count of -1 or 2.5, a 281-character note, and Save with no severity on a new sector show an inline error and create no op, keeping typed text; needs write add for newly pressed and unneed for newly unpressed, never both for one need.
  - _Requirements: R7.5 to R7.7, R13.3, R17.2_

- [x] 17. Twin variants
  - `views/SectorTwins.tsx`: note twin and count twin through the layer's `Twin` with the captions, rule lines and buttons of R9.
  - Tests (two real replicas over `createPair`, manual `settle()`): after concurrent notes the caption equals "TWIN · Sari wrote “cracked stairwell” while Budi wrote “gas smell, east wall” · rule: causal-lww" (or the stamp-ordered equivalent the design §7 gives), with one **Keep this note** button per note; a tap clears the twin on both and leaves one note; concurrent different counts from one surveyor show **Keep this count** buttons and the pick clears it; no ghost, caption or button remains after the resolve; the ghost is `aria-hidden`.
  - _Requirements: R9, R10.9, R17.1_

- [x] 18. Inspector and ShuffleTest wiring
  - Render `Inspector` per card (controlled `open`; check that `I` toggles it, else bind `I` in `ReplicaBody` with the layer's input exclusions). `shuffle.worker.ts`, `shuffle-runner.ts`, `views/ShuffleSection.tsx` with the on-screen ops, N = 1,000 and the matching golden or none.
  - Tests: Inspector queued rows equal `view.unacked`; the shuffle test with an injected inline runner prints "1,000 / 1,000 orderings → same state" and, for the seed, "matches the specified result ✓"; after an extra edit no golden line prints; the worker file imports `runShuffle` and `materialize` only.
  - _Requirements: R10.6, R10.7, R12.1 to R12.3_

- [x] 19. ScenePanel and the survey scene in jsdom
  - `views/ScenePanel.tsx`: button shown while the link is down and the scene is unset, six scripted edits with an injectable delay (0 in tests), "scripted edit" tags on the sector card, clear on link up, Reset clears the flag.
  - Test (`survey-scene.test.tsx`, real `createPair`, manual `settle()`): R10.1 to R10.9 on the DOM text in order: fog and "Offline", "3 waiting" on both and the local views (DAMAGED "2 reported — Sari 2" on A, UNSAFE "3 reported — Budi 3" on B), haze "Syncing" before `settle()`, both states equal after, UNSAFE, "5 reported — Sari 2, Budi 3", "may overlap", note twin and "C3 — do not enter", one **Keep this note** tap, deep-equal canonical states, zero twins, FIXED, Inspector order (resolve first, then the six partition ops, each with merge, `l·r·n` and deps) and the Conflicts list with `causal-lww`, shuffle line and golden line. Manual edits (no button) give the same result.
  - _Requirements: R10, R11_

- [x] 20. Solo page
  - `src/devrelay.ts` and the guarded dynamic import in `main.tsx` per R14 and design §8 (import `skeleton/src/sync/dev-relay-link.ts` by path).
  - Tests (`devrelay.test.tsx`, fake fetch over an in-memory relay): the solo page shows `[data-status]`, a `[data-sector]` line for a reported sector, and `window.limbo` with `report`, `count`, `note`; two solo replicas over one fake relay converge on C3 `unsafe` with both counts.
  - _Requirements: R14_

- [x] 21. Production build check and wording scan
  - Unit test spawns `vite build` and asserts the built `dist/` text contains none of `devrelay`, `DevRelayLink`, `window.limbo`, `localhost:5175`, `https://`. A unit test scans the app's non-test sources, `index.html`, `app.css` and `README.md` for "proven", "guaranteed" and for any field-use claim wording, and for colour literals outside tokens. Check the README states demonstration data and no field use.
  - _Requirements: R1.5, R8.6, R8.8, R16_

- [x] 22. E2E (a): the survey scene in one page
  - `playwright.config.ts`: add project `aftershock` (`testMatch: 'aftershock-offline.spec.ts'`, baseURL 5176) and a `webServer` entry for `pnpm exec vite apps/aftershock --port 5176 --strictPort`, beside the others (nothing else changes). `e2e/aftershock-offline.spec.ts` test (a): the tagline and the DEMO DATA chip text; both "Live"; cut the link ("Offline", fog on both); A opens C3 and reports damaged, 2, "cracked stairwell"; B opens C3 and reports unsafe, 3, "gas smell, east wall"; each card's waiting count read from the page equals `window.limbo.queued(id).length`; each side's local view; restore; read "Syncing"; both cards equal and fog lifts; UNSAFE, "5 reported — Sari 2, Budi 3", "may overlap", both notes with a **Keep this note** each, "C3 — do not enter"; tap the "gas smell, east wall" button on A; both deep-equal with 0 twins and FIXED; Inspector newest first with merge, `l·r·n`, deps and the resolved twin with its rule; shuffle line with the count read from the page and "matches the specified result ✓". A second run of the flow uses **Play the survey scene** for the partition edits and asserts each "scripted edit" label and the same end state. Fresh browser context so databases are empty.
  - Run `pnpm e2e`: the spike, BASECAMP and this test pass. Save the output under `evidence/aftershock/e2e/`.
  - _Requirements: R10, R11, R15.1, R15.2, R15.4, R15.5_

- [x] 23. E2E (b): two contexts through the dev relay
  - Test (b) in the same spec per R15.3: `POST /reset`, two contexts at `?devrelay=http://localhost:5175&r=a|b`, `setOffline(true)` on both, A reports C3 damaged and counts 2, B reports C3 unsafe and counts 3, assert no edit crosses over several poll periods (each side's state and the relay log), `setOffline(false)`, wait on state equality, then canonical states deep-equal, C3 `unsafe` on both, counts sari 2 and budi 3 present.
  - Run `pnpm e2e`; save the output under `evidence/aftershock/e2e/`. Run (a) and (b) ten times and record the pass count there (fix the wait, not the assertion, if a run fails).
  - _Requirements: R14, R15.3 to R15.5_

- [x] 24. Final verification and adoption log
  - Run `pnpm typecheck && pnpm test && pnpm props && pnpm e2e`, then `pnpm props:full` (10,000 orderings) and save its output under `evidence/aftershock/`. Measure the skeleton file and line count again with the baseline command and confirm it equals task 1's.
  - List every file changed outside `apps/aftershock/` (expected: `e2e/aftershock-offline.spec.ts`, `playwright.config.ts`, `pnpm-lock.yaml`, and the two kit files of task 6 if accepted; `evidence/aftershock/` additions listed separately as records). Fill `## Adoption log` at the end of `design.md` with, for each: file, why, lines changed; and any skeleton change (target none, with the reason if there is one).
  - Record in the same section the measured test counts from the runs: unit, limbo, props, e2e (passed and total each), the `props:full` result, and the ten-run e2e pass count. Check the README wording ("measured, property-tested", demonstration data, no field use) and that every number on a page is computed live or comes from `evidence/`.
  - _Requirements: R1.2, R1.3, R6.6, R6.8, R15.5, R16_
