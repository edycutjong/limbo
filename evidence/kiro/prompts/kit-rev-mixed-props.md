Revision request for the property harness (review finding, before the next feature specs register more ops).

## Finding
`kit/props/run.ts` `checkRun` simulates **one def at a time** (`simulate({ defs: [def], ... })`), so every property (convergence,
replay equivalence, intent checks, idempotence) runs over scripts that contain a single op kind. The vacuity guard
(`kit/props/vacuity.ts`, `suite.props.test.ts`) measures conflict classes on a **different**, mixed generator (all class ops on one hot
target, 40–80 steps) whose runs are classified but **never checked by any property**. So the guard certifies that conflicts occur in
runs nobody checks, and cross-op interactions (delete ‖ tick → resurrect twin, claim ‖ delete, move ‖ delete, release chains) are only
covered by the golden histories. The app's real reducer (`apps/<app>/src/model.ts` `materialize(ops)`) is not run by the properties at all.

## Change
1. **Mixed-script properties in the suite.** For each app that has a registry, `suite.props.test.ts` runs a property block over
   mixed scripts drawn from that app's registered ops (each op's payload from its own `*.props.ts` generator, a small set of hot targets
   so ops collide), delivered by `simulate()` in random causal orders with duplicates, at the configured tier (`fast` 500 / `full`
   10,000 orderings, 3 replicas, the recorded seed). Properties over each run:
   - **app convergence:** the app's `materialize(log)` (imported from the app's `model.ts`; add a small per-app hook so the suite finds
     it, e.g. `apps/<app>/src/ops/app.props.ts` exporting `{ materialize }`) gives canonical-equal states on every replica's delivered log;
   - **app replay equivalence:** `materialize` of the log in total (stamp) order equals `materialize` of each replica's delivery order;
   - **idempotence:** duplicates change nothing;
   - the cross-op intent checks that are defined over mixed histories: `life` (delete ‖ lifecycle edit → twin; covering Keep/Delete
     resolve), `claim` (same `min(units, eligible)` winners on every replica; claims on a deleted item do not count; a covering claim
     never beats the claim it saw), `move` (no duplicate, no missing item, same order everywhere);
   - shrinking with the same failure message format (shrunk script, delivery order, seed, `explainTrace`).
2. **The vacuity guard measures exactly these runs.** Classify the histories of the mixed-script property runs (same seeds, same
   generator, same step range) rather than a separate simulation, so a class's share is the share of **checked** runs that contain it.
   Keep `MIN_SHARE = 0.5`; keep the class-weighting from the previous revision (ops in no class get weight 0 in the class-weighted part)
   but make sure the mixed property runs still include every registered op at least sometimes (e.g. a uniform fraction of runs), so
   ops outside the classes are still checked in mixed scripts.
3. The per-op blocks stay exactly as they are.
4. `pnpm props` (fast) must stay under ~2× its current wall time; `pnpm props:full` must pass. Update
   `kit/props/vacuity.scaling.test.ts` if its API changes, keep it asserting the 50% bar with 4 dummy ops.
5. Add the new files to the protected list in `kit/scripts/gate-list.mjs`, then run `node kit/scripts/gate-integrity.mjs --write`.

If a mixed property fails on the current BASECAMP ops, **do not weaken it**: stop and report the shrunk counterexample in your final
message (it would be a real divergence and gets its own bugfix spec). Run `pnpm typecheck && pnpm test && pnpm props` at the end. Do not run git.
