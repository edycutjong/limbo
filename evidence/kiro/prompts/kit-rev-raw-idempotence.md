Kit revision: make the property suite check steering rule 6 ("`apply` must be idempotent", `.kiro/steering/local-first.md`) directly.
Today the `idempotence` property in `kit/props/engine.ts` re-offers the log through the causal buffer, which drops a repeated op id
before `apply` runs, so a reducer that is idempotent only because of the buffer passes every property.

1. In `kit/props/engine.ts` add a property named `raw idempotence`: replay the Lamport-sorted log through a fresh causal buffer; for each
   applied op `o` of the def under test, with `s` the state before `o`, require `canonical(apply(apply(s, o), o)) === canonical(apply(s, o))`.
   On failure name the op id and show both states, like the other properties. Keep every existing property and its name unchanged.
2. Add a mutant fixture `kit/props/bad/apply-append.ts` (a reducer for a `set`-intent op that appends each write to an array instead of
   keying it by op id; it converges through the buffer and must be killed by `raw idempotence`). Register it in `kit/props/bad/index.ts`
   with `expectFails: ['raw idempotence']` and update the fixture-list assertion in `kit/props/mutants.props.test.ts`.
3. `PROPERTY_NAMES` grows by one: update every test or output that lists or counts the properties (for example `kit/props/engine.test.ts`,
   the MCP tool tests under `kit/mcp/`), so nothing hard-codes the old count.
4. Check that every real op in `apps/*/src/ops/` passes the new property (they key writes by op id; if one does not, report it, do not
   edit app files).
5. Add `kit/props/bad/apply-append.ts` to the protected list in `kit/scripts/gate-list.mjs`, run `pnpm typecheck && pnpm test && pnpm props`
   until green, then `node kit/scripts/gate-integrity.mjs --write` and `pnpm gate` (must print ok). Report the measured test and property counts.
Do not run git. Do not run `pnpm e2e` or `pnpm props:full` (the orchestrator runs them).
