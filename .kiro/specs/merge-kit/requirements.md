# Requirements: merge-kit

The merge kit is the core of the LIMBO skeleton. It is the op layer, the named merge rules, causal delivery, a replica simulator, and the property harness the hooks run. Goal: show, with numbers in `evidence/`, that replicas which edit offline converge on the same state and on the state the users meant, in any delivery order. Wording everywhere: "measured, property-tested", never "proven" or "guaranteed". The op contract in `.kiro/steering/local-first.md` is binding.

## Glossary

- **Dot**: one op, identified by `id = ${r}:${n}`.
- **Edit** (lifecycle): `item.add`, `item.restore`, and every op that writes item content (`item.rename`, `item.tick`, `item.claim`). `item.move` and `item.release` are not edits.
- **Frontier**: the writes to a field that no other write's `deps` cover.
- **Twin**: a conflict surfaced to the user (field twin, item twin, or loser twin).
- **Conflict class**: one of the situations listed in R12.

## R1 Op layer

User story: as a skeleton author, I want one typed op contract, so every op and reducer share the same causal vocabulary.

1. The kit shall export the types `Op`, `Stamp`, `VV`, `Intent`, `Merge`, `OpDef` exactly as in `local-first.md`.
2. When two stamps are compared, the kit shall order them by `l`, then by `r` in UTF-16 code-unit order, then by `n`, and shall not call `localeCompare`.
3. The kit shall provide `covers(x, y)` (true iff `x.deps[y.stamp.r] >= y.stamp.n`) and `concurrent(x, y)` (true iff neither covers the other).
4. When a replica creates an op, the kit shall set `l = 1 + max(l seen)`, `n = ++counter`, `deps = current VV`, and `id = ${r}:${n}`.
5. The kit shall read a replica id or a counter only inside op creation, never inside a reducer.
6. The kit shall provide canonical JSON (keys sorted by code unit, no whitespace, integers only) for state comparison.
7. If an op file calls `Date.now`, `new Date`, `performance.now`, `Math.random`, `crypto.randomUUID` or `toLocale*`, then the existing `op-lint` hook shall still reject it (no change to the hook is needed).

## R2 Causal buffer

1. When an op arrives, the buffer shall apply it only if `vv[r] >= deps[r]` for every `r` and `vv[op.r] = op.n - 1`.
2. While an op's deps are unsatisfied, the buffer shall hold it and shall apply it, in a later pass, as soon as they are satisfied.
3. When an op with an already-applied id arrives, the buffer shall ignore it and leave state unchanged.
4. The buffer shall keep `vv` as the highest contiguous applied `n` per replica.

## R3 `causal-lww`

1. The merge shall keep only writes that no other write's `deps` cover (the frontier).
2. The merge shall return as value the payload of the frontier write with the maximum stamp.
3. If frontier writes carry different values, then the merge shall surface the others as a field twin.
4. If frontier writes carry equal values, then the merge shall collapse them with no twin.
5. When a later write's deps cover the whole frontier, the merge shall return that write alone and no twin.
6. The merge shall give the same result for any delivery order and for duplicate delivery.

## R4 `resurrect`

1. Active deletes `A` = deletes not covered by any restore.
2. An edit `e` resurrects iff no `a` in `A` covers `e` and `e` does not cover every `a` in `A`.
3. If `A` is empty, then the item shall be alive.
4. If `A` is not empty and no edit resurrects, then the item shall be deleted.
5. If `A` is not empty and some edit resurrects, then the item shall be a twin.
6. A restore whose deps cover `A` (Keep) shall make the item alive.
7. A delete whose deps cover every edit it saw (Delete resolve) shall make the item deleted.

## R5 `claim-one`

1. A release `{who}` shall release every claim by that `who` on the item that the releaser had seen (covered).
2. The merge shall drop released claims, then keep one claim per `who`: its lowest-stamp unreleased claim.
3. While the item is alive or a twin, its claims shall stay eligible. While it is deleted, none shall count.
4. The merge shall sort eligible claims ascending by stamp. The first `min(units, eligible)` shall win and the rest shall be loser twins. `units` is fixed at create.
5. When a winner releases, the next eligible claim shall win.
6. A claim whose deps cover another claim on the item shall never beat it.

