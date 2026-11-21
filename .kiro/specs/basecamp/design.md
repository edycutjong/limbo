# Design: basecamp

Requirements: `requirements.md` (R1 to R17). The op contract in `.kiro/steering/local-first.md` is binding. Wording: "measured, property-tested".

## 1. What exists, what this spec adds

| Exists | Used as is |
|---|---|
| `skeleton/src/core/merges.ts` | `causalLww`, `resurrect`, `claimOne`, `orderedMove` (the model already imports them by path) |
| `skeleton/src/sync` | `createPair` (in-page link, in-memory or IndexedDB stores), `createReplica`, `attachLink`, `deriveSync`, `deleteStore` |
| `skeleton/src/limbo` | `LimboShell`, `ReplicaPair`, `Inspector`, `Twin`, `ShuffleTest`, `runShuffle` |
| `apps/basecamp/src/model.ts` | `materialize` for items (extended, not rewritten) |
| `apps/basecamp/src/ops/item.*.op.ts` | eight ops, unchanged |
| `kit/props` | `splitIntent`, `addRemoveIntent`, goldens, mutants, `intents.json` |
| `e2e/spike/relay.mjs` | store-and-forward server for e2e (b) |

New in the skeleton (R1.2): `sumSplit` in `core/merges.ts` (about 12 lines), `sync/dev-relay-link.ts` (about 70 lines) and their tests. Measured while writing this spec (non-test, non-`test/` files under `skeleton/src`; blank and comment-only lines removed): 20 files, 2,020 lines, against a provisional budget of 1,800. The skeleton is already past the line budget before this spec starts. Task 1 records the exact baseline in `evidence/`; tasks 3 and 18 add only the lines above and report the new total. The budget is not raised here (open point 1).

`skeleton/src/index.ts` is at 15 exports and does not change. `sumSplit` is imported by path (as the model already imports the other merges). The dev relay link is reached by a package subpath `@limbo/skeleton/dev-relay-link` in `skeleton/package.json` `exports` (no entry in `index.ts`).

## 2. App layout

```
apps/basecamp/
  index.html  vite.config.ts  app.config.ts  package.json
  src/
    main.tsx            boot: pair or dev-relay solo, mount
    app.css             layout only; colours come from limbo tokens
    model.ts            items + expenses fold (extended)
    conflicts.ts        describeConflicts, twinCount
    actions.ts          op creation helpers (one per user action)
    members.ts          member map a->sari, b->budi, display names, author -> member
    money.ts            parseCents, formatCents (string ops, no float, no locale)
    seed.ts             seed script, seedOps
    scene.ts            lake scene script, goldens (ids + hand-written states)
    shuffle.worker.ts   worker entry: runShuffle + materialize
    devrelay.ts         solo replica over DevRelayLink (dev/test only, dynamic import)
    views/
      ReplicaBody.tsx   list + expenses + add field + empty state for one replica
      ItemRow.tsx  ClaimChip.tsx  ItemTwins.tsx  ExpenseRow.tsx  AddItem.tsx
      ScenePanel.tsx    Play the lake scene, "scripted edit" tags
    ops/
      expense.add.op.ts  expense.setAmount.op.ts  expense.addMember.op.ts  expense.removeMember.op.ts
      expense.state.ts   shared membership and amount state (not an op file)
      (each op: *.props.ts, *.props.test.ts scaffolded; registry.gen.ts generated)
```

`*.test.ts` run in the `unit` project (the glob already covers `apps/*/src/**/*.test.ts`). Component tests are `*.test.tsx`; task 1 adds `apps/*/src/**/*.test.tsx` to the `limbo` (jsdom) project `include`. No other Vitest setting changes. `tsconfig.json` `include` gains `apps/*/src/**/*.tsx` and `apps/*/*.ts`. Vite builds the TSX with its default esbuild transform (`jsx: react-jsx` is in `tsconfig.base.json`), so no React plugin is needed. If the build proves otherwise, task 1 adds `@vitejs/plugin-react` as a dev dependency and says so.

