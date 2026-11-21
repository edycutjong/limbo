Revision request for the kit's vacuity guard and gate manifest (findings from the A/B pilot, `evidence/kiro/ab/observations.md`).

## Problem 1: the vacuity guard dilutes as ops are registered
`kit/props/vacuity.ts` + `kit/props/suite.props.test.ts` require every applicable conflict class to occur in at least
`MIN_SHARE = 0.5` of the simulated runs. Scripts are drawn uniformly over all registered ops with `steps` cycling 2..14. Each new
op lowers every class's share: in the A/B pilot, registering one extra op dropped `claim-release-claim` to 45.8–46.6% at the fast
tier, so every arm-B session was Stop-blocked by a false alarm, not a merge bug. The next feature specs will register more ops
(BASECAMP expenses, then AFTERSHOCK's sector ops in its own registry), so this must be fixed before they land.

Fix it so the class shares do not fall as unrelated ops are added, **without lowering the 50% bar** and without excluding any
class that is applicable:
- Preferred: weight the vacuity generator per class. For each applicable class, a share of the runs is generated with a script
  biased toward that class's ops (still drawn through each op's own payload generator, still delivered by `simulate()` in random
  causal orders); the rest stay uniform. Or scale `steps` with the number of registered ops. Pick one, explain the choice in a
  comment at the top of `vacuity.ts`, and keep it deterministic from the recorded seed.
- The classes must still be *measured* from the generated op histories (`classify`), never assumed from the generator.
- Add a test `kit/props/vacuity.scaling.test.ts` that measures the fast-tier vacuity report for the currently registered
  BASECAMP defs **plus 4 synthetic dummy ops** (`commutes`, distinct targets, not in any class) and asserts every applicable class
  is still ≥ `MIN_SHARE`. The dummies live only in that test file; do not register them anywhere.
- `pnpm props` wall time at the fast tier must not grow by more than ~30%.

## Problem 2: the gate files Kiro edited are not protected
In 2 of 10 arm-B runs the builder session edited the vacuity guard (range 60–120; steps ∝ op count). Those files are not on the
wrapper's protected list. In `kit/scripts/kiro-run.mjs` `gateManifest()`, add `kit/props/suite.props.test.ts`, `kit/props/vacuity.ts`,
the new `kit/props/vacuity.scaling.test.ts`, and the directory `kit/props/arbitraries/` (and `kit/scripts/kiro-run.mjs` itself and the
new script below). Then factor the list into one exported module `kit/scripts/gate-list.mjs` (roots + files) used by both the wrapper and a new
`kit/scripts/gate-integrity.mjs`:
- `node kit/scripts/gate-integrity.mjs --write` hashes the protected set into `evidence/kiro/gate-manifest.json` (sorted, sha256).
- `node kit/scripts/gate-integrity.mjs` (no flag) re-hashes and exits 1 listing every added, removed or changed protected file
  compared with that manifest; exit 0 when equal. This is what CI runs on every push.
- Add a unit test for it in `kit/hooks/tests/` or next to it (temp dir fixture; changed / added / removed / equal cases).
- Add a root script `"gate": "node kit/scripts/gate-integrity.mjs"`.

Then run `pnpm typecheck && pnpm test && pnpm props` and make them pass, and finally run
`node kit/scripts/gate-integrity.mjs --write` once so the manifest matches the revised kit. Do not run git.
