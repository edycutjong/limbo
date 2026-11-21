Create a Kiro **feature spec** named `aftershock` (requirements-first, EARS acceptance criteria) under `.kiro/specs/aftershock/`:
`requirements.md`, `design.md`, `tasks.md`. Write only those three files. Do not implement anything yet. Do not run git.
Read `.kiro/steering/*.md` first, then `.kiro/specs/basecamp/` (the sibling app spec; mirror its shape and task granularity),
`.kiro/specs/limbo-layer/`, `.kiro/specs/skeleton-sync/`, and the existing app `apps/basecamp/` (`app.config.ts`, `src/model.ts`,
`src/conflicts.ts`, `src/scene.ts`, `src/seed.ts`, `src/ops/*.op.ts`, `src/views/`, `index.html`, `vite.config.ts`) plus `apps/aftershock/`
(a placeholder: `package.json` and `README.md` only).

## Goal
AFTERSHOCK is app 2 on the LIMBO skeleton: a small team of surveyors fills the same sector report form from several devices while the
network is down, and the reports merge into one shared grid without a lost or downgraded report. It is the **second distinct app** of the
Skeleton Crew entry: BASECAMP is an ordered list on the skeleton's named merges; AFTERSHOCK is a **set of keyed records on a drawn grid**
whose fields merge by rules the **app itself declares as `commutes` ops**. A static Vite + React SPA in `apps/aftershock/` that uses
`@limbo/skeleton` **unchanged**: everything sector-specific lives in the app. Success metric: **zero files changed outside
`apps/aftershock/`** (besides `e2e/`, `playwright.config.ts` and `pnpm-lock.yaml`). If a skeleton change is truly unavoidable, make it
the smallest possible, and record it in a section `## Adoption log` at the end of `design.md` (file, why, lines). Header line of the page
(first line, who it is for): "For small teams who fill the same form when the signal is gone." A permanent **DEMO DATA** chip in the
header: "Demonstration data shape — not used in the field". No field use is claimed anywhere in the app.

## The flow it must nail (the judge's path; the e2e asserts every line)
Pair view (replica A = Sari, id `a`; replica B = Budi, id `b`; fixed ids so the result is reproducible), seeded "Block 7 survey", both "Live":
1. Cut the link → both cards fog over; chip "Offline".
2. A opens sector **C3** and reports **damaged**, **2 people**, note "cracked stairwell". B opens C3 and reports **unsafe**, **3 people**,
   note "gas smell, east wall". Each side: "N waiting" with the wisps. C3 shows the local view only.
3. Restore → wisps cross; haze "Syncing …"; when both directions are done both cards hold the same state and the fog lifts.
4. C3 shows **UNSAFE** on both (max severity; a concurrent report never lowers it), **5 reported — Sari 2, Budi 3 (may overlap)**, both
   notes as twins (value twin: one button per note, the tap writes a pick-one value that observes both), and the sector card ends in the
   instruction line **"C3 — do not enter"**. "may overlap" sits beside the total, not on the instruction line.
5. A taps one note → the resolve op syncs; both cards deep-equal with 0 twins; the FIXED stamp fires.
6. Inspector on A: Recent exchanges newest first, each op with merge, stamp `l·r·n`, deps; Conflicts lists the resolved twin and its rule.
7. Shuffle test over the ops on screen prints the count it ran and "matches the specified result ✓" against the golden outcome of the seed
   script.
A **Play the survey scene** button appears once the user has cut the link and performs step 2 on both cards, each action labelled
"scripted edit"; the user then restores and taps the resolve. Manual edits stay possible at every step.

## Features and merge rules (all in `apps/aftershock/src/ops/`; create them as `*.op.ts` so the hooks scaffold their `*.props.test.ts`)
- `sector.report` — payload `{sector, severity}` with severity in `safe < damaged < unsafe`; merge `commutes`, declared intent: the
  severity of a sector is the **max over reports not covered by a clear** (a max-lattice). A concurrent report never lowers it.
- `sector.clear` (re-inspection) — an observing op: it covers exactly the reports it has *seen* (its causal deps), so a re-inspection that
  saw "unsafe" may lower the severity, while a concurrent new report is never cleared. Merge `commutes`.
