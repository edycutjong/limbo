# offline-shell: final verification (task 9)

Run from the repo root on 2026-11-21: `pnpm typecheck && pnpm test && pnpm props && pnpm e2e`. All four exited 0. No live variables were set. No test, property or `numRuns` was changed, skipped or lowered by this task.

## Counts (from the run output)

| Command | Result |
| --- | --- |
| `pnpm typecheck` | exit 0, no errors |
| `pnpm test` | 80 files, 630 tests passed (0 failed) |
| `pnpm props` | 22 files, 329 tests: 320 passed, 9 skipped |
| `pnpm e2e` | 14 tests: 8 passed, 6 skipped |

`pnpm test` by project (summed from the per-file lines of the verbose reporter; the sums equal the 80 files and 630 tests above):

| Project | Files | Tests |
| --- | --- | --- |
| `unit` (`*.test.ts`) | 49 | 474 |
| `limbo` (`*.test.tsx`) | 31 | 156 |

`pnpm props` (project `props`): 22 files, 329 tests. The 9 skipped tests are in `kit/props/suite.props.test.ts` (160 tests, 9 skipped). They were not changed by this spec.

`pnpm e2e`:

- Passed (8): `spike` 1, `basecamp` 2, `aftershock` 3, `basecamp-shell` 1, `aftershock-shell` 1.
- Skipped (6): the `live` project (3 tests per app), because `LIMBO_LIVE_BASECAMP` and `LIMBO_LIVE_AFTERSHOCK` are unset.

## Skeleton

Measured with the command in `evidence/budget-basecamp-baseline.md`:

| Measure | Value | Budget |
| --- | --- | --- |
| Files | 21 | 30 |
| Non-blank, non-comment TS/TSX lines | 2142 | 2400 |
| Value exports from `skeleton/src/index.ts` | 15 (6 core, 1 `merges` object, 2 simulate, 6 sync; types not counted) | 15 |

These equal the figures recorded after bugfix-inspector-resolved task 2 (21 files, 2142 lines).

`skeleton/` has no changed file. Check by modification time: no file under `skeleton/`, `kit/` or `.kiro/steering/` is newer than `.kiro/specs/offline-shell/requirements.md`. This is an mtime check, not a git diff (git was not run).

## Files changed outside `apps/basecamp` and `apps/aftershock`

Found by modification time against `.kiro/specs/offline-shell/requirements.md` (`node_modules`, `dist`, `.git`, `test-results`, `.kiro-runs` and this spec's own files excluded):

- `playwright.config.ts`
- `e2e/offline-shell.spec.ts`
- `e2e/live.spec.ts`
- `package.json`
- `pnpm-lock.yaml`
- `apps/pwa-options.ts`
- `apps/offline-shell.ts`
- `evidence/offline-shell/plugin-check.md`, `skeleton-unchanged.md`, `e2e-offline-shell.txt`, `final.md`
- `evidence/live/live-2026-11-21T14-22-17-736Z.json`
- `evidence/kiro/sessions.jsonl`, `evidence/kiro/hooks.jsonl`, `evidence/kiro/prompts/offline-shell-task-*.md`

All of these are on the expected list or under `evidence/`. No other file outside the two apps changed: no defect to explain or revert.

Inside the apps, changed files are `index.html`, `package.json`, `vite.config.ts`, `public/icon*`, `src/main.tsx`, `src/shell.test.ts`, `src/build.test.ts` for both apps, plus `apps/aftershock/src/views/ReplicaBody.tsx`. No `*.op.ts`, `registry.gen.ts` or `kit/props/intents.json` appears.

## Task 8 status

Task 8 is not marked done in `tasks.md`, and this task did not run it. `e2e/live.spec.ts` exists (3 tests per app, all skipped without the live variables) and one record, `evidence/live/live-2026-11-21T14-22-17-736Z.json`, is present. This task did not verify that record or the live run against the deployed URLs, so the live run is not claimed here.

## Open point

The in-page pair reconnects at boot, so "same wisp count" after an offline reload compares the settled count (design D4), not the count at the moment of the cut. A persisted cut needs a skeleton change and is a separate spec.

Wording: convergence is "measured, property-tested". Offline behavior here is provisional.
