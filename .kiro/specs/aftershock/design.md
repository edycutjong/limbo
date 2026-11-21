# Design: aftershock

Requirements: `requirements.md` (R1 to R17). The op contract in `.kiro/steering/local-first.md` is binding. Wording: "measured, property-tested".

## 1. What exists, what this spec adds

| Exists | Used as is |
|---|---|
| `skeleton/src/core` | `causalLww` (counts, notes), `causalBuffer`, `covers`, `compareStamp`, `canonical`, `simulate` |
| `skeleton/src/sync` | `createPair`, `createReplica`, `attachLink`, `deriveSync`, `deleteStore`, `makeSeedOps`, `dev-relay-link.ts` (BASECAMP already added it) |
| `skeleton/src/limbo` | `LimboShell`, `ReplicaPair`, `Inspector`, `Twin`, `ShuffleTest`, `runShuffle` |
| `kit/props` | `maxIntent`, `setIntent`, `addRemoveIntent`, `conflictGen`, `AppProps`, goldens, mutants (`severity-lww` already exercises `max`), `intents.json` |
| `e2e/spike/relay.mjs` | store-and-forward server for e2e (b) |

Nothing in `skeleton/` changes. No new merge is added to `merges.ts`: severity and needs are app-declared `commutes` ops, counts and notes use `causalLww`. That is the difference from BASECAMP, whose expense split needed `sumSplit`, and the reason this app needs no skeleton work. The skeleton budget is measured before and after (task 1 and task 21) with the command in `evidence/budget-basecamp-baseline.md` and must be equal.

Files outside `apps/aftershock/` that change: `e2e/aftershock-offline.spec.ts` (new), `playwright.config.ts`, `pnpm-lock.yaml`, and, if accepted, `kit/props/intents.json` plus `kit/props/manifest.test.ts` (§10 point 1). The root `tsconfig.json` and `vitest.config.ts` already glob `apps/*/src/**/*.ts(x)` and `apps/*/*.ts`, so the new app is picked up with no edit (task 1 verifies, and records an adoption-log entry only if it is false).

## 2. App layout

```
apps/aftershock/
  index.html  vite.config.ts  app.config.ts  app.css  package.json  README.md
  src/
    main.tsx            boot: pair or dev-relay solo, mount, window.limbo (dev/test)
    members.ts          a->sari, b->budi, roster sari,budi,rina, display names, authorOf(op)
    model.ts            sector fold
    conflicts.ts        describeConflicts, twinCount
    actions.ts          op creation helpers (one per user action)
    sectors.ts          SECTOR_IDS (A1..F4, column letter + row), NEEDS, SEVERITIES, ORDER
    seed.ts             seed script, seedOps
    scene.ts            survey scene script, goldens (ids + hand-written states)
    shuffle.worker.ts   worker entry: runShuffle + materialize
    shuffle-runner.ts   worker-backed ShuffleRunner
    devrelay.ts         solo replica over DevRelayLink (dev/test only, dynamic import)
    views/
      ReplicaBody.tsx   grid + card + form + empty state for one replica
      SectorGrid.tsx  SectorCard.tsx  ReportForm.tsx  SectorTwins.tsx
      ScenePanel.tsx    Play the survey scene, "scripted edit" tags
      ShuffleSection.tsx
    ops/
      sector.report.op.ts  sector.clear.op.ts  sector.count.op.ts
      sector.need.op.ts  sector.unneed.op.ts  sector.note.op.ts
      sector.state.ts        shared severity and needs state (not an op file)
      app.props.ts           mixed-script hook: { materialize }
      sector.severity.props.test.ts   companion: report + clear together (R6.3)
      (each op: *.props.ts, *.props.test.ts scaffolded; registry.gen.ts generated)
```

`*.test.ts` run in `unit`, `*.test.tsx` in `limbo` (jsdom), `*.props.test.ts` in `props`. The root `vitest.config.ts` globs already cover `apps/*/src/**`. Vite builds the TSX with its default esbuild transform, as BASECAMP does.

## 3. Ops

