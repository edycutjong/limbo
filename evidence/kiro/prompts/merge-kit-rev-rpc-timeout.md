Revision request for the merge-kit property harness (review finding from the full-tier run).

`pnpm props:full` (LIMBO_PROPS_TIER=full, 10,000 orderings) passes all 143 tests but exits 1 with one unhandled error:
`[vitest-worker]: Timeout calling "onTaskUpdate"`. Cause: in `kit/props/suite.props.test.ts` the vacuity guard calls
`measureVacuity(...)` synchronously inside the `describe('vacuity guard', ...)` callback, i.e. during test collection. At the full
tier that is 10,000 simulations of 40-80 steps in one synchronous block, longer than Vitest's 60 s worker RPC timeout, so a pending
worker->main RPC times out.

Fix it without changing what is measured:
- add an async variant (e.g. `measureVacuityAsync`) in `kit/props/vacuity.ts` that runs the same loop with the same seeds and
  steps but yields to the event loop regularly (e.g. `await new Promise((r) => setImmediate(r))` every 50 runs); keep the sync
  `measureVacuity` and make both share one implementation so they return identical reports;
- in `suite.props.test.ts`, compute the report in a `beforeAll` with a timeout large enough for the full tier, write the sidecar
  there, and keep one `it` per conflict class reading that report. The set of n/a classes must still be decided at collection time
  from the registered op definitions (no simulation needed), so skipped classes still show as `it.skip`;
- also check the per-op property loop in `kit/props/run.ts`: no single synchronous block in one test may approach 60 s at the full
  tier (each op test currently takes ~6-8 s, which is fine; only add yields if one is close);
- do not lower any threshold, orderings count, seed or step range; do not edit evidence files.
Add a unit test that `measureVacuityAsync` and `measureVacuity` return deep-equal reports for a small run. Then run
`pnpm typecheck && pnpm test && pnpm props` and make them pass. Do not run git.
