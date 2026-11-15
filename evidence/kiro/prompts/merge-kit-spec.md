Create a Kiro **feature spec** named `merge-kit` (requirements-first, EARS acceptance criteria) under `.kiro/specs/merge-kit/`:
`requirements.md`, `design.md`, `tasks.md`. Write only those three files. Do not implement anything yet. Do not run git.
Read `.kiro/steering/*.md` first: the op contract in `local-first.md` is binding.

## Goal
The merge kit is the core of the LIMBO skeleton: the op layer, the named merge rules, causal delivery, a replica simulator, and the
property harness that the hooks run. It must let us show, with measured numbers, that two replicas that edit offline converge on the
same state **and** on the state the users meant, whatever order the ops arrive in.

## Scope (in this spec)
1. **Op layer** `skeleton/src/core/`: types (`Op`, `Stamp`, `VV`, `Intent`, `Merge`, `OpDef`), stamp compare (`l`, then `r` by UTF-16
   code units, then `n`), `covers(x, y)`, `concurrent(x, y)`, op creation (`l = 1 + max l seen`, `n = ++counter`, `deps = current VV`;
   the only place a replica id or counter is read), canonical JSON.
2. **Causal buffer**: an op is applied only when its deps are satisfied (`vv[r] ≥ deps[r]` for every r, and `vv[op.r] = op.n − 1`);
   duplicates are ignored (idempotent); `vv` = highest contiguous applied n per replica.
3. **Named merges** `skeleton/src/core/merges.ts` — joins over sets of dots, so order-independent and idempotent:
   - `causal-lww`: keep writes not dominated by another write's deps (the frontier); value = max-stamp frontier write; other frontier
     writes with a **different** value are surfaced as a field twin (equal concurrent values collapse: two people ticking is not a
     conflict); a later write whose deps cover the whole frontier resolves it.
   - `resurrect` (item lifecycle): lifecycle edits = create, restore, and every op that writes item content (name, tick, claim) — not
     move or release. Active deletes A = deletes not covered by any restore. An edit e resurrects iff no a ∈ A covers e and e does not
     cover every a ∈ A. alive if A = ∅; deleted if A ≠ ∅ and no edit resurrects; else twin. Keep = a restore whose deps cover A; Delete
     resolve = a delete whose deps cover the edits it saw.
   - `claim-one`: claims `{who}`; a release `{who}` releases every claim by that `who` on the item that the releaser had seen. Eligible =
     drop released claims, then keep one per `who` (its lowest-stamp unreleased claim); claims stay eligible while the item is alive or a
     twin and none count while it is deleted; sort eligible ascending by stamp; the first `min(units, eligible)` win, the rest are loser
     twins. `units` is fixed at create.
   - `ordered-move`: a `pos` register (`causal-lww`) holding a fractional key made unique: `k = generateKeyBetween(left, right)`; while
     `right` starts with `k`, `k = generateKeyBetween(k, right)`; key = `k` + the base62 digits of the replica id (the part before `#`,
     dashes dropped) + `'1'`. Order = (pos, entity id). Key allocation happens at op creation, never in a reducer.
   - `sum-split` is declared as a rule name now; its reducer is **out of scope here** (it lands with the basecamp spec). Golden split
     histories are written now and marked pending for the real reducer.
4. **First ops** in `apps/basecamp/src/ops/` (one `*.op.ts` per op, default export an `OpDef`; `apps/basecamp/src/model.ts` holds the
   Item entity and `materialize(ops)`): `item.add` (create; payload `{name, units, key}`), `item.tick` (`causal-lww` on `ticked`,
   intent set; payload `{ticked: boolean}`), `item.delete` and `item.restore` (`resurrect`, intent life), `item.claim` and
   `item.release` (`claim-one`, intent claim; payload `{who}`), `item.move` (`ordered-move`, intent move; payload `{key}`).
   **`item.rename`** (`causal-lww` on `name`, intent set; payload `{name}`) is the LAST task of this spec, alone in its task.
5. **Simulator** `skeleton/src/core/simulate.ts`: N replicas; a random op script drawn from the registered ops; every replica
   receives every op in a random causal-consistent order, some ops twice; per-replica skewed clocks (stub `Date.now` and
   `performance.now` by ± hours while that replica creates ops) so any wall-clock leak shows up; returns each replica's materialized
   state and the delivery trace. `explainTrace(counterexample)` prints each replica's state after each delivery and the first step where
   the states differ.