| Op | Merge | Intent | Payload | Target |
|---|---|---|---|---|
| `sector.report` | commutes | `max` (`severity`, order `safe,damaged,unsafe`) | `{ severity }` | `<sector>` |
| `sector.clear` | commutes | `max` (same) | `{}` | `<sector>` |
| `sector.count` | causal-lww | `set` (`count`) | `{ count }` integer 0..100000 | `<sector>#<who>` |
| `sector.need` | commutes | `add-remove` (`needs`) | `{ need }` | `<sector>` |
| `sector.unneed` | commutes | `add-remove` (`needs`) | `{ need }` | `<sector>` |
| `sector.note` | causal-lww | `set` (`note`) | `{ note }` at most 280 chars | `<sector>` |

Each file starts with its intent sentence, as BASECAMP's ops do.

### 3.1 Severity: a max-lattice with an observing clear (`sector.state.ts`)

State shared by `sector.report` and `sector.clear` (each keeps its own writes by op id and re-derives `severity`, so order and duplicates cannot change it):

```ts
interface SeverityState {
  reports?: Record<string, Op<{ severity: Severity }>>;   // by op id
  clears?: Record<string, Op<{}>>;
  severity?: Record<string, Severity | undefined>;       // by target, derived
}
severityOf(reports, clears) =
  max over r in reports, r.target = t, where no clear c on t has covers(c, r), by index in ORDER; undefined if none
```

`covers(c, r)` is `c.deps[r.stamp.r] >= r.stamp.n` from `skeleton/src/core/causal.ts`. Because `deps` is the creator's version vector at op creation, a clear covers exactly the reports its replica had applied. A report made concurrently is not in that vector, so it survives the clear and the severity may rise again. A report made after the clear covers the clear's own reports but is itself not covered. The lattice join is `max`, which commutes, associates and is idempotent; the clear removes members only through causality, so the fold is a pure function of the op set.

Why this is not LWW: a later, lower report must not overwrite a higher one (`severity-lww` mutant in `kit/props/bad/`). Why the clear exists: without an observing remove the severity could never fall, and a re-inspection that finds the building safe would be impossible. A clear that ignores `deps` would also clear concurrent reports; the companion property (§9) holds a mutant of that kind.

### 3.2 Counts: one register per surveyor

Target `<sector>#<who>`: `who` is the surveyor id (`sari`, `budi`, `rina`). Each target is an independent `causalLww` register (state like `item.rename`: writes by op id, value re-derived). The sector total is the sum of the current value of each of its surveyors' registers. Two surveyors counting the same sector offline therefore both count (Sari 2, Budi 3). The total may overlap in the physical world (the same person counted twice); the UI says so and the model does nothing to hide it. Target ids contain `#`, sector ids never do (`SECTOR_IDS` are a letter and a digit). The model splits at the first `#`.

### 3.3 Needs: add-wins set

`present(adds, removes)` is the same rule BASECAMP uses for expense members, re-implemented in `sector.state.ts` over skeleton `covers` (the app does not import from `apps/basecamp/`): a need is present iff some `sector.need` of it is not covered by a `sector.unneed` of it. State keeps `needAdds` and `needRemoves` by op id and derives `needs` per target, sorted by UTF-16 code unit. The two ops share the state helpers `applyNeedOp(s, op, 'add' | 'remove')`.

### 3.4 Notes

`sector.note` follows `item.rename`: writes by op id, value from `causalLww(...).value`. Different concurrent frontier values are a twin (`values` in the model). An equal text collapses. The resolve is a new `sector.note` made after both are held, so it covers both and is the only frontier value.

### 3.5 Intent manifest

`intents.json` maps five of the six ops. `sector.unneed` is missing, and `manifest.test.ts` pins the manifest to exactly 18 names. Registering it takes two kit edits (R3.7, §10 point 1). The `max` entries carry no `field` or `order` in the manifest, so the harness compares the kind only; the op declares `field` and `order` itself (the `Intent` type requires `order` for `max`).

## 4. Model (`model.ts`)