## R6 `ordered-move`

1. The `pos` register shall be a `causal-lww` register holding a fractional key.
2. When a key is allocated, the kit shall compute `k = generateKeyBetween(left, right)`, repeat `k = generateKeyBetween(k, right)` while `right` starts with `k`, then set key = `k` + base62 digits of the replica id (the part before `#`, dashes dropped) + `'1'`.
3. The kit shall allocate keys at op creation and never inside a reducer.
4. The merge shall order items by `(pos, entity id)`.
5. Two moves into one gap shall produce two distinct keys, and the order shall be identical on every replica.

## R7 `sum-split` (declared only)

1. The kit shall declare `sum-split` as a rule name in `Merge`.
2. The reducer is out of scope. Golden histories G20 and G21 shall be written now and marked pending.

## R8 First ops (BASECAMP)

1. Each op shall live in its own `apps/basecamp/src/ops/<name>.op.ts` and default-export an `OpDef`.
2. The ops shall be: `item.add` (create; `{name, units, key}`), `item.tick` (`causal-lww`, set `ticked`; `{ticked: boolean}`), `item.delete` and `item.restore` (`resurrect`, life), `item.claim` and `item.release` (`claim-one`, claim; `{who}`), `item.move` (`ordered-move`, move; `{key}`).
3. `apps/basecamp/src/model.ts` shall hold the Item entity and `materialize(ops)`.
4. `item.rename` (`causal-lww`, set `name`; `{name}`) shall be added last, in its own task, with nothing else in it.
5. Each op's `intent` shall match its entry in `kit/props/intents.json`.

## R9 Simulator

1. The simulator shall run N replicas on a random op script drawn from the registered ops.
2. The simulator shall deliver every op to every replica in a random causal-consistent order and deliver some ops twice.
3. While a replica creates ops, the simulator shall stub `Date.now` and `performance.now` with a per-replica skew of ± hours.
4. The simulator shall return each replica's materialized state and the delivery trace.
5. `explainTrace(counterexample)` shall print each replica's state after each delivery and the first step where states differ.

## R10 Property harness

1. `LIMBO_PROPS_TIER=fast` shall run 500 orderings and `full` shall run 10,000, with 3 replicas. The default tier is `fast`.
2. The seed shall be a recorded constant and `LIMBO_PROPS_SEED` shall override it.
3. `kit/props/run.ts` shall export `runOpProperties(def)`. `kit/props/suite.props.test.ts` shall run it over every registered op.
4. The harness shall check: convergence, replay equivalence, intent properties, no lost edit per rule, idempotence, and declared commutativity for `commutes` ops.
5. When a property fails, the message shall contain the shrunk op script, the delivery order, the seed and the `explainTrace` output.
6. If a registered op's declared intent differs from `intents.json`, then the harness shall fail it.
7. If a registered op is missing from `intents.json`, then the harness shall fail it.

## R11 Intent properties (kit-owned, `kit/props/intent/`)

1. `set`: the result is a value some frontier write wrote; concurrent writes of the same value give that value; a write that has seen another always beats it under any skewed clocks.
2. `delta`: field = initial + sum of applied deltas.
3. `add-remove`: present iff some add is not covered by an observing remove.
4. `max`: value = max over reports not covered by an observing clear.
5. `claim`: all replicas hold the same `min(units, eligible)` winners; every eligible claim is a winner or a loser twin; a claim that covers another never beats it; after a winner's release the next eligible claim wins.
6. `life`: delete ‖ edit gives the twin; a Delete resolve covering the edits gives deleted; a Keep covering the active deletes gives alive.
7. `split`: sum of shares = amount; every share is an integer >= 0; k = 0 gives no shares.
8. `move`: no duplicate item, no missing item, same order on every replica.
9. Intents without a reducer yet (`delta`, `add-remove`, `max`, `split`) shall be exercised against fixture reducers in `kit/props/bad/` and the harness's own self-checks, and shall run on real ops once those ops exist.

## R12 Vacuity guard

