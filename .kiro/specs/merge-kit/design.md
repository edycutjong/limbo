# Design: merge-kit

## Layout

```
skeleton/src/core/
  types.ts        Op, Stamp, VV, Intent, Merge, OpDef
  causal.ts       compareStamp, covers, concurrent, createOp, canonical, causalBuffer
  merges.ts       causalLww, resurrect, claimOne, orderedMove (pure joins)
  simulate.ts     simulate(), explainTrace()
skeleton/src/sync/store.ts      only importer of yjs / y-indexeddb
apps/basecamp/src/model.ts      Item, materialize(ops)
apps/basecamp/src/ops/*.op.ts   one OpDef each; registry.gen.ts is generated
kit/props/
  config.ts  run.ts  suite.props.test.ts  golden.props.test.ts  mutants.props.test.ts
  intents.json  intent/{set,delta,addRemove,max,claim,life,split,move}.ts
  arbitraries/  golden/G01..G21.json  bad/<fixture>.ts
e2e/spike/{index.html,main.ts,relay.mjs}  e2e/offline-spike.spec.ts
```

The skeleton exports stay within the 15-export budget: `types` are type-only, and the value exports are `createOp`, `causalBuffer`, `compareStamp`, `covers`, `concurrent`, `canonical`, `merges` (one object holding the four rules), `simulate`, `explainTrace`. That is 9 values. Kit code may import internal helpers by path, so it does not count against the skeleton budget.

## Op layer (`causal.ts`)

- `compareStamp(a, b)`: `a.l - b.l`, then `a.r < b.r ? -1 : a.r > b.r ? 1 : 0` (string `<` is UTF-16 code-unit order), then `a.n - b.n`.
- `covers(x, y) = (x.deps[y.stamp.r] ?? 0) >= y.stamp.n`.
- `createOp(replica, def, target, payload)`: the replica object owns `{r, counter, vv, maxL}`. It builds `l = 1 + maxL`, `n = ++counter`, `deps = {...vv}`. It is the only reader of `r` and `counter`. Key allocation (`allocKey(left, right, r)`) sits beside it for the same reason.
- `canonical(v)`: recursive, keys sorted with the default code-unit sort, arrays kept in order, `undefined` dropped, numbers must be integers (throws otherwise, which also catches float shares).
- `causalBuffer(vv)`: `offer(op)` returns the ops that became applicable, in apply order. Held ops sit in a list that is rescanned until a pass applies nothing. Duplicate = `op.id` already applied or already held.

## Merges (`merges.ts`)

All four take the full op set for one entity (a set of dots) and return a value. They never read arrival order: they sort by `compareStamp` where order matters, so the join is commutative, associative and idempotent over a set.

**causalLww(writes)** returns `{value, twins}`. `frontier = writes.filter(w => !writes.some(o => o !== w && covers(o, w)))`. `winner = max stamp of frontier`. `twins = frontier` whose canonical payload differs from the winner's, one per distinct value.

**resurrect(lifeOps)** where each op is tagged `create | restore | delete | edit`. `A = deletes.filter(d => !restores.some(r => covers(r, d)))`. `edits` = create, restore, and content ops. `resurrects(e) = A.every(a => !covers(a, e)) && !A.every(a => covers(e, a))`. Result is `alive` if `A` is empty, `twin` if any edit resurrects, else `deleted`. Walk-through check on G05: the restores cover `b:1`, so `A = {b:3}`. Restore `a:2` is not covered by `b:3` and does not cover it, so the item is a twin.

**claimOne(claims, releases, units, lifeState)**: a claim `c` is released iff some release `r` with the same `who` has `covers(r, c)`. Then group the rest by `who` and keep the lowest stamp. If `lifeState = deleted` the eligible list is empty. Else sort ascending by stamp. `winners = slice(0, min(units, n))`, `losers = rest`. G12 and G11 follow from this order, and the "covers never beats" property is a check on it, not an extra rule.

**orderedMove(items)**: each item's `pos` is `causalLww` over its create key and its moves. Order = sort by `(pos, id)` using code-unit comparison. Deleted items are dropped by the model. Keys carry a replica suffix, so two moves into one gap produce distinct keys and no tie falls to the id except identical keys from one replica's own repeated ops, which have distinct `n`.