```ts
type Severity = 'safe' | 'damaged' | 'unsafe';
interface Sector {
  id: string;
  severity: Severity | undefined;
  reports: number;                                           // uncovered reports
  counts: { who: string; value: number; values: { by: string; value: number }[] }[];
  total: number;
  needs: string[];
  note: string | undefined;
  noteValues: { by: string; value: string }[];               // only while twinned, ascending stamp
}
interface State { sectors: Record<string, Sector> }
```

`by` is the author replica id (`stamp.r.split('#')[0]`, so `a`, `b` or `seed`). `members.ts` maps it to a name. The model holds no display names.

Fold: causal buffer over any order with duplicates, group applied ops by sector (`target.split('#')[0]`), then per sector: severity from `severityOf`, `reports` = the number of uncovered reports, counts from one `causalLww` per `who`, `needs` from `present`, note from `causalLww`. `values` and `noteValues` come from `frontier(r)` (winner plus twins, ascending stamp), empty unless twinned. A sector exists iff some applied op names it. A target with no `#` on `sector.count` gets `who = ''`, which is kept out of `counts` display but still folds, so the mixed generator's `t0..t5` targets cannot throw. Surveyor order is the roster `sari, budi, rina`, then other ids by code unit.

## 5. Conflicts and resolve actions

`conflicts.ts`:

```ts
export function describeConflicts(s: State): ConflictDescriptor[]   // ordered by (target, rule, id)
export const twinCount = (s: State): number => describeConflicts(s).length;
```

| Source | Descriptor id | rule |
|---|---|---|
| `noteValues.length > 1` | `${id}:note` | `causal-lww` |
| a count with `values.length > 1` | `${id}:count:${who}` | `causal-lww` |

Severity and needs yield no descriptor (§10 point 2). `actions.ts` creates ops with `replica.local(name, target, payload)`:

| Action | Op | Why it resolves |
|---|---|---|
| Keep this note | `sector.note { note }` | covers both frontier writes, becomes the only frontier value |
| Keep this count | `sector.count { count }` on `<sector>#<who>` | same |
| Save with re-inspection | `sector.clear {}` then `sector.report { severity }` | the clear covers the reports it saw; the report covers the clear |

`memberOf(replica)` is `sari` for `a`, `budi` for `b`, else the replica id. Count target: `` `${sector}#${memberOf(replica)}` ``. Every action is one explicit value; none reads current state to compute a delta or a flip.

## 6. App assembly and views

`main.tsx`: `App` renders `<main>` with `<h1>AFTERSHOCK</h1>`, then `<p>` with the tagline, then the DEMO DATA chip (a `role="note"` element, not dismissible). With a pair: `LimboShell` → `ReplicaPair` (`names {a:'SARI', b:'BUDI'}`, `plate {a:1,b:2}`, `onReset` = `deleteStore` both then reload, `renderReplica` → `ReplicaBody`) → `ScenePanel` → `ShuffleSection`. The dev branch is behind the literal `import.meta.env.DEV || import.meta.env.MODE === 'test'` that Vite replaces with `false` in production, as BASECAMP does. `window.limbo` is assigned in the same guarded branch.

`ReplicaBody({ id })` reads `useLimbo(id)` and `replica.state()`, keeps local presentation state `selected: string | undefined` and `inspector: boolean`, and renders: the grid; the empty state when no sector has a severity; the card and form for `selected`; the Inspector (controlled `open`, as BASECAMP).

| View | Notes |
|---|---|
| `SectorGrid` | `role="grid"`, 4 rows of 6 gridcells, column headers A–F and row headers 1–4. Roving `tabindex` held in the grid's state; `onKeyDown` handles arrows (clamped), Home, End, Enter, Space (`preventDefault`), ignored when the target is a text input. Cell text: id, glyph (`✓` safe, `▲` damaged, `✖` unsafe, `–` none, all `aria-hidden`), the word, the total. Cell `aria-label` as R17.3. |
| `SectorCard` | severity word and glyph; counts list in roster order; total line `5 reported — Sari 2, Budi 3` with `<span data-may-overlap>may overlap</span>` beside it; needs chips; note; `SectorTwins`; the instruction line `<p data-instruction>C3 — do not enter</p>` only when `severity === 'unsafe'`; "scripted edit" tags from the scripted-ids set. |
| `ReportForm` | segmented control (`role="radiogroup"` with three radios), stepper (`<input type="number" inputMode="numeric">` plus minus and plus buttons that edit the draft value, not the register), needs chips (`aria-pressed`), note `<textarea>`, Re-inspection checkbox, Save. A draft is local state. Save diffs the draft against the sector and calls `actions` (R7.6). Inline errors have `role="alert"`. |
| `SectorTwins` | note twin and count twin through `Twin` (`atRest` = the current value, `ghost` = the other value, caption per R9, rule `causal-lww`, one button per frontier value). |