1. The harness shall count, per run, which conflict classes occurred.
2. Each class shall occur in at least 50% of runs, else its property fails.
3. Classes: same-target delete ‖ edit; restore ‖ delete; Keep ‖ Delete resolve; claim ‖ claim on one item (including a duplicate claimant); claim ‖ delete; move ‖ move of one item; two moves into one gap; move ‖ delete of the same item; claim → release → claim again; concurrent `causal-lww` writes of equal values; concurrent `causal-lww` writes of different values.
4. Generators shall be weighted toward these classes.
5. Classes that need an op not yet registered shall be reported as `n/a`, not as passing.

## R13 Intent manifest

`kit/props/intents.json` shall map op name to required intent kind for: `item.add` create, `item.tick` set, `item.rename` set, `item.delete` life, `item.restore` life, `item.claim` claim, `item.release` claim, `item.move` move, `item.adjustQty` delta, `expense.add` split, `expense.setAmount` split, `expense.addMember` split, `sector.report` max, `sector.clear` max, `sector.count` set, `sector.need` add-remove, `sector.note` set.

## R14 Golden histories

1. `kit/props/golden/*.json` shall hold G01 to G21 exactly as given in the brief (stamps `[l, r, n]`, deps as version vectors, seed ops from replica `s`).
2. `kit/props/golden.props.test.ts` shall enumerate every causal delivery order of each history itself, without `simulate`, and check that the state matches `expect` (partial match on the listed fields).
3. G20 and G21 shall be marked pending and shall not count as passing until the `sum-split` reducer exists.
4. A golden file shall be kit-owned. No task outside kit-owned work shall edit one.

## R15 Mutation fixtures

1. `kit/props/bad/` shall hold: `tick-toggle`, `lww-wallclock`, `qty-read-modify-write`, `split-float`, `delete-wins`, `claim-both`, `claim-max-stamp`, `move-reinsert`, `severity-lww`, `split-first-member`, `resolve-noop`, `arrival-order`.
2. `kit/props/mutants.props.test.ts` shall assert that each fixture fails at least one property or golden history, and shall name which.
3. If a fixture passes everything, then the test shall fail.
4. `arrival-order` shall fail convergence, showing the scheduler really permutes deliveries.

## R16 Full-tier evidence

1. `pnpm props:full` shall run the suite with `LIMBO_PROPS_TIER=full`.
2. It shall write `evidence/convergence/full-<YYYY-MM-DD>.json` with: replicas, orderings, seed, pass count per property, vacuity share per class, yjs version, node version, duration.
3. The script shall be in the root `package.json`.

## R17 G1 two-context spike

1. `skeleton/src/sync/store.ts` shall be the only file that imports Yjs. It shall keep ops in a `Y.Map` keyed by op id and persist with `y-indexeddb`.
2. `e2e/spike/relay.mjs` shall store and forward ops (POST ops, GET ops since a cursor) with no merge logic. Pages shall poll it every 200 ms with `fetch`.
3. `e2e/spike/index.html` + `main.ts` shall run one replica per browser context and expose `window.limbo` (`add`, `tick`, `delete`, `move`, `claim`, `state()`).
4. `e2e/offline-spike.spec.ts` shall: load the same seed (x, y, z) in two contexts; take both offline; A ticks x, B deletes x; A moves z to the top, B adds an item; both claim y.
5. While offline, B's state shall not show A's edits and A's shall not show B's.
6. After reconnect and equal states, the test shall assert: x is a twin, y has exactly one winner, order is equal on both.
7. `pnpm e2e:spike:10` shall run with `--repeat-each=10` and write `evidence/e2e/spike-<YYYY-MM-DD>.json` (pass count, durations, browser version).

## R18 Kit hygiene

1. When `kit/hooks/lib.mjs` writes a ledger entry, it shall write `target` and `detail` paths relative to the repo root (root prefix replaced by `.`).
2. The hook selftests shall stay green.

## Out of scope

UI components (fog, wisps, twin, inspector), the in-page replica pair, the service worker, sync status, the PeerJS relay, the `sum-split` reducer and expense ops, AFTERSHOCK ops, the MCP server.

## Assumptions to confirm

- Intents `delta`, `add-remove`, `max`, `split` have no real op in this spec, so R11.9 runs them on fixtures. Say so if you want them gated differently.
- `fractional-indexing` is imported by op creation only.
- Cost: the full tier (10,000 orderings x 3 replicas) must fit a developer run. The duration is recorded in evidence, not promised.