## 3. Model changes (`model.ts`)

The item fold keeps its shape. Additions, all derived from ops already read:

```ts
interface Item { /* existing fields */
  claims: { winners: ClaimInfo[]; losers: ClaimInfo[] };   // ClaimInfo = { who, op: string, stamp: Stamp }
  lifeInfo?: { deletedBy: string[]; editedBy: { by: string; kind: 'tick'|'rename'|'claim'|'restore'|'add'; op: string }[] };
  values: { name: { by: string; value: string }[]; ticked: { by: string; value: boolean }[] };  // frontier values when twinned
}
```

`by` is the author replica id (`stamp.r.split('#')[0]`, so `a`, `b` or `seed`). `members.ts` maps it to a member. The model stays free of display names.

- `lifeInfo` comes from `resurrect().active` (deleters) and `.resurrecting` (editors). The caption's "who deleted" is the lowest-stamp active delete author and "who {verb}" is the lowest-stamp resurrecting edit.
- `claims.winners` and `.losers` keep the `claimOne` order. The existing `winners: string[]` and `losers: string[]` stay for the kit (`app.props.ts` reads them).
- `units`: the model passes `first.payload.units` to `claimOne`. The op-level state in `item.claims.ts` keeps `UNITS = 1` (the op invariant says "at most one winner per unit" for a single-unit view). The model is the only place that knows the item's units, because `units` lives on `item.add`. This does not weaken `item.claim` or `item.release` properties. It means the op-level state is a one-unit projection, which the kit's `claim` intent already reads through `app.props.ts` `units`.
- `pos` twins stay in `fieldTwins` as today. `conflicts.ts` ignores them (R9.3).

Expense fold (`expense.*` ops grouped by target, after the existing causal buffer):

```
adds   = expense.add ops on the target, ascending stamp; first = adds[0]; none => absent
amount = causalLww([first as {amountCents}, ...expense.setAmount])         // value + twins
members = present(addsOf, removes)
   addsOf   = first's members (each is an add dot by `first`) + expense.addMember ops
   removes  = expense.removeMember ops
   present  : member m is in iff some add a of m has no remove r of m with covers(r, a)
shares = sumSplit(amount.value, members sorted)
unallocated = members.length === 0 ? amount.value : 0
```

`present` lives in `ops/expense.state.ts` and is used by the op state and by the model, so the op property and the model cannot disagree. `State` becomes `{ items, order, expenses }`. The spike page and `app.props.ts` read only `items` and `order`, so they keep working.

## 4. Ops

| Op | Merge | Intent | Payload | State (keyed by op id) |
|---|---|---|---|---|
| `expense.add` | commutes | split | `{ label, amountCents, payer, members }` | `adds[op.id] = { target, ...payload }` |
| `expense.setAmount` | causal-lww | split | `{ amountCents }` | `{ writes, amountCents }` like `item.rename` |
| `expense.addMember` | commutes | split | `{ member }` | `adds[op.id] = { target, member }` |
| `expense.removeMember` | commutes | split | `{ member }` | `removes[op.id] = { target, member, deps }` |

Intent: `intents.json` maps `expense.addMember` to `split`, and its `split` oracle checks "shares sum to the amount and match members". The requirement asked for an add-wins set with intent `add-remove`. The manifest wins for the declared intent (steering rule 2), so all four ops declare `split`. The add-wins behaviour is checked by also running the kit `addRemoveIntent` in the member ops' `checks` (R6.6). That gives both oracles. If the owner prefers `add-remove` as the declared intent, the manifest entry changes in the same spec edit (open point 2).

Each op's `*.props.ts` supplies a `conflictGen` with payload generators: amounts as integers in `[0, 100000]` (including 0), members from `['sari','budi','citra','dewi']` so that concurrent add and remove of the same member happens often, and the vacuity guard sees the classes. `splitIntent` `read` takes `{ amount, members, shares }` from the op state: amount from the last `causalLww`, members from `present`, shares from `sumSplit`. `removeMember`'s props check that a remove which observed an add removes it and that a concurrent add survives.