`allocKey(left, right, r)`: `k = generateKeyBetween(left, right)`; `while (right !== null && right.startsWith(k)) k = generateKeyBetween(k, right)`; return `k + base62(r.split('#')[0].replaceAll('-', '')) + '1'`. G19 exercises the prefix loop. The golden keys in the brief are literal strings, so goldens do not call `allocKey`.

`sum-split` is a member of the `Merge` union. `merges` has no entry for it; the harness treats a missing reducer as `pending`.

## Model (`apps/basecamp/src/model.ts`)

`materialize(ops)` first runs the ops through a fresh `causalBuffer` in any order, then groups by target, then calls the merges. Item view: `{id, name, ticked, units, life: 'alive'|'twin'|'deleted', twins: {fields: string[]}, winners: string[], losers: string[], pos}`. The state is `{items: Record<id, ItemView>, order: id[]}`; `order` holds non-deleted ids. Each `OpDef.apply` is a small pure function over the partially built item, and the reducer for a rule calls the matching merge, so one op's `apply` is idempotent because it only adds to a set of dots keyed by id.

## Simulator (`simulate.ts`)

`simulate({defs, replicas, script, schedule, seed})`:

1. Generate the script. Each step picks a replica, an op def (weighted), a target, and a payload. A step sees only what that replica has applied so far, which makes concurrency. `sync points` in the script say "replica i receives op j now" before the next step.
2. Creation runs under `withSkew(replica, fn)`, which replaces `Date.now` and `performance.now` by `±(1..6) h` and restores them in `finally`. A reducer or op that reads the clock then produces a different state on replicas, and convergence or `set` dominance fails.
3. Delivery: for each replica, build a random topological order of all ops under `deps`, by repeatedly picking a random op whose deps are applied. Some ops are inserted twice. The buffer drops the second.
4. Output: `{states: Record<r, canonical>, trace: Step[]}` where `Step = {replica, opId, stateAfter, duplicate}`.

`explainTrace(ce)` prints a table of per-replica state after each step index and the first index where canonical states of replicas that have received the same set of ops differ. Only same-set comparisons are valid, so the check is made at the end of each replica's trace and over common prefixes of the op set.

## Harness (`kit/props/run.ts`)

`config.ts` exports `{replicas: 3, orderings, seed}`: `fast` = 500, `full` = 10,000, seed from `LIMBO_PROPS_SEED` else a recorded constant. fast-check gets `{numRuns, seed, endOnFailure: false}`; the orderings are drawn per run from the same seeded stream. `numRuns` is read from config only.

`runOpProperties(def)` registers `describe` + `it` blocks per property, so scaffolded `*.props.test.ts` call it with one line. The suite file iterates the generated `registry.gen.ts`. If it is empty, the suite reports `skipped:no-ops` and the stop-gate already treats that as a skip.

Properties map as follows.

| Property | Where |
| --- | --- |
| convergence | `run.ts`, compares `canonical(state)` across replicas |
| replay equivalence | `run.ts`, full log sorted by `compareStamp` fed in one go equals the incremental result |
| intent | `intent/<kind>.ts`, picked by `def.intent.kind` |
| no lost edit | `run.ts`, per rule: every non-covered write is visible as value or twin, every eligible claim is winner or loser, every non-covered edit counts for life |
| idempotence / commutes | `run.ts`; for `commutes`, any permutation of concurrent ops gives equal state |
| manifest | `run.ts`, def intent vs `intents.json` |

Intent modules export `check(ctx) => true | string` and a `generate(def)` arbitrary. `ctx` holds script, per-replica states, and an oracle that recomputes the expected value from the op set by the intent's own definition, independent of `merges.ts` (a direct filter over `deps`, written differently from the merge code so one bug does not hide itself).

**Skew check for `set`.** The script gives the later write a causal dependency on the earlier one and a skewed clock that says the opposite. A reducer that reads the clock picks the wrong value.