Form diff (R7.6), over the sector `s` and this surveyor `me` (`s.counts` entry for `me`):

```
severity:  draft.severity set && (s.severity === undefined || draft.severity !== s.severity) → report
           with Re-inspection checked → clear first, then report (even if equal)
count:     draft.count set && (no entry for me || draft.count !== entry.value) → count
needs:     for each need: pressed && !present → need; !pressed && present → unneed
note:      draft.note !== '' && draft.note !== s.note → note
```

Comparing to `s.severity` (the lattice value) means a surveyor cannot "lower" a sector without Re-inspection, which is the point: a plain lower report would be absorbed by the max.

`shuffle.worker.ts` imports `runShuffle` and the app's `materialize` only. The goldens are the two of §7.

## 7. Seed, scene and why they are deterministic

`seed.ts` (replica `seed`, counters 1..18, `makeSeedOps(defs, script)`):

| Counter | Op | Target | Payload |
|---|---|---|---|
| 1–10 | `sector.report` | A1, A3, B1, B2, C1, D1, D2, E1, E3, F1 (sector order) | safe, except B2 and E3 damaged |
| 11 | `sector.count` | `A1#sari` | 2 |
| 12 | `sector.count` | `A3#budi` | 1 |
| 13 | `sector.count` | `B2#rina` | 3 |
| 14 | `sector.count` | `B2#sari` | 1 |
| 15 | `sector.count` | `E3#rina` | 2 |
| 16 | `sector.need` | `B2` | water |
| 17 | `sector.need` | `E3` | medical |
| 18 | `sector.need` | `A3` | shelter |

(Eight safe: A1, A3, B1, C1, D1, D2, E1, F1.) After the seed each replica's next Lamport counter is 19.

Fresh databases, fixed replica ids `a` and `b` and `createReplica`'s namespace `${id}#${k}` with `k = 1` give ids `a#1:n` and `b#1:n`. `surveyScript` performs, alternating A then B: report (`l = 19`), count (`l = 20`), note (`l = 21`). Both replicas make the same Lamport counter at each step, since neither has seen the other, so stamps tie on `l` and `compareStamp` breaks the tie by `r`: `a#1` sorts before `b#1`. Consequences, asserted by task 9's unit test over a real `createPair`:

- Ids: A `a#1:1..3`, B `b#1:1..3`.
- After restore the note frontier holds both notes. `causalLww` picks the higher stamp (`b#1`'s "gas smell, east wall") as the winner and surfaces Sari's as the twin. Which one shows as the ghost depends on that order, but both are on screen with a button each.
- Severity: the two reports are concurrent; `max` gives `unsafe` in every order.
- Counts: registers `C3#sari` = 2 and `C3#budi` = 3; total 5.
- The resolve by A is `a#1:4` with `l = 22` (A has seen `l = 21`), covers both notes, and carries "gas smell, east wall" in the golden, because the e2e taps that note (it is the safety-relevant one, and the golden must pick one). The first note-twin button on either card is therefore the one the e2e taps by its text, not by position.

`scene.ts` exports:

```ts
export const surveyScript: { replica: 'a'|'b'; run(r: Replica): Op }[]   // the six partition edits
export const goldens: Golden[]   // [{ opIds, state }] for the seed and for the finished scene
export const SEED_OP_IDS, PARTITION_OP_IDS, RESOLVE_OP_IDS
```

Golden `state` strings are canonical JSON written by hand (a literal in `scene.ts`, built from stated field values, not from `materialize`). The finished scene's C3: severity `unsafe`, `reports` 2, counts sari 2 and budi 3, total 5, needs `[]`, note "gas smell, east wall", `noteValues` `[]`. A unit test asserts the stated expectations field by field and that `canonical(materialize(ops))` equals the literal in several fixed shuffled orders. If the two disagree, a human decides which is wrong.

`ScenePanel` runs `surveyScript` with a presentation delay (350 ms between edits, an injectable prop, 0 in tests). Each op id it created goes into a presentation set, rendered as "scripted edit" on the sector card of the sector it changed. The set clears when the link goes back to `up` (a read of the view, not a timer). The button shows while `view('a').link === 'down'` and the scene flag is unset. **Reset demo** clears the flag.

## 8. DevRelayLink and the solo page

`skeleton/src/sync/dev-relay-link.ts` exists (BASECAMP, design §9) and is imported by path, behind the guarded dynamic import. `devrelay.ts` `mountSolo({ url, r, el?, fetch?, pollMs?, store? })` mirrors BASECAMP's: `openStore('limbo:aftershock:solo-'+r)`, `createReplica`, `attachLink(replica, createDevRelayLink(...))`, a text render (`<p data-status>` and one `<li data-sector="C3">C3 · unsafe · 5 · note</li>` per sector), and `window.limbo = { ready, state, ops, queued, report(sector, severity), count(sector, n), note(sector, text) }`. It does not use `LimboShell`.

Test (b) in the e2e relies on browser offline mode rejecting `fetch`, so the link reads `down` and ops stay queued; both contexts then go online and the poll chain delivers. The relay has no timer and does no merge.

## 9. Properties

| Op | `*.props.ts` | kit intent | targets / payloads |
|---|---|---|---|
| `sector.report` | `maxIntent` over reports only: `read` = `severity[target]` | `max` | `t0..t5`; severity from a 3-value pool (hot: 2 values) |
| `sector.clear` | `maxIntent` with `isClear`, trivial alone; the real check is the companion | `max` | `t0..t5`, payload `{}` |
| `sector.count` | `setIntent` on `count` | `set` | `C3#sari`, `C3#budi`, `D1#sari`, `D1#budi`; counts from `[0,1,2]` hot, `0..9` wide |
| `sector.need` | `addRemoveIntent` | `add-remove` | needs from a 2-value hot pool |
| `sector.unneed` | `addRemoveIntent` (add and remove roles as in BASECAMP's member ops) | `add-remove` | same |
| `sector.note` | `setIntent` on `note` | `set` | note from `['cracked stairwell','gas smell']` hot |

`sector.severity.props.test.ts` (companion, props project): for `i` in `0..config.orderings`, `simulate({ defs: [report, clear], replicas: cfg.replicas, seed: cfg.seed + i, steps, init, gen })` where `gen` draws targets from a small pool and clears with probability 0.25, then `maxIntent({ order, report: o => o.op === 'sector.report' ? payload.severity : undefined, isClear: o => o.op === 'sector.clear', read })` over `res`. The oracle in `kit/props/intent/max.ts` reads raw `deps` and stamps only, so a bug in `severityOf` cannot hide in it. A second loop runs the same oracle on a local wrong variant, `clearAll` (a clear that removes every report on the target, ignoring `deps`), over the same seeds and asserts at least one run fails. The fixture is local to the test file; it does not edit `kit/props/bad/`. If `simulate` with two defs cannot build the shared state, the task falls back to `applyAll` over the sorted log and says so.

`app.props.ts` exports `app: AppProps = { materialize }`. `AppProps` has `life`, `claim` and `move` slots only, so the mixed sweep checks app convergence, replay equivalence and idempotence over all six ops; the vacuity guard classifies the same runs. AFTERSHOCK has no create/delete, claim or move op, so those three kit classes are `n/a` by the guard's own rule. The `max` and `add-remove` intents are checked per op and in the companion. A `max` slot in `AppProps` would be a kit change and is open point 3.

## 10. Decisions and open points

1. **`sector.unneed` and the manifest.** The brief names `sector.need` and `sector.unneed`. The kit manifest lists `sector.need` but not `sector.unneed`, and `manifest.test.ts` pins exactly 18 names. This design adds the two ops as written, which costs two kit edits (one JSON line, and the expected map and the count 18 to 19 in the test). Alternative with zero outside edits: one op `sector.need { need, on: boolean }`, where `on: false` is an observing remove (an explicit value, never a toggle), declared `add-remove` as the manifest already says. The owner picks; task 3 follows the choice and says which.
2. **Severity and needs are not twins.** Rule 7 says a conflict the user should see becomes a twin. A max-lattice and an add-wins set lose nothing, and there is nothing for the user to decide. The visible disclosure is "may overlap" next to the total (R7.4). Say so if you want a concurrent-report notice.
3. **`AppProps` has no `max` or `add-remove` slot.** The mixed sweep therefore does not check those intents on the app fold. They run per op and in the companion file. A kit slot would be a separate kit spec.
4. **Severity cannot be lowered without Re-inspection.** A plain lower report is absorbed by the max. This is the specified behaviour, and the form says so beside the checkbox.
5. **"may overlap".** Two surveyors may count the same person. The merge adds registers, so the total can exceed the real number. The rule is shown, not hidden.
6. **Scripted op ids.** The scene golden depends on fresh databases. It stops matching after a manual detour, and the page then prints no golden line (R12.3).
7. **Solo page.** The dev relay page does not use `LimboShell`.
8. **Fast-check cost.** Six new ops add six props suites and one companion to `pnpm props`. The fast tier stays at the configured 500 orderings. `pnpm props:full` runtime is measured at the end and recorded.
9. **Note ghost.** Which of the two notes is the ghost follows the stamp tie-break (`b#1` wins). The e2e therefore finds buttons by note text.

## 11. Test plan

| Area | Test | Project |
|---|---|---|
| sector state | `severityOf` examples (clear observing, concurrent report survives, all cleared), `present`, ids not order | unit |
| ops | six `*.props.test.ts` through `runOpProperties` | props |
| severity | `sector.severity.props.test.ts` (companion and `clearAll` mutant) | props |
| mixed | `app.props.ts` sweep, vacuity classes `lww-equal`, `lww-different` | props |
| manifest | `manifest.test.ts` updated for `sector.unneed` (if accepted) | unit |
| seed | sha256 constant, determinism, expected materialization (R2.7) | unit |
| model | counts per surveyor, total, twin values, absent sector, `t0` target without `#` | unit |
| conflicts | table of §5, count equals descriptors, ids equal on two replicas | unit |
| actions | each resolve clears its twin over two real replicas; no toggle | unit |
| views | grid keys and roving focus, cell labels, card, instruction line only for unsafe, form diff and errors, empty state | limbo (jsdom) |
| scene | survey scene over a real `createPair` with manual `settle()`: R10.1 to R10.9 on the DOM | limbo |
| goldens | R12.4 | unit |
| wording | R16.1 scan | unit |
| build | `vite build` then scan `dist/` (R8.6) | unit (spawns the build) |
| e2e | `e2e/aftershock-offline.spec.ts` (a), (b) | Playwright |

`playwright.config.ts` gains a project `aftershock` (`testMatch: 'aftershock-offline.spec.ts'`, baseURL 5176) and a `webServer` entry `pnpm exec vite apps/aftershock --port 5176 --strictPort` (url `http://localhost:5176/`, `reuseExistingServer: !process.env.CI`). `workers: 1` stays, because test (b) shares the relay on 5175 with the other specs and each resets it.

## Adoption log

Filled by task 24. Changes are measured as `git diff --numstat bc56fe3 HEAD` (the spec commit to task 23), excluding `apps/aftershock/`, `evidence/` and `.kiro/`.

### Files changed outside `apps/aftershock/`

| File | Why | Lines (added / removed) |
| --- | --- | --- |
| `e2e/aftershock-offline.spec.ts` (new) | Playwright tests (a) the survey scene in one page (manual and scripted) and (b) two contexts through the dev relay (R15). | 285 / 0 |
| `playwright.config.ts` | Project `aftershock` (baseURL 5176) and a `webServer` entry for the app. | 6 / 0 |
| `pnpm-lock.yaml` | Lockfile entries for the new workspace package `apps/aftershock`. | 10 / 0 |
| `kit/props/intents.json` | Task 6 accepted: entry `sector.unneed` with kind `add-remove`. | 1 / 0 |
| `kit/props/manifest.test.ts` | Task 6 accepted: `sector.unneed` in `EXPECTED`, count 18 to 19 in the name and the assertion. Nothing else weakened. | 3 / 2 |
| `vitest.config.ts` (not in the expected list) | Added `testTimeout: 60_000` to the `limbo` project, with a comment. The survey-scene tests run the 1,000-ordering shuffle in jsdom (3 to 7 s alone, more under parallel load). Added in the task 19 commit (`8378f3e`). The `apps/*` globs themselves needed no edit. No test was skipped or weakened. | 2 / 0 |

`.gitignore` also has an uncommitted one-line addition (`.vercel`) from a deploy, not part of the aftershock tasks. `site/` is a new top-level folder outside `apps/aftershock/`; it is not part of this task's adoption count.

`evidence/aftershock/` additions are records, not code changes: `budget-baseline.md`, `e2e/` (run outputs and `ten-runs.txt`), `final-typecheck.txt`, `final-unit.txt`, `final-unit-project.txt`, `final-limbo-project.txt`, `final-props.txt`, `final-e2e.txt`, `props-full-run1-vitest-rpc-timeout.log`, `props-full-run2.log`, and `evidence/convergence/full-2026-11-21-aftershock.json`.

### Skeleton change

None. `git diff bc56fe3 HEAD -- skeleton` is empty. Measured again at task 24 with the baseline command: 21 files, 2142 non-blank, non-comment lines, equal to task 1 (`evidence/aftershock/budget-baseline.md`: 21 files, 2142 lines). Budget: at most 30 files and 2,400 lines.

### Measured runs (task 24, final tree)

| Run | Result | Evidence |
| --- | --- | --- |
| `pnpm typecheck` | exit 0 | `evidence/aftershock/final-typecheck.txt` |
| `pnpm test` (`unit` + `limbo`) | 78 files, 606 passed of 606 | `final-unit.txt` |
| project `unit` | 47 files, 450 passed of 450 | `final-unit-project.txt` |
| project `limbo` | 31 files, 156 passed of 156 | `final-limbo-project.txt` |
| `pnpm props` | 22 files, 320 passed, 9 skipped (329 total), exit 0 | `final-props.txt` |
| `pnpm e2e` | 6 passed of 6 (spike 1, basecamp 2, aftershock 3), exit 0 | `final-e2e.txt` |
| aftershock e2e ten runs (task 23) | 10 of 10 runs passed, 30 of 30 tests (3 per run) | `evidence/aftershock/e2e/ten-runs.txt` |

### `props:full` (10,000 orderings, 3 replicas, seed 20251031)

Run by the orchestrator, not by task 24 (about 16 minutes each, longer than the session watchdog).

- Run 1 (`props-full-run1-vitest-rpc-timeout.log`): 22 files, 320 passed, 9 skipped, 1053 s. Vitest reported one unhandled error, `[vitest-worker]: Timeout calling "onTaskUpdate"` (a worker-to-main RPC timeout during the long run), so the exit code was 1 although no test failed.
- Run 2 (`props-full-run2.log`, `evidence/convergence/full-2026-11-21-aftershock.json`): 22 files, 320 passed, 9 skipped, 930 s, exit 0. The JSON records `orderings` 10000, `replicas` 3, `seed` 20251031, `passed` true, 0 failures for every property, `durationMs` 931298.

Convergence is measured, property-tested. These runs say nothing beyond the generated histories and the seed.

### Wording check

`apps/aftershock/README.md` states that convergence is measured, property-tested, not proven, and that the data is demonstration data with no field use claimed. The wording scan unit test (task 21) passes in `pnpm test`.