State rejects nothing silently: an invalid payload (non-integer cents) fails the invariant, which the harness reports. The UI never creates one (`money.ts` returns integer cents or an error).

## 5. `sumSplit`

```ts
export function sumSplit(amountCents: number, members: readonly string[]): Record<string, number> {
  if (!Number.isInteger(amountCents) || amountCents < 0) throw new Error(`sumSplit: bad amount ${amountCents}`);
  const ids = [...new Set(members)].sort();           // default sort is UTF-16 code-unit order
  const k = ids.length;
  if (k === 0) return {};
  const base = Math.floor(amountCents / k), rem = amountCents % k;
  return Object.fromEntries(ids.map((id, i) => [id, i < rem ? base + 1 : base]));
}
```

`Math.floor(a / k)` on integers below 2^53 is exact for the amounts this app holds (the op invariant caps `amountCents` at `Number.MAX_SAFE_INTEGER`). G20 gives `budi` 834, `dewi` 833, `sari` 833. G21 gives `{}` and `unallocated` 2500 from the model.

The model applies this to the converged amount and member set. No op declares `merge: 'sum-split'`: the three ops it depends on have their own rules, and `sum-split` names the derivation. `ExpenseRow` shows it as the rule line. The Inspector's merge column therefore never shows `sum-split`, because it lists ops. That is deliberate, and open point 3 asks whether the owner wants an op to declare it.

Goldens: remove `pending` from `G20.json` and `G21.json` once the golden runner passes them. Update `kit/props/golden.test.ts` line 44 so it expects no pending file. The mutants `split-float` and `split-first-member` keep running against G20, and now also against the real reducer path.

## 6. Conflicts and resolve actions

`conflicts.ts`:

```ts
export function describeConflicts(s: State): ConflictDescriptor[]   // ordered by (target, rule, key)
export const twinCount = (s: State): number => describeConflicts(s).length;
```

| Source | Descriptor id | rule |
|---|---|---|
| item `life === 'twin'` | `${id}:life` | `resurrect` |
| item loser `who` | `${id}:claim:${who}` | `claim-one` |
| item `name` / `ticked` field twin | `${id}:name`, `${id}:ticked` | `causal-lww` |
| expense amount twin | `${id}:amount` | `causal-lww` |

The caption string is built in the view from the model (member names via `members.ts`), so `conflicts.ts` keeps `caption` as a short neutral text and the view renders the full line.

`actions.ts` holds one function per user action. Each takes a `Replica` and creates the op with `replica.local(name, target, payload)`, which sets `l`, `n` and `deps` (the current vv). Because `deps` is the full vv, a resolve op observes every op the replica holds on that target at that moment:

| Action | Op | Why it resolves |
|---|---|---|
| Keep | `item.restore {}` | covers the active delete, so the active set is empty: alive |
| Delete (twin) | `item.delete {}` | covers the edit that resurrected, so it no longer resurrects: deleted |
| OK (claim loser) | `item.release { who }` | covers the loser's own claim, so it is no longer eligible |
| Stop bringing it | `item.release { who }` | same |
| Pick a name | `item.rename { name }` | covers both frontier writes, becomes the only frontier value |
| Pick Ticked / Not ticked | `item.tick { ticked }` | same |
| Pick an amount | `expense.setAmount { amountCents }` | same |

New item target: `` `${replica.ns}:${(replica.vv()[replica.ns] ?? 0) + 1}` ``, which equals the new add op's own id, so two replicas cannot choose the same id and nothing random or clock-based is read. The key comes from `allocKey(left, right, replica.ns)` over the neighbours' `pos` in the current `order`.

Claim `who` is the replica's member id. A release's `who` equals the loser's `who`, so `claimOne` cancels the loser's claim only when the release observed it. Budi's OK is created by replica `b` after it holds his claim, so it covers it.