**Vacuity guard.** The harness tags each run with classes found by scanning the script (`classify(script) => Set<Class>`). After N runs, `share[class] = runs with class / N`. One `it` per class asserts `share >= 0.5`. Classes whose required op is not registered are `n/a` and excluded from the assertion, and the report says so. Generators weight the conflict shapes: the script builder starts from a "conflict template" with probability 0.7 and fills the rest randomly.

**Failure message** contains `shrunk script`, `delivery order per replica`, `seed`, and `explainTrace` text. fast-check shrinks the script (the delivery order is derived from a seed carried in the counterexample so it shrinks with it).

## Golden runner

`golden.props.test.ts` loads each JSON `{name, ops, expect, pending?}`. It has its own small topological enumerator: from a version vector it picks every op whose deps are met and recurses. It dedups on the set of applied ids so the worst case (G01, 9 ops) stays below a few thousand orders. For every complete order it feeds the ops to `materialize` and partial-matches `expect`. Pending histories (`G20`, `G21`) are `it.skip` with a reason string, shown in the report, never counted as passing.

The `expect` shape: `{order?: string[], items?: {[id]: {life?, ticked?, name?, winners?, losers?, fieldTwins?: string[]}}}`. A listed field must equal. An unlisted field is not checked. G13 and G15 use `fieldTwins: []`.

Reading the brief's histories into JSON: ops are `{id, op, target, payload, stamp: [l,r,n], deps}`. Seed ops from `s` get ids `s:n`. Item `x`..`w` are the ids, and names (Stove, Tent, Gas, Rope, Lantern) go into `item.add` payload.

## Mutation fixtures

Each fixture in `bad/` exports `{name, kind: 'op'|'rule', def|merges, expectFails: string[]}`. `mutants.props.test.ts` runs the real harness against the fixture with a small `numRuns` taken from the same config tier (never lower than fast), collects failing property names, and asserts the list is non-empty and includes at least one name from `expectFails`. Rule mutants swap one merge inside a copy of `merges` passed to `materialize` through an injectable `rules` argument. `arrival-order` makes the reducer depend on the buffer's arrival index, which only a scheduler that really permutes delivery can expose. `split-first-member` and `split-float` carry their own reducer and are run against golden G20 directly, since the real one is pending.

## Evidence script

`kit/scripts/props-full.mjs` sets `LIMBO_PROPS_TIER=full`, runs vitest's `props` project with a JSON reporter plus a custom hook in `run.ts` that writes `{passes, vacuity}` to a temp file, then composes `evidence/convergence/full-<date>.json`. It reads the yjs version from `node_modules/yjs/package.json`. Wall time comes from `performance.now` in the script, which is not an op file, so the rule does not apply.

## G1 spike

- `store.ts` exports `openStore(name) => {put(op), all(), onChange(cb)}` over `Y.Map<Op>` and `IndexeddbPersistence`. No merge logic.
- `relay.mjs` is a Node `http` server on a fixed port: `POST /ops` appends to an array, `GET /ops?since=n` returns `{ops, cursor}`. No dedupe beyond id, no merge.
- `main.ts` builds a replica from `core`, loads the seed, polls every 200 ms, pushes new local ops, applies remote ones through the causal buffer. `window.limbo.state()` returns `canonical(materialize(ops))`.
- Playwright config: `webServer` runs Vite on a fixed port, and the relay on another. Each test uses two `browser.newContext()` calls, so storage is separate. Offline is `context.setOffline(true)`, which blocks the polling `fetch`.
- `pnpm e2e:spike:10` runs `playwright test offline-spike --repeat-each=10 --reporter=json` and a script reduces it to `evidence/e2e/spike-<date>.json`.

## Kit hygiene

In `lib.mjs`, one helper `rel(p)` replaces a leading repo-root prefix with `.`; it is applied when the ledger entry is built, to `target` and `detail`. Selftests in `kit/hooks/tests` gain a case with an absolute path.

## Risks

- Enumerating all orders for G01 is bounded by dedup on applied-set, not by factorial.
- The vacuity target (50%) needs template weighting. If a class stays under 50%, the fix is the generator, not the threshold.
- `intent` properties for `delta`, `add-remove`, `max`, `split` run on fixtures until ops exist (R11.9).
- Skewed clocks make a leak visible only if a reducer reads them. Fixture `lww-wallclock` proves the check catches it.
