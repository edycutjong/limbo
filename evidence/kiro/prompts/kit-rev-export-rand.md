Kit change requested by skeleton-sync task 5 (the in-page link's chaos mode needs the simulator's seeded RNG).
`skeleton/src/core/simulate.ts` is on the protected gate list, so a spec-task session may not touch it.

Export the existing `makeRand(seed)` from `skeleton/src/core/simulate.ts` (add `export`; no behaviour change, same algorithm and
output for every seed). Add one unit test next to the existing simulate tests that two `makeRand` instances with the same seed
produce the same first 20 values. Then run `pnpm typecheck && pnpm test`, and `node kit/scripts/gate-integrity.mjs --write` so the
manifest matches. Do not run git.