## 7. App assembly and views

`main.tsx`:

```
if (devrelay && (import.meta.env.DEV || import.meta.env.MODE === 'test')) → (await import('./devrelay.ts')).mountSolo(...)
else pair = await createPair({ app: 'basecamp', defs, materialize, twinCount, seedOps })
     <LimboShell pair defs describeConflicts>
       <h1>/<p> tagline "For people whose shared list breaks when the signal does."
       <ReplicaPair pair names={{a:'SARI',b:'BUDI'}} plate={{a:1,b:2}} onReset onAdd renderReplica={(id) => <ReplicaBody id/>} />
       <ScenePanel/> <ShuffleTest ... />
```

The dynamic import sits behind a literal `import.meta.env.DEV || import.meta.env.MODE === 'test'` test. Vite replaces it with `false` in a production build, drops the branch and the chunk, and R13.6's `dist/` text check enforces it.

`ReplicaBody({ id })` reads `useLimbo(id)` for `conflicts`, `queued`, the model state (`replica.state()`), and renders:
1. `AddItem` and the empty state.
2. `ItemRow` for each id in `order`. A twin item has `life === 'twin'`, so it is in `order`; a `deleted` item is not.
3. `ExpenseRow` for each expense.
4. `Inspector id={id}` controlled by an app-level `inspectorOpen: Id | null`. "Why Sari?" sets it. Task 16 checks that the layer's `I` key still toggles a controlled drawer. If it does not, the app binds `I` itself in `ReplicaBody` with the layer's input-field exclusions.

Twin variants (`ItemTwins.tsx`) call `Twin` with `replica={id}` and the descriptor id from the table above:

| Variant | atRest | ghost | caption | rule line | actions |
|---|---|---|---|---|---|
| life | the row (ticked) | the row's name, struck | `TWIN · {deleter} deleted this while {editor} {verb} it · rule: resurrect` | `resurrect` | Keep, Delete |
| claim loser, on loser | the row | `Your claim — {winner} is bringing it` | stamps line (shown after Why) | the claim-one sentence of R4.4 | OK, Why {winner}? |
| claim loser, on winner | the row | none | quiet note `{loser}'s claim lost · rule: claim-one` | `claim-one` | none |
| value (name, ticked, amount) | the row | the other value | `TWIN · {A} set this to “{v1}” while {B} set it to “{v2}”` | `causal-lww` | one button per value |

The layer's `Twin` returns null when its descriptor is absent, so a resolved twin leaves with the descriptor. The "quiet note" is not a `Twin` (no actions); it is a plain `<p>` rendered while the descriptor exists on the winner's replica.

`ClaimChip` inputs: the item's `claims` from the model, the viewer `me` (member map), and `pair.queued(id)`. Decision order: no winners and no queued claim by `me` → "I'll bring it" (and, if `units > 1` and `k < units`, still offered); queued claim by `me` and `me` among winners → "Yours? waiting"; `me` among winners → "{Name} is bringing it" + "Stop bringing it"; else the winners' names. "Now you're bringing it" is a ref in the row holding `wasLoser` from the previous render; presentation state only.