6. **Property harness** `kit/props/run.ts` + `kit/props/config.ts` (`LIMBO_PROPS_TIER=fast` → 500 orderings, `full` → 10,000;
   3 replicas; a fixed recorded seed, overridable by `LIMBO_PROPS_SEED`), exporting `runOpProperties(def)` (used by the scaffolded
   `*.props.test.ts`) and a suite entry `kit/props/suite.props.test.ts` that runs over every registered op:
   1. convergence (canonical JSON of states equal on all replicas); 2. replay equivalence (full log in total order = incremental);
   3. intent properties derived from the declared `intent` (kit-owned, in `kit/props/intent/`): `set` — the result is a value some
   frontier write wrote, concurrent writes of the same value give that value, a write that has seen another always beats it whatever the
   skewed clocks say; `delta` — field = initial + Σ applied deltas; `add-remove` — present iff some add is not covered by an observing
   remove; `max` — value = max over reports not covered by an observing clear; `claim` — all replicas hold the same `min(units,
   eligible)` winners, every eligible claim is a winner or a loser twin, a claim that covers another claim on the item never beats it,
   after a winner's release the next eligible claim wins; `life` — delete ‖ lifecycle edit gives the twin, a Delete resolve covering the
   edits gives deleted, a Keep covering the active deletes gives alive; `split` — Σ shares = amount, every share ≥ 0 integer, k = 0 → no
   shares; `move` — no duplicate, no missing item, same order everywhere;
   4. no lost edit per rule; 5. idempotence (any op delivered twice changes nothing) and declared commutativity for `commutes` ops;
   6. **vacuity guard per conflict class** (each class must occur in at least 50% of runs, else its property fails): same-target delete ‖
   edit, restore ‖ delete, Keep ‖ Delete resolve, claim ‖ claim on one item (incl. a duplicate claimant), claim ‖ delete, move ‖ move of one
   item, two moves into one gap, move ‖ delete of the same item, claim → release → claim again, concurrent `causal-lww` writes of equal
   and of different values (generators weighted toward these);
   7. shrinking: on failure the message contains the shrunk op script, the delivery order, the seed and `explainTrace` output.
7. **Intent manifest** `kit/props/intents.json`: op name → required intent kind, pre-populated for every planned op: `item.add` create,
   `item.tick` set, `item.rename` set, `item.delete` life, `item.restore` life, `item.claim` claim, `item.release` claim, `item.move`
   move, `item.adjustQty` delta, `expense.add` split, `expense.setAmount` split, `expense.addMember` split, `sector.report` max,
   `sector.clear` max, `sector.count` set, `sector.need` add-remove, `sector.note` set.
