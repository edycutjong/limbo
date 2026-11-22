<div align="center">
  <img src="docs/assets/icon.svg" alt="LIMBO icon" width="144">
  <h1>LIMBO 🌫️</h1>
  <p><em>The signal died at the lake. The conflicts came back as ghosts.</em></p>
  <img src="docs/assets/readme-hero-animated.svg" alt="LIMBO: two replicas, drawn as phones, fog silver offline; reconnected, the fog lifts and a cyanotype ghost tent waits for one tap." width="100%">

  <br/>

  [![Live Demo](https://img.shields.io/badge/🚀_Live-Demo-06b6d4?style=for-the-badge)](https://basecamp.limbo.edycu.dev)
  [![For judges](https://img.shields.io/badge/For_judges-60_second_path-1F4E79?style=for-the-badge)](https://limbo.edycu.dev/judge)
  [![Built for Kiroween](https://img.shields.io/badge/Devpost-Kiroween_Skeleton_Crew-8b5cf6?style=for-the-badge)](https://kiroween.devpost.com/)

  <br/>

  ![TypeScript](https://img.shields.io/badge/TypeScript-3178C6?style=flat&logo=typescript&logoColor=white)
  ![React](https://img.shields.io/badge/React-20232a?style=flat&logo=react&logoColor=61DAFB)
  ![Vite](https://img.shields.io/badge/Vite-646CFF?style=flat&logo=vite&logoColor=white)
  ![Yjs](https://img.shields.io/badge/Yjs_13.6.33-333?style=flat)
  ![Built with Kiro](https://img.shields.io/badge/Built_with-Kiro-8b5cf6?style=flat)
  [![Release](https://img.shields.io/github/v/release/edycutjong/limbo?sort=semver)](https://github.com/edycutjong/limbo/releases/latest)
  [![License](https://img.shields.io/badge/License-MIT-yellow)](https://opensource.org/licenses/MIT)

</div>

---

## 📸 See it in Action

**For people whose shared list breaks when the signal does, and for the builders who need offline merges that do not diverge.**

- **Problem:** a shared list that needs the network breaks when the signal does, and last-write-wins quietly drops an edit.
- **Solution:** a lean local-first skeleton where every operation declares how it merges. An item deleted on one replica while it was edited on the other comes back as a ghost twin, and a lost claim is shown to its owner, instead of either vanishing.
- **What is built:** the skeleton (`skeleton/`), **two distinct apps** on it in two folders (`apps/basecamp/`, `apps/aftershock/`), and the `/.kiro` kit (steering, hooks, custom agents, specs) under which Kiro built them. A Kiroween **Skeleton Crew** entry. Convergence is a measured, property-tested claim, not a proof ([The number](#the-number)).


Live, no install, works offline after the first load:
- **BASECAMP**, a group trip list: https://basecamp.limbo.edycu.dev
- **AFTERSHOCK**, a field form whose sector reports merge into a shared grid (demo data only; no field use is claimed): https://aftershock.limbo.edycu.dev
- The landing page: https://limbo.edycu.dev

Both pages show two replicas side by side, **REPLICA A — SARI** and **REPLICA B — BUDI**, joined by an in-page simulated link
(DevTools "offline" does not cut it, so the cord is labelled as simulated):
1. Press **Cut link**. Both cards fog over and count their waiting edits.
2. Press **Play the lake scene**: Sari ticks the tent while Budi deletes it, and both claim the last stove.
3. Press **Restore link**. The tent returns as a ghost **twin**; the stove goes to one claimant on both replicas.
   The fog lifts once both sides agree. Tap **Keep** on the twin and **OK** on the lost claim to get the **FIXED** stamp.
   **Your own edit, not the scene:** type an item into **Add an item** on A (it appears on B), cut the link, tick it on A and
   delete it on B (**⋯ → Delete**), restore: it comes back as a twin on both cards (`rule: resurrect`); **Keep** settles it.
4. Press **I** inside a card for the inspector: every op that crossed, its declared merge rule, its causal stamp and deps.
5. **Run shuffle test** replays the on-screen ops in random causal orders in your browser and prints the count it actually ran.

## 💡 The Problem & Solution

### The Problem
A shared list that needs the network breaks when the signal does, and the usual fix, last-write-wins, quietly drops an edit.

### The Solution
Every operation declares how it merges, and each op must pass convergence and intent properties (does every replica end on the same state, and on the one its rule declares?) before the Agent Stop gate lets Kiro finish. Convergence is measured, property-tested, not proven.

### The merge rules
Every op declares a named rule and an intent that the kit checks independently.

| Op (example) | Declared rule | What the user sees |
|---|---|---|
| tick an item, rename it, set a note or count | `causal-lww` | The write that had seen the other wins; a clock never decides |
| add a canister, add or remove a need, report severity, add an expense | `commutes` | Both edits count; severity takes the worse; shares sum to the total in whole cents |
| claim an item ("I will bring it") | `claim-one` | One claimant on both replicas; the other sees a twin naming the winner |
| delete vs edit, restore | `resurrect` | The deleted item returns as a ghost twin, one tap to keep or drop |
| reorder a list | `ordered-move` | Both moves land in a stable order |

**Claims under partition are provisional.** No CRDT can stop two offline people from claiming the last stove. LIMBO's declared rule
picks one claimant deterministically when they reconnect, and the other person is told.


## 🏗️ Architecture & Tech Stack

<p align="center"><img src="docs/assets/architecture.svg" alt="Two apps declare ops on one skeleton: op layer with named merges, replica and link, local Yjs and IndexedDB store, Limbo visual layer. The kit property gate checks every op; the .kiro rig runs the kit." width="100%"></p>

### Skeleton Crew: one skeleton, two apps
- `skeleton/` is the template: op layer and named merges (`core/`), replica, links and local store (`sync/`), and the Limbo visual
  layer, fog, twin, inspector (`limbo/`).
- `apps/basecamp/` and `apps/aftershock/` are the two apps. Each supplies five things: a model, ops, a seed script, views, a config
  ([`docs/ADOPT.md`](docs/ADOPT.md)). AFTERSHOCK's own spec changed 0 files under `skeleton/` (later UI polish touched skeleton CSS and markup for both apps).
- Skeleton size: **21 files, 2,189 lines** against its budget of 30 files and 2,400 lines (non-blank, non-comment TS/TSX outside tests;
  `skeleton_budget_*` in [`evidence/lean.json`](evidence/lean.json)), with **15 exported values** from its public `index.ts`.
  BASECAMP: 12 ops, 2,187 lines. AFTERSHOCK: 6 ops, 1,464 lines (non-blank). Wider counts and the budget history: [Skeleton size](#skeleton-size).

Stack: TypeScript, React, Vite (+ vite-plugin-pwa), Yjs with y-indexeddb for the local store, fast-check, Vitest, Playwright.

## 🏆 Kiro Integration

### How Kiro built this
Numbers below come from `node kit/scripts/readme-tally.mjs` over [`evidence/kiro/`](evidence/kiro/) (output:
[`evidence/kiro/tally.json`](evidence/kiro/tally.json)); none are typed by hand.

- **Ledger:** 202 rows in `sessions.jsonl`: 188 Kiro sessions (`kiro-cli chat --v3 --no-interactive`, 659.11 credits) and 14
  `claude-direct` rows for edits made outside Kiro (the build ledger; the 20 A/B pilot sessions, 64.31 credits, are logged separately in `evidence/kiro/ab/`). 173 of the Kiro sessions belong to one of 11 specs (155 ran a numbered task, 11 authored a spec, 7 were follow-ups (4 of them re-runs of an earlier task)); 12 more were kit-revision sessions and 3 were bootstrap sessions before any spec existed.
- **Kiro share:** 111 of 119 product commits (`skeleton/` or `apps/`) carry a `Kiro-Session` trailer, **93.28%**
  ([`share.json`](evidence/kiro/share.json)). The 8 others are listed there, with subjects.
- **Hooks:** 1,770 logged fires across 8 hooks and 8 triggers: PreToolUse 1,226, Stop 184, PreTaskExec 147, PostTaskExec 139,
  SessionStart 41, PostFileSave 13, PostFileCreate 12, PostToolUse 8. Of these, the shell guard denied 3 commands, the Agent Stop gate
  **blocked the agent from finishing 2 times**, and the op linter failed 2 saves. The first block was unplanned: in merge-kit task 9.5 the
  shared property suite ran the new `item.move` op without its own payload generator; Kiro wired the per-op options into the suite and the
  properties passed (commit `651730d`). The second was a wall-clock fault seeded on purpose to prove the gate fires; Kiro removed it.

| `.kiro/` file | Job | Fired |
|---|---|---|
| `steering/` (4 always-on: product, structure, tech, local-first; 2 by file match: testing, ops-guide) | Rules and the four wrong-but-convergent ops | always-on files loaded in 187 of 188 Kiro sessions; testing in 38, ops-guide in 32 (`steering_sessions_by_file` in `tally.json`) |
| `hooks/session-context`, `task-start` | Inject context, log the task start | 41 and 147 |
| `hooks/guard-shell` | Deny pushes, posts and destructive commands | 1,226 checks, 3 denials |
| `hooks/op-scaffold`, `op-lint` | Scaffold and lint a new op file | 12 and 13 |
| `hooks/props-after-task` | Run the property suite after each task | 139 |
| `hooks/stop-gate` | Block "done" while fast-tier properties fail | 184 checks, 2 blocks |
| `hooks/mcp-log` + the `limbo-convergence` MCP server (`kit/mcp/`, wired to `agents/limbo-builder` and `settings/mcp.json`) | `list_ops`, `fuzz_op`, `check_lint` (`explain_trace` unused) | 8 calls from one Kiro session (4 `fuzz_op`, 2 `list_ops`, 2 `check_lint`, across 4 ops in both apps) |
| `agents/` (limbo-builder, limbo-kitsmith), `specs/` (11) | Builder and kit-author agents; requirements, design, tasks per feature | 173 sessions across the specs (155 numbered tasks) |

**Experiment: a pre-registered A/B pilot, no measurable effect.** 20 runs of an op-writing task, with and without the kit: held-out failures 0 of 10 (95% CI
0 to 28%) in both arms, Fisher exact p = 1 (pre-registered before run 1, `PREREG.md`). So we claim nothing about the kit improving
correctness here. What the pilot did show: all 8 Agent Stop blocks in the kit arm were false alarms from the kit's own vacuity guard,
and 2 of 10 kit-arm runs edited that guard to pass. We then put the gate files under a hash manifest the session wrapper checks after every
Kiro session (`pnpm gate` re-checks it); that fix has not been re-piloted.
[`evidence/kiro/ab/summary.md`](evidence/kiro/ab/summary.md), [`observations.md`](evidence/kiro/ab/observations.md).

**IDE vs CLI.** All builds ran headless through the Kiro CLI (`--v3 --no-interactive`; version 3.3.0 for 37 sessions, 3.5.0 for 151), which fires the spec task hooks and
the Agent Stop hook. Spec Correctness (property-based) is IDE-only and the Agent Hooks panel is IDE UI; we did not use either.
Per Kiro's docs, Spec Correctness is IDE-only; the project `.kiro/` files use the same format in IDE and CLI.


## 📊 Engineering Rigor

### The number
<a id="the-number"></a>
**10,000 random orderings of 3 replicas, 0 divergences**, across every op of both apps (seed 20251031, Yjs 13.6.33, Node 22.22.0, all
36 convergence passes and the intent properties green, 11 conflict classes each exercised in 58% to 99.9% of runs).
[`evidence/convergence/full-2026-11-22.json`](evidence/convergence/full-2026-11-22.json) (log beside it). Reproduce: `pnpm props:full`
(about 22 minutes). Offline e2e on BASECAMP: the lake-scene test and the two-browser-context test (a real partition through a dev-only relay)
passed 10 of 10 repeats, [`evidence/e2e/task-21-repeat10.txt`](evidence/e2e/task-21-repeat10.txt); live e2e against both deployed URLs
passed 6 of 6, [`evidence/live/`](evidence/live/).

### Skeleton size
<a id="skeleton-size"></a>
Measured by `node kit/scripts/readme-tally.mjs` into [`evidence/lean.json`](evidence/lean.json). The budget count above (21 files, 2,189 lines) is
non-blank, non-comment TS/TSX outside tests and `limbo/test/` (the command is in `evidence/budget-basecamp-baseline.md`). Wider counts: 24 production
files (23 TS/TSX and 1 CSS), 2,520 non-blank TS/TSX lines (2,297 excluding comment-only lines; both include test helpers), 34 test files beside them.
The spec first set 1,800 lines; the owner restated it to 2,400 on 2026-11-21 when the Limbo layer landed. We are inside the restated budget and over the original one.


## 🚀 Getting Started

Locally:
```
git clone https://github.com/edycutjong/limbo && cd limbo && pnpm install && pnpm --filter @limbo/basecamp dev   # http://localhost:5174
```
(AFTERSHOCK: `pnpm --filter @limbo/aftershock dev`, port 5176.) Not built: the cross-device relay. Two replicas sync through the
in-page link, or through a dev-only test relay in the e2e suite.

## 🧪 Testing & CI

- `pnpm test:coverage` runs everything below under a **100% threshold** (lines, statements, functions, branches) on `skeleton/` and each app's
  op, model and action modules: **1,393 tests pass, 9 skipped, 100% coverage** (`pnpm test` alone: 1,034 unit and component tests in 103 files;
  `pnpm props`: 359 property tests pass, 9 skipped, 22 files). `pnpm e2e:ci`: **24 Playwright tests pass** (2 skipped), including `/judge` with no credentials.
  `pnpm typecheck` is clean. Steps and expected output: [`DEMO.md`](DEMO.md). The exclusions from the coverage gate (entry points, workers, views) and their
  reasons are in [`vitest.config.ts`](vitest.config.ts).
- **CI:** [`ci.yml`](.github/workflows/ci.yml) has six stages: Quality, Security (gitleaks, `pnpm audit`), Build with a bundle budget, E2E, Performance
  (Lighthouse, advisory) and a Deploy Gate; plus CodeQL, a conventional-commit release workflow and grouped monthly Dependabot with no major bumps. A check fails the build if
  `/.kiro` is ignored or empty. GitHub Actions on this private repo did not start (account billing limit), so the Stage 1-4 steps ran locally (Lighthouse, the Deploy Gate, the `/judge` mirror check and the full advisory audit run only on GitHub Actions):
  [`evidence/ci/`](evidence/ci/) (`node kit/scripts/ci-local.mjs`).
- **Built during the submission period.** First commit: 2026-11-15 (`git log --reverse`). The period opened 2026-10-30.
  **Pre-existing code: none.** Libraries: Yjs, y-indexeddb, React, Vite, vite-plugin-pwa, fast-check, Vitest, Playwright.
- Offline claims are provisional; convergence is measured, not proven.

## 📁 Project Structure

`.kiro/` steering, hooks, agents, specs · `skeleton/` · `apps/basecamp/` · `apps/aftershock/` · `kit/` hook scripts, property harness,
Kiro run wrapper, tally and gate scripts · `e2e/` · `evidence/` measured runs and the Kiro ledgers · `docs/` assets and ADOPT.md.

## 📄 License

MIT.
