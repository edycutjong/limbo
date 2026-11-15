# Tasks: merge-kit

Each task ends with `pnpm typecheck && pnpm test && pnpm props` green, except where later ops do not exist yet (then the suite reports `skipped:no-ops` for that part). Tests and properties are never weakened to pass.

- [x] 1. Kit hygiene: repo-relative ledger paths
  - In `kit/hooks/lib.mjs`, add `rel(p)` and apply it to `target` and `detail` when the ledger entry is built.
  - Tests: new selftest cases in `kit/hooks/tests` (absolute path in, `./...` out; path outside root unchanged); all existing selftests stay green.
  - _Requirements: R18_

- [x] 2. Op layer and causal buffer
  - [x] 2.1 `skeleton/src/core/types.ts`: `Op`, `Stamp`, `VV`, `Intent`, `Merge`, `OpDef` as in `local-first.md`.
  - [x] 2.2 `skeleton/src/core/causal.ts`: `compareStamp`, `covers`, `concurrent`, `createOp`, `allocKey`, `canonical`.
  - [x] 2.3 `causalBuffer`: apply on deps met, hold otherwise, ignore duplicates, track contiguous `vv`.
  - Tests (`skeleton/src/core/causal.test.ts`): stamp order by `l`, `r`, `n`, and `r` by code unit (`'B' < 'a'`, a non-BMP id case); `covers` and `concurrent` truth table; `createOp` sets `l`, `n`, `deps`; `canonical` sorts keys and rejects floats; buffer holds and releases out-of-order ops, ignores duplicates, `vv` stays contiguous; `allocKey` returns distinct keys for two replicas in one gap and loops on a prefix `right`.
  - _Requirements: R1, R2, R6.2, R6.3_

- [x] 3. Named merges
  - [x] 3.1 `merges.ts`: `causalLww`.
  - [x] 3.2 `resurrect`.
  - [x] 3.3 `claimOne`.
  - [x] 3.4 `orderedMove`.
  - [x] 3.5 Declare `sum-split` in `Merge`; no reducer.
  - Tests (`skeleton/src/core/merges.test.ts`): hand-built op sets for each rule, each checked under all permutations and with duplicates (order independence, idempotence); equal concurrent values collapse; dominating write resolves; G05 shape gives twin; release-then-reclaim; units 2; deleted item has no winners.
  - _Requirements: R3, R4, R5, R6, R7_

- [x] 4. Simulator
  - `simulate.ts`: script generation from registered `OpDef`s, per-replica skew via `withSkew`, random causal-consistent delivery, duplicates, trace. `explainTrace`.
  - Tests (`skeleton/src/core/simulate.test.ts`): same seed gives same trace; every delivery order is causal; some ops are delivered twice; `Date.now` and `performance.now` are restored after a throw; `explainTrace` names the first differing step on a hand-made divergent trace. Uses a stub `OpDef` set inside the test, since app ops do not exist yet.
  - _Requirements: R9_

- [x] 5. Property harness, intent properties, vacuity guard
  - [x] 5.1 `kit/props/config.ts` (tiers, seed, env override).
  - [x] 5.2 `kit/props/run.ts`: `runOpProperties(def)`; convergence, replay equivalence, idempotence, commutes, no lost edit, manifest check, shrunk failure message.
  - [x] 5.3 `kit/props/intent/*.ts`: `set`, `delta`, `add-remove`, `max`, `claim`, `life`, `split`, `move`, each with an independent oracle.
  - [x] 5.4 `kit/props/arbitraries/`: conflict-template generators.
  - [x] 5.5 Vacuity guard: `classify`, per-class share, `n/a` for unregistered ops.
  - [x] 5.6 `kit/props/suite.props.test.ts` over the registry.
  - Tests: `kit/props/run.test.ts` (unit): config tiers and seed override; failure message has script, order, seed, trace; `classify` flags each class on a hand-made script; vacuity fails when a class share is under 50% (stub generator); intent modules pass on small correct fixture reducers for `delta`, `add-remove`, `max`, `split`.
  - _Requirements: R10, R11, R12_