8. **Golden histories** `kit/props/golden/*.json` (an independent oracle; kit-owned). A golden runner in `kit/props/golden.props.test.ts`
   enumerates **every** causal delivery order of each history itself (not via `simulate`) and checks that the materialized state matches
   `expect` (a partial match on the listed fields). Encode exactly these histories (stamps are `[l, r, n]`, deps are version vectors;
   seed ops come from replica `s`; `x` = Stove, `y` = Tent, `z` = Gas, `w` = Rope unless stated; units 1 unless stated):
   - **G01 seed-demo**: s:1 add x key a0 (1,s,1){} · s:2 add y a1 (2,s,2){s:1} · s:3 add z a2 (3,s,3){s:2} · a:1 tick x true (4,a,1){s:3} ·
     b:1 delete x (4,b,1){s:3} · a:2 move z key `Zza1` (5,a,2){s:3,a:1} · b:2 add v "Lantern" key `a3b1` (5,b,2){s:3,b:1} · a:3 claim y
     sari (6,a,3){s:3,a:2} · b:3 claim y budi (6,b,3){s:3,b:2} → order [z, x, y, v]; x twin, ticked true; y alive, winners [sari],
     losers [budi]; v alive.
   - **G02 keep-resolves-twin**: s:1 add x a0 · a:1 tick x true (2,a,1){s:1} · b:1 delete x (2,b,1){s:1} · a:2 restore x
     (3,a,2){s:1,a:1,b:1} → x alive, ticked true.
   - **G03 delete-resolve**: s:1 add x · a:1 tick x true (2,a,1){s:1} · b:1 delete x (2,b,1){s:1} · b:2 delete x (3,b,2){s:1,a:1,b:1}
     → x deleted (not in order).
   - **G04 two-keeps**: as G02 plus b:2 restore x (3,b,2){s:1,a:1,b:1} → x alive.
   - **G05 delete-races-a-keep**: s:1 add x · a:1 tick x (2,a,1){s:1} · b:1 delete x (2,b,1){s:1} · a:2 restore x (3,a,2){s:1,a:1,b:1} ·
     b:2 restore x (3,b,2){s:1,a:1,b:1} · b:3 delete x (4,b,3){s:1,a:1,b:2} → x twin (the delete saw Keep b:2 but not Keep a:2).
   - **G06 claim-vs-delete**: s:1 add x · a:1 claim x sari (2,a,1){s:1} · b:1 delete x (2,b,1){s:1} → x twin, winners [sari].
   - **G07 claim-vs-delete-then-delete-resolve**: G06 plus b:2 delete x (3,b,2){s:1,a:1,b:1} → x deleted, winners [].
   - **G08 duplicate-claimant**: s:1 add x · a:1 claim sari (2,a,1){s:1} · b:1 claim sari (2,b,1){s:1} · b:2 claim budi (3,b,2){s:1,b:1}
     → winners [sari], losers [budi].
   - **G09 units-2**: s:1 add x units 2 · a:1 claim sari (2,a,1){s:1} → winners [sari], losers [].
   - **G10 winner-releases**: s:1 add x · a:1 claim sari (2,a,1){s:1} · b:1 claim budi (2,b,1){s:1} · a:2 release sari (3,a,2){s:1,a:1}
     → winners [budi], losers [].
   - **G11 claim-after-seeing-another-loses**: s:1 add x · b:1 claim budi (2,b,1){s:1} · a:1 claim sari (3,a,1){s:1,b:1} → winners
     [budi], losers [sari].
   - **G12 unrelated-tick-before-claim** (documents the Lamport tie-break): s:1 add x a0 · s:2 add y a1 (2,s,2){s:1} · a:1 tick y true
     (3,a,1){s:2} · a:2 claim x sari (4,a,2){s:2,a:1} · b:1 claim x budi (3,b,1){s:2} → x winners [budi], losers [sari].
   - **G13 equal-ticks-collapse**: s:1 add x · a:1 tick true (2,a,1){s:1} · b:1 tick true (2,b,1){s:1} → ticked true, no field twin.
   - **G14 different-ticks-twin**: s:1 add x · a:1 tick true (2,a,1){s:1} · b:1 tick false (2,b,1){s:1} → ticked false (max stamp b:1),
     field twin on `ticked`.
   - **G15 causal-dominance**: s:1 add x · a:1 tick true (2,a,1){s:1} · b:1 tick false (3,b,1){s:1,a:1} → ticked false, no field twin.
   - **G16 two-moves-into-one-gap-then-between**: s:1 add x a0 · s:2 add y a1 (2,s,2){s:1} · s:3 add z a2 (3,s,3){s:2} · s:4 add w a3
     (4,s,4){s:3} · a:1 move z `a0Va1` (5,a,1){s:4} · b:1 move w `a0Vb1` (5,b,1){s:4} · a:2 move y `a0Vb0Va1` (6,a,2){s:4,a:1,b:1} →
     order [x, z, y, w].
   - **G17 move-vs-delete**: s:1 add x a0 · s:2 add y a1 (2,s,2){s:1} · a:1 move x `a2a1` (3,a,1){s:2} · b:1 delete x (3,b,1){s:2} →
     x deleted; order [y].
   - **G18 claim-release-claim-again**: s:1 add x · a:1 claim sari (2,a,1){s:1} · a:2 release sari (3,a,2){s:1,a:1} · a:3 claim sari
     (4,a,3){s:1,a:2} · b:1 claim budi (2,b,1){s:1} → winners [budi], losers [sari].
   - **G19 prefix-key**: s:1 add x a0 · s:2 add y `a1V` (2,s,2){s:1} · s:3 add z a2 (3,s,3){s:2} · a:1 move z `a1Ga1` (4,a,1){s:3} →
     order [x, z, y].
   - **G20 split-25-over-3** (pending: sum-split): s:1 expense.add e {label "Gas", amountCents 2500, payer sari, members [sari, budi,
     dewi]} → shares {budi: 834, dewi: 833, sari: 833}.
   - **G21 split-k0** (pending: sum-split): s:1 expense.add e {label "Gas", amountCents 2500, payer sari, members []} → shares {},
     unallocated 2500.
