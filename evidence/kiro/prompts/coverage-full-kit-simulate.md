Kit revision for `coverage-full` (a kit session: `skeleton/src/core/simulate.ts` is a gate-protected file, so the ordinary spec session could not change it).

`pnpm test:coverage` enforces 100% branch coverage. The only remaining gap is `skeleton/src/core/simulate.ts` line 88, the `o.deps[r] ?? 0` fallback in
`deliveryOrder`. `r` comes from the keys of `o.deps`, so the entry always exists. As recorded in `.kiro/specs/coverage-full/design.md` section "Production changes",
iterate `Object.entries(o.deps)` instead (`Object.entries(o.deps).every(([r, n]) => ...)`), with identical behaviour.
Then run `pnpm typecheck && pnpm test && pnpm props` and `pnpm test:coverage && pnpm coverage:gaps` (it must print "No coverage gaps."), and run `pnpm gate`
to see what it says; update the gate manifest the way the earlier kit revisions did (`evidence/kiro/gate-manifest.json` via the wrapper). Never weaken a property or
the vacuity check. Do not run git.
