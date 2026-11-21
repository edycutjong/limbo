Kit revision: the full-tier evidence file must record the vacuity report of every app, not only the first app whose sweep finishes.

Today `kit/props/suite.props.test.ts` writes the sidecar once (`sidecarDone`, the `writeSidecar(report)` call) for whichever app's mixed
sweep completes first, and `kit/scripts/props-full.mjs` `composeEvidence` lists every conflict class that report lacks as `n/a`. In the
run of 2026-11-22 AFTERSHOCK finished first, so `evidence/convergence/full-2026-11-22.json` lists BASECAMP's registered and checked
classes (delete-edit, restore-delete, keep-delete, claim-claim, claim-delete, move-move, move-same-gap, move-delete) as `n/a`, which
misreports the run.

1. `kit/props/sidecar.ts`: record the vacuity report per app (keyed by app name) and the run config; each app's sweep adds its own
   report, so the file ends up holding every app's report whatever order the sweeps finish in (suites may run in separate workers:
   merge with what is already in the file rather than overwriting it, and start from an empty file at the beginning of a run).
2. `kit/props/suite.props.test.ts`: every app writes its report (remove the first-app-only guard).
3. `kit/scripts/props-full.mjs` `composeEvidence`: `vacuity.runs`, a `share` per class taken from the app that registers the class's ops,
   a `byApp` object with each app's report, and `na` only for classes that no app registers. Keep every existing top-level field name.
4. Update the tests for the sidecar and `composeEvidence` (two apps, either finishing order, a class registered by neither app).
5. Run `pnpm typecheck && pnpm test && pnpm props` until green, then `node kit/scripts/gate-integrity.mjs --write` and `pnpm gate`.
   Report the measured test and property counts.
Do not run git. Do not run `pnpm e2e` or `pnpm props:full` (the orchestrator runs them).