9. **Mutation fixtures** `kit/props/bad/` (kit-owned) — each a deliberately wrong replacement for one rule or op, and a test
   `kit/props/mutants.props.test.ts` asserting that **each one fails at least one property or golden history** (otherwise the suite is
   vacuous): `tick-toggle` (fails set equal-values), `lww-wallclock` (`Date.now()` tie-break; fails causal dominance under skew),
   `qty-read-modify-write` (a delta op that writes seen+1; fails delta), `split-float` (float shares; fails split), `delete-wins` (fails
   life / no lost edit), `claim-both` (every claimant wins; fails claim), `claim-max-stamp` (highest stamp wins; fails claim precedence),
   `move-reinsert` (move as delete + insert; fails move no-duplicate), `severity-lww` (a max op merged by LWW; fails max),
   `split-first-member` (remainder to the first listed member, not the first by id; fails golden G20 when run against the fixture's
   reducer), `resolve-noop` (a resolve that leaves its twin; fails life), `arrival-order` (result depends on arrival order; fails
   convergence — proves the scheduler really permutes deliveries).
10. **Full-tier evidence**: `pnpm props:full` runs the suite with `LIMBO_PROPS_TIER=full` and writes
    `evidence/convergence/full-<YYYY-MM-DD>.json` (replicas, orderings, seed, pass count per property, vacuity share per class, yjs
    version, node version, duration). Add the script to the root `package.json`.
11. **G1 two-context spike harness**: a minimal page (`e2e/spike/index.html` + `e2e/spike/main.ts`, served by Vite on a fixed port via
    Playwright `webServer`) that runs ONE replica per browser context with its own storage: ops stored in a Yjs `Y.Map` keyed by op id,
    persisted with `y-indexeddb`, behind `skeleton/src/sync/store.ts` (the only file that imports Yjs). Replicas exchange ops through a
    tiny local HTTP mailbox (`e2e/spike/relay.mjs`: POST ops, GET ops since a cursor; it stores and forwards, no merge logic), polled
    every 200 ms with `fetch`, so `context.setOffline(true)` is a real partition. The page exposes `window.limbo` (`add`, `tick`, `delete`,
    `move`, `claim`, `state()` = canonical materialized state). `e2e/offline-spike.spec.ts`: two contexts load the same seed (x, y, z);
    both go offline; A ticks x, B deletes x; A moves z to the top, B adds an item; both claim y; while offline B's state must not show A's
    edits and vice versa (a real partition); reconnect; wait until both states are equal; assert x is a twin, y has exactly one winner,
    the order is equal on both. A `pnpm e2e:spike:10` script runs it with `--repeat-each=10` and writes
    `evidence/e2e/spike-<YYYY-MM-DD>.json` (pass count, durations, browser version).
12. **Kit hygiene** (first task): in `kit/hooks/lib.mjs`, write `target` and `detail` paths relative to the repo root (replace the
    absolute root prefix with `.`), so the committed hook ledger holds no machine paths; keep the selftests green.

## Out of scope
UI components (fog, wisps, twin, inspector), the in-page replica pair, service worker, sync status, the PeerJS relay, the `sum-split`
reducer and expense ops, AFTERSHOCK ops, the MCP server.

## Task rules
- Order: kit hygiene → op layer + causal buffer → merges → simulator → harness + intent properties + vacuity → intent manifest →
  golden histories + runner → mutation fixtures + mutant test → first ops (add, tick, delete, restore, claim, release, move) → full-tier
  evidence script → G1 spike harness + e2e → **last: `item.rename`** (its own task, nothing else in it).
- Every task names the tests that prove it and ends with `pnpm typecheck && pnpm test && pnpm props` green (except where a later task's
  ops do not exist yet).
- Tests and properties are never weakened to make a task pass.

Keep requirements.md, design.md and tasks.md concrete. When done, list the tasks.
