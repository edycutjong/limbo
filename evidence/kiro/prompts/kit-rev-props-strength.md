Kit revision: three property-strength gaps found in an architecture review and checked against the code.

1. `raw idempotence` in `kit/props/engine.ts` snapshots too late: it computes `once = apply(s, o)` and `twice = apply(once, o)` before taking
   `canonical(once)`, so a reducer that mutates its input in place and returns it makes `once` and `twice` the same object and passes.
   Take `canonical(once)` before the second apply (and do not let the second apply see an object the first snapshot shares). Add a mutant
   `kit/props/bad/apply-append-inplace.ts` (appends to the input state in place and returns it) with `expectFails: ['raw idempotence']`.
2. Vacuity counts conflicts the intent checks never see: `mixedRun()` in `kit/props/mixed.ts` classifies the whole script
   (`classify(res.ops, lwwNamesOf(defs))`), but the intent checks keep only targets with a create op, and BASECAMP's fold skips targets
   without one. A script with two concurrent claims on an uncreated target counts as `claim-claim` while no claim reaches a checked
   state. Classify only the ops on targets the checks keep, so a class share measures checked runs. If a class then falls below the
   existing bar, fix the generator (for example, give each hot target its create op early); never lower the bar or drop a class.
3. The move oracle discards order: `kit/props/intent/move.ts` reduces the expected order to sorted membership
   (`[...new Set(spec.expected(res.ops))].sort()`), so a fold that ignores every move and lists items by id passes it. Compare each
   replica's order with `spec.expected(res.ops)` as an ordered list. Add a mutant that ignores moves (orders by id) and report which
   property or golden history kills it; it must be killed by `intent:move` at least.

Update the tests and the mutant fixture list (`kit/props/mutants.props.test.ts`), add new files to `kit/scripts/gate-list.mjs`, run
`pnpm typecheck && pnpm test && pnpm props` until green, then `node kit/scripts/gate-integrity.mjs --write` and `pnpm gate`. Report the
measured counts and the vacuity shares per class from the fast tier. Do not run git. Do not run `pnpm e2e` or `pnpm props:full`.
