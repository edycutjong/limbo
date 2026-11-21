# DEMO: reproduce every number

Prerequisites: Node 22+, pnpm 10 (`corepack enable`). From a fresh clone: `pnpm install`.
Numbers below are the ones printed in [`README.md`](README.md). Each row says where it comes from and how to regenerate it.

| Claim in the README | Command | Expect | Recorded in |
|---|---|---|---|
| 1,034 unit and component tests in 103 files | `pnpm test` | `Test Files 103 passed`, `Tests 1034 passed` | terminal |
| 1,393 tests, 100% coverage (lines, statements, functions, branches) | `pnpm test:coverage` | `Tests 1393 passed \| 9 skipped`, all four coverage rows `100%`, exit 0; gaps (if any) via `pnpm coverage:gaps` | terminal, [`evidence/ci/`](evidence/ci/) |
| 359 property tests pass, 9 skipped | `pnpm props` | `Tests 359 passed \| 9 skipped (368)`, 22 files (fast tier, about 1 min) | terminal |
| Typecheck clean | `pnpm typecheck` | no output, exit 0 | terminal |
| 10,000 orderings, 3 replicas, 0 divergences | `pnpm props:full` | writes `evidence/convergence/full-<date>.json` with `passed: true`, `orderings: 10000`, `seed: 20251031`, every `failuresPerProperty` 0 (about 22 min) | [`full-2026-11-22.json`](evidence/convergence/full-2026-11-22.json) |
| Offline e2e (two browser contexts), BASECAMP 10 of 10 repeats; AFTERSHOCK 10 of 10 in `evidence/aftershock/e2e/ten-runs.txt` | `pnpm e2e` (starts the preview servers itself); the 10-repeat loop is `pnpm e2e:spike:10` | all local tests pass | [`task-21-repeat10.txt`](evidence/e2e/task-21-repeat10.txt) |
| 24 Playwright tests pass (2 skipped), including `/judge` with no credentials | `pnpm e2e:ci` | `24 passed`, `2 skipped` | terminal, [`evidence/ci/`](evidence/ci/) |
| Live e2e against both URLs, 6 of 6 | `pnpm e2e:live` (needs network and the live URLs) | 6 passed | [`evidence/live/`](evidence/live/) |
| Kiro ledger numbers (202 rows, 188 Kiro, 173 sessions in 11 specs (155 numbered tasks), 659.11 credits, 1,770 hook fires, 2 Stop blocks, 3 denials) | `node kit/scripts/readme-tally.mjs` | prints and writes `evidence/kiro/tally.json` | [`tally.json`](evidence/kiro/tally.json) |
| Kiro share 93.28% (111 of 119 product commits) | `pnpm share` | rewrites `evidence/kiro/share.json` | [`share.json`](evidence/kiro/share.json) |
| Skeleton 24 files, 2,520 non-blank lines (2,297 non-comment) | `node kit/scripts/readme-tally.mjs` | writes `evidence/lean.json` | [`lean.json`](evidence/lean.json) |
| A/B pilot 0/10 vs 0/10, p = 1 | `node kit/scripts/ab-report.mjs` reads `evidence/kiro/ab/runs.jsonl` | regenerates `summary.md` and `results.json` | [`ab/summary.md`](evidence/kiro/ab/summary.md) |
| Gate files not edited by Kiro | `pnpm gate` | gate manifest ok | [`gate-manifest.json`](evidence/kiro/gate-manifest.json) |

The A/B re-run itself (`kit/scripts/ab-run.mjs`) needs a Kiro CLI login and spends credits; the recorded runs are in `evidence/kiro/ab/runs/`.

## The judge path (four steps)
1. Open https://basecamp.limbo.edycu.dev. Press **Cut link**, **Play the lake scene**, **Restore link**.
2. Keep the tent twin, accept the lost claim, see **FIXED**.
3. Press **Run shuffle test**: the count it prints is the number of orderings your browser actually ran.
4. Repeat on https://aftershock.limbo.edycu.dev (demo data, no field use claimed).

## What is not built
The cross-device relay (two real phones). The two replicas sync through the in-page link, or through a dev-only relay in the e2e suite.
Convergence is measured, not proven; claims made offline are provisional.