- `sector.count` — one `causal-lww` integer register **per surveyor**: target `<sector>#<who>`, intent `set`. Total = Σ each surveyor's
  current count, shown with names ("Sari 2, Budi 3"). No surveyor's count is ever lost.
- `sector.need` / `sector.unneed` — needs chips (water, medical, shelter, food, power): an **add-wins set**, merge `commutes`, intent
  `add-remove`.
- `sector.note` — `causal-lww` string; concurrent different notes surface as a **value twin** (Keep this note buttons); the resolve is a
  pick-one value that observes both, as BASECAMP does for item names.
Every op declares `merge` AND `intent` like the BASECAMP ops do. No wall clock anywhere. Never weaken a property or the vacuity guard.
Wire the app's own mixed-script app-level property (see `apps/basecamp/src/ops/app.props.ts`) for the AFTERSHOCK op set.

## Views `apps/aftershock/src/views/`
`SectorGrid` (drawn 6 × 4 grid A–F × 1–4, no map tiles; each cell shows severity glyph + word SAFE / DAMAGED / UNSAFE, a non-colour cue,
and the count; keyboard navigable, roving focus), `SectorCard` (the selected sector: severity, counts by surveyor, needs chips, notes
and twins, the instruction line once UNSAFE), `ReportForm` (severity segmented control, "people found" stepper, needs chips, note field;
Save writes the ops), the twin variants through the skeleton's `Twin`, the empty/first-load state ("No sectors reported yet. Tap a
sector to report."), and a clear error state for a rejected form value. Pair view by default ≥ 640 px, single replica below
(`?replicas=1|2` override); everything from the `limbo-layer` components; same costume as BASECAMP. Surveyors: replica `a` acts as
Sari, `b` as Budi (a third seeded surveyor Rina exists only in the seed).

## Seed `apps/aftershock/src/seed.ts`
A deterministic op script authored by the fixed replica `seed` with fixed counters, "Block 7 survey": 24 sectors A1–F4; **10 sectors
reported — 8 SAFE, B2 and E3 DAMAGED**; counts on 4 sectors (Sari, Budi, Rina); needs chips on 3 sectors (water, medical, shelter). A test
prints the sha256 of the seed's canonical JSON and asserts it is stable. `app.config.ts` exports `name`, `defs`, `materialize`,
`describeConflicts`, `twinCount`, `seedOps`, `goldens` exactly like BASECAMP's.

## Shell
`apps/aftershock/index.html`, `vite.config.ts` (`base: './'`, port **5176**, strictPort, static `dist/`), `app.config.ts`, `src/main.tsx`;
`pnpm --filter @limbo/aftershock dev|build|preview`; a root `typecheck` that covers the app. Expose `window.limbo` in dev and test
builds only (as BASECAMP does) for the e2e. The root `tsconfig.json` and `vitest.config.ts` must pick up the new app.

## E2E `e2e/aftershock-offline.spec.ts` (Playwright; add a project and webServer for port 5176 next to BASECAMP's; keep the other tests working)
(a) the pair-view flow 1–6 above in one page, asserting the on-screen text and that the two replicas' canonical states deep-equal at the
end; (b) two browser contexts, each a single replica, joined by the dev-only `DevRelayLink` exactly as BASECAMP's test (b) does:
both `setOffline(true)` → A reports C3 damaged, B reports C3 unsafe → while offline **no** edit crosses → `setOffline(false)` →
canonical states deep-equal, C3 UNSAFE on both, both counts present.

## Properties
Every new op gets its scaffolded `*.props.test.ts` and registers in `registry.gen.ts` (the hooks do this when you create `*.op.ts`).
`pnpm props` stays green at the fast tier and the full tier (`pnpm props:full`, 10,000 orderings) must still pass at the end.
If a property fails, fix the op.

Each task must end with `pnpm typecheck && pnpm test && pnpm props` green (plus `pnpm e2e` for the e2e tasks). Keep tasks small,
numbered, with requirement ids; put the e2e tasks last. The last task records the adoption log in `design.md` (files outside
`apps/aftershock/` that had to change; target 0) and states the measured test counts.