Reorder: the handle is a `<button>` with `onKeyDown` (ArrowUp/Down, `stopPropagation` and `preventDefault`) and pointer events for drag (`pointerdown` captures, `pointermove` computes the target index from the rows' bounding boxes, `pointerup` calls `actions.move`). `move(id, index)` allocates the key from the two neighbours' `pos` after removing the item, as the spike's `move` does.

`money.ts`: `parseCents(text)` accepts `^\d+(\.\d{1,2})?$` after trimming and a leading `$`, and builds cents with string and integer math (`whole * 100 + frac.padEnd(2,'0')`). `formatCents(n)` gives `$26.00` by string slicing. Neither calls `toLocale*`, `Intl` or divides floats.

`window.limbo` (dev and test only): `{ ready, pair, state(id), ops(id), view(id), queued(id) }`. `state(id)` returns `canonical(replica.state())`. It is assigned in `main.tsx` inside the same guarded branch, so it is dropped from production.

## 8. The lake scene and why it is deterministic

Fresh databases, fixed replica ids `a` and `b` and `createReplica`'s namespace `${id}#${k}` with `k = 1` give ids `a#1:n` and `b#1:n`. The seed has 15 ops by replica `seed` (10 adds, 2 claims, 1 tick, 2 expense adds), so after the seed each replica's next Lamport counter is 16. The scene performs, in this order: A tick `tent` (`l = 16`), B delete `tent` (`l = 16`), A claim `stove` (`l = 17`), B claim `stove` (`l = 17`). Both stove claims therefore carry `l = 17`, and `compareStamp` breaks the tie by `r`: `a#1` sorts before `b#1`, so Sari wins. The resolves are A `item.restore` (`a#1:3`) and B `item.release` (`b#1:3`). Task 10 asserts the `l` and id values in a unit test over a real `createPair`, so a change to the seed breaks that test, not the e2e.

`scene.ts` exports:

```ts
export const lakeScript: { replica: 'a'|'b'; run(r: Replica): Op }[]   // the four partition edits
export const goldens: Golden[]   // [{ opIds, state }] for the seed and for the finished lake scene
```

Golden `state` strings are canonical JSON written by hand (a literal in `scene.ts` generated once from the stated expectations, not from `materialize` at runtime). A unit test (R12.4) asserts the stated expectations field by field and that `canonical(materialize(ops))` equals the literal in several fixed shuffled orders. If the two disagree, the test fails and a human decides which is wrong.

`ScenePanel` runs `lakeScript` with a presentation delay (350 ms between edits, an injectable prop, 0 in tests) so the viewer sees the wisps grow one by one. Each op id it created goes into a presentation set, rendered as "scripted edit" next to the row. The set clears when `pair.view('a').link` goes back to `up` (a read of the view, not a timer). The button shows while `view('a').link === 'down'` and the scene flag is unset; **Reset demo** clears the flag.

## 9. DevRelayLink and the solo page

`createDevRelayLink({ url, replicaId, fetch = globalThis.fetch, pollMs = 150 })` returns a `Link`:

- State: starts `down`. A successful `GET /ops?since=0` makes it `up` and fires `onState('up')`. A failed `GET` or `POST` makes it `down` and fires `onState('down')`. Browser offline mode rejects `fetch`, so this follows `context.setOffline`.
- On `up`: it emits `{ t:'hello', replica:'relay', vv: relayVV }` where `relayVV` is the per-author highest `n` over the relay's ops (the relay log is append-only and arrives in order per author). The session then sends what the relay lacks as `ops` messages.
- `send({t:'ops'})`: `POST /ops` with the ops. On success the link emits `{ t:'ack', vv }` with `relayVV` merged with the posted dots. `send({t:'hello'|'ack'})` is dropped (the relay has no presence).
- Poll: a `setTimeout` chain while the link has handlers. Each tick `GET /ops?since=cursor`, drops ops authored by `replicaId`, emits `{ t:'ops', ops, vv: relayVV }` for the rest, and advances `cursor`. The chain stops on the last unsubscribe.
- `isUp()` returns the current state. `fetch` is injected so the unit test uses an in-memory relay with no network.

The relay's cursor and dedupe by op id are enough because the replica's `receive` is idempotent and `attachLink` acks after applying. Client-side polling is allowed only here, and only in dev and test. The relay has no timer and does no merge.

`devrelay.ts` `mountSolo({ url, r })`: opens `openStore('limbo:basecamp:solo-'+r)`, `createReplica({ app:'basecamp', replicaId: r, defs, materialize, twinCount, store, seedOps })`, `attachLink(replica, createDevRelayLink(...))`, and renders `ReplicaBody`-free output: the item list as text (name, ticked, life, winners), a status line from `deriveSync` over the session, and `window.limbo` with `{ ready, state, ops, queued, tick, delete, claim }`. `LimboShell` needs a `Pair`, which a remote peer cannot be, so the solo page does not use the layer. Fog and wisps are covered by e2e (a); (b) covers the real offline path.

## 10. Decisions and open points

1. **Skeleton budget.** The skeleton already measures 20 files and 2,020 lines against 1,800 (§1). This spec adds the two files the brief requires. It does not raise the budget. The owner decides whether to raise it, or to move `dev-relay-link.ts` out of `skeleton/` (the brief names its path).
2. **Intent of member ops.** The brief says `add-remove`. `intents.json` already says `split` for `expense.addMember`. The design declares `split` on all four and runs `addRemoveIntent` as an extra check. A manifest change would need an edit to a kit file and the owner's confirmation.
3. **`sum-split` as an op rule.** No op declares it (R6 keeps `commutes` and `causal-lww` as written). It names the derivation shown on `ExpenseRow`.
4. **Move twins.** Concurrent moves are not shown as twins (R9.3). Rule 7 says a conflict the user should see becomes a twin. A reorder is a layout, not data, and `ordered-move` places it deterministically. Say so if you want them surfaced.
5. **"Why Sari?" highlighting.** The layer's `Inspector` has no row-highlight prop, and `skeleton/src/limbo` does not change. The twin prints both stamps itself and the Inspector lists both claim ops. A highlight would be a layer change.
6. **Item claims with units over one.** The op-level `UNITS = 1` constant stays. See §3.
7. **Scripted op ids.** The golden for the lake scene depends on fresh databases. It stops matching after a manual detour, and the page then prints no golden line (R12.3). That is the intended behaviour.
8. **Solo page.** The dev relay page does not use `LimboShell` (§9).
9. **Fast-check cost.** Four new ops add four props suites to `pnpm props`. The fast tier stays at the configured 500 orderings. `pnpm props:full` runtime is measured at the end and recorded in `evidence/`.

## 11. Test plan

| Area | Test | Project |
|---|---|---|
| `sumSplit` | examples, k = 0, property sums, order independence | unit, props |
| expense ops | four `*.props.test.ts` through `runOpProperties` | props |
| goldens | G20, G21 pass through the golden runner; `golden.test.ts` updated | unit, props |
| mutants | `split-float`, `split-first-member` still fail | props |
| seed | sha256 constant, determinism, expected materialization (R2.5) | unit |
| model | claims with units, lifeInfo, expense fold, absent expense | unit |
| conflicts | table of §6, count equals descriptors | unit |
| actions | each resolve op clears its twin over a real two-replica run (`createReplica` + manual delivery) | unit |
| money | parse and format cases, rejects 3 decimals and negatives | unit |
| views | `ItemRow`, `ClaimChip` cases, twin variants, `ExpenseRow`, reorder keys, empty state | limbo (jsdom) |
| scene | lake scene over a real `createPair` with manual `settle()`: R10.1 to R10.8 on the DOM | limbo |
| goldens | R12.4 | unit |
| DevRelayLink | fake fetch, R14.5 | unit |
| build | `vite build` then scan `dist/` (R13.6) | unit (spawns the build) |
| e2e | `e2e/basecamp-offline.spec.ts` (a), (b) | Playwright |

The scene test is the fast mirror of e2e (a): the same assertions run against jsdom with `pair.settle()` instead of real timers, so e2e failures isolate browser concerns.

`playwright.config.ts` becomes two projects: `spike` (`testMatch: 'offline-spike.spec.ts'`, baseURL 5173) and `basecamp` (`testMatch: 'basecamp-offline.spec.ts'`, baseURL 5174). `webServer` gets a third entry: `pnpm --filter @limbo/basecamp exec vite --port 5174 --strictPort`, url `http://localhost:5174/`, `reuseExistingServer: !process.env.CI`. The relay on 5175 stays as it is. Test (b) opens `/?devrelay=http://localhost:5175&r=a` and `...&r=b` in two contexts.