- [x] 6. Intent manifest
  - `kit/props/intents.json` with the 17 entries from R13.
  - Tests: `kit/props/manifest.test.ts`: the 17 names and kinds match exactly; every kind is a valid `Intent['kind']`; the harness fails an op with a wrong or missing entry.
  - _Requirements: R13, R10.6, R10.7_

- [x] 7. Golden histories and runner
  - [x] 7.1 Write `kit/props/golden/G01..G21.json` from the brief, byte for byte on stamps, deps, keys, and `expect`.
  - [x] 7.2 `kit/props/golden.props.test.ts`: own topological enumerator over every causal order, partial match; G20, G21 pending.
  - Tests: the runner itself (G01 to G19 pass once task 9 ops exist; until then they report `skipped:no-ops`); a unit test that the enumerator yields the right order count for a 3-op diamond and dedups by applied set; a unit test that a pending file is skipped with a reason and never counted as passing.
  - _Requirements: R14_

- [x] 8. Mutation fixtures and mutant test
  - [x] 8.1 Write the 12 fixtures in `kit/props/bad/`.
  - [x] 8.2 `kit/props/mutants.props.test.ts`: each fixture must fail at least one property or golden history and name it.
  - Tests: the mutant test itself; plus a self-check that a deliberately correct fixture copy is reported as "survived" (so the test can fail).
  - _Requirements: R15_

- [x] 9. First BASECAMP ops (except rename)
  - [x] 9.1 `apps/basecamp/src/model.ts`: `Item`, `materialize(ops)`.
  - [x] 9.2 `item.add`, `item.tick`.
  - [x] 9.3 `item.delete`, `item.restore`.
  - [x] 9.4 `item.claim`, `item.release`.
  - [x] 9.5 `item.move`.
  - [x] 9.6 Generate `registry.gen.ts` with the existing scaffold hook; add a `*.props.test.ts` per op that calls `runOpProperties`.
  - Tests: `pnpm props` on all seven ops (convergence, replay, intent, no lost edit, idempotence, every vacuity class that these ops can reach); golden G01 to G19 now run and pass; `pnpm test` unit tests for `materialize` on G01; `op-lint` passes on every op file; mutants still all fail.
  - _Requirements: R8.1 to R8.3, R8.5, R10, R11, R12, R14_

- [x] 10. Full-tier evidence script
  - `kit/scripts/props-full.mjs`, root `package.json` script `props:full`.
  - Tests: unit test on the evidence composer with a canned reporter output (field names, per-class shares, date in file name); run `pnpm props:full` once and keep `evidence/convergence/full-<date>.json`.
  - _Requirements: R16_

- [ ] 11. G1 two-context spike harness and e2e
  - [x] 11.1 `skeleton/src/sync/store.ts` (Yjs `Y.Map` + `y-indexeddb`), the only Yjs importer.
  - [ ] 11.2 `e2e/spike/relay.mjs`, `index.html`, `main.ts`, Playwright `webServer` config, `window.limbo`.
  - [ ] 11.3 `e2e/offline-spike.spec.ts` as in R17.4 to R17.6.
  - [ ] 11.4 `pnpm e2e:spike:10` and `evidence/e2e/spike-<date>.json`.
  - Tests: `skeleton/src/sync/store.test.ts` (put, all, persistence round trip, duplicate id); a lint test that no file other than `store.ts` imports `yjs`; `pnpm e2e` (spike spec) passes; 10 repeats recorded in evidence.
  - _Requirements: R17_

- [ ] 12. LAST: `item.rename`
  - Only this: `apps/basecamp/src/ops/item.rename.op.ts` (`causal-lww` on `name`, intent set, payload `{name}`), its `*.props.test.ts`, and the regenerated registry. Nothing else changes.
  - Tests: `pnpm props` including the `set` intent and the concurrent equal/different value vacuity classes on `name`; `op-lint`; intent matches `intents.json`; `pnpm typecheck && pnpm test && pnpm props` green.
  - _Requirements: R8.4, R8.5_
