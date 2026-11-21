Create a Kiro **feature spec** named `basecamp` (requirements-first, EARS acceptance criteria) under `.kiro/specs/basecamp/`:
`requirements.md`, `design.md`, `tasks.md`. Write only those three files. Do not implement anything yet. Do not run git.
Read `.kiro/steering/*.md` first, then `.kiro/specs/merge-kit/`, `.kiro/specs/skeleton-sync/`, `.kiro/specs/limbo-layer/`, the existing
ops in `apps/basecamp/src/ops/`, `apps/basecamp/src/model.ts`, and the pending golden split histories `kit/props/golden/G20.json`, `G21.json`.

## Goal
BASECAMP is app 1 on the LIMBO skeleton: a group trip packing list that keeps working with the signal gone and merges back without
losing an edit. Who it is for (first line of the page): "For people whose shared list breaks when the signal does." A static Vite +
React SPA in `apps/basecamp/` that uses the skeleton (`@limbo/skeleton`) unchanged; everything list-specific lives in the app.

## The flow it must nail (the judge's path; the e2e asserts every line)
Pair view (replica A = Sari, id `a`; replica B = Budi, id `b`; fixed ids so the result is reproducible), seeded list, both "Live":
1. Cut the link → both cards fog over; chip "Offline".
2. A ticks **Tent (2-person)**; B deletes it → A "1 waiting", 1 wisp; B "1 waiting", tent gone on B.
3. Both claim **Stove (the last one)** → both "2 waiting"; both show the provisional chip "Yours? waiting".
4. Restore → wisps cross (2 each way); haze "Syncing 2…" while ops are unacked or the peer's are not applied; when both directions are
   done, both cards hold the same list, twins included, and the fog lifts.
5. Tent returns on both as the ticked row + a ghost twin: "TWIN · Budi deleted this while Sari ticked it · rule: resurrect", buttons
   **Keep** · **Delete**.
6. Stove: "Sari is bringing it" on both (both claims carry the same Lamport counter after the same seed; the tie goes to replica id
   `a` < `b`). On B the loser ghost "Your claim — Sari is bringing it", rule line "claim-one: offline nobody can know who was first, so
   every phone applies the same order (lower Lamport stamp, then replica id)", buttons **OK** and **Why Sari?** (opens the inspector at
   both stamps). On A a quiet note "Budi's claim lost · rule: claim-one". Budi's **OK** emits `item.release {who: "budi"}` (withdraws
   his claim), which resolves the conflict everywhere.
7. A taps Keep, B taps OK → the two resolve ops sync; both cards deep-equal with 0 twins; the FIXED stamp fires.
8. Inspector on A: Recent exchanges newest first = the 2 resolve ops, then the 4 partition-era ops, each with merge, stamp `l·r·n`, deps;
   Conflicts = the 2 resolved twins and their rules.
9. Shuffle test over the ops on screen prints the count it ran and "matches the specified result ✓" against the golden outcome of the
   seed script.
A **Play the lake scene** button appears once the user has cut the link and performs steps 2–3 on both cards one by one, each
labelled "scripted edit"; the user then restores and taps the resolves. Manual edits stay possible at every step.

## Features
- **Items** (existing ops; keep their merges): add (`commutes`, unique ids; `units` fixed at create), rename (`causal-lww`; concurrent
  different names → value twin with one button per value, the tap writes a pick-one value that observes both), tick (`causal-lww`
  set true/false, never a toggle; equal concurrent values are not a conflict), delete/restore (`resurrect`; Keep/Delete resolve),
  claim/release (`claim-one`; winner chip "Stop bringing it" releases, and the next eligible claimant sees "Now you're bringing it";
  units > 1 shows "2 of 2 claimed"), reorder (`ordered-move`: drag handle plus keyboard move up/down; key allocation at op creation).
- **Shared expenses** (new): ops `expense.add` (payload `{label, amountCents, payer, members}` as in G20/G21; `commutes`), an amount
  edit (`causal-lww` on integer cents; concurrent different amounts → value twin), member add/remove (add-wins set, `commutes`, intent
  `add-remove`). The **`sum-split` reducer** lands here in `skeleton/src/core/merges.ts` (the rule name already exists): shares are
  derived from the converged amount and member set — floor(amount / k) each, the remainder cents one each to the first member ids in
  code-unit sort order; k = 0 → no shares. Un-pend G20 and G21 (remove their `pending` field) once the reducer passes them, and wire
  the kit's `split` intent (`kit/props/intent/split.ts`) for the expense ops through the op's declared intent. Scripted moment: offline,
  A adds Dewi to "Gas + snacks" while B changes the amount to $26.00 → after reconnect four members, $6.50 each, Σ = $26.00 on both.
- **Seed** `apps/basecamp/src/seed.ts`: a deterministic op script authored by the fixed replica `seed` with fixed counters ("Lake camp ·
  Sat–Sun"; people Sari, Budi, Citra, Dewi; member ids lowercase). Items in order: Tent (2-person, units 1) · Stove (the last one, units 1) ·
  Gas canister ×2 (units 2; Citra is bringing one) · Water filter (Dewi is bringing it) · Headlamps ×4 (units 4) · First-aid kit ·
  Sleeping mats ×4 · Rope (10 m) · Cooler · Coffee + filters (ticked). Expenses: Campsite fee $48.00 paid by Sari, members all four →
  $12.00 each · Gas + snacks $25.00 paid by Budi, members Sari/Budi/Citra → Budi $8.34 · Citra $8.33 · Sari $8.33. A test prints the
  sha256 of the seed's canonical JSON and asserts it is stable.
- **Views** `apps/basecamp/src/views/`: `ItemRow` (drag handle · tick box · name · `ClaimChip` · overflow rename/delete), the twin
  variants through the skeleton's `Twin` (resurrect, claim loser, value), `ExpenseRow` (amount, payer, members, each member's share in
  cents, tabular numerals), add-item field, empty state "Nothing packed yet. Add the first thing." Pair view by default ≥ 640 px,
  single replica below (`?replicas=1|2` override), all from the `limbo-layer` components. The app materializes conflicts into the twin
  count the status uses.
- **Shell**: `apps/basecamp/index.html`, `vite.config.ts`, `app.config.ts` (app name, defs, materialize, seed, golden outcome),
  `pnpm --filter @limbo/basecamp dev|build|preview`; a production build that is a static `dist/`. Expose `window.limbo` in dev and test
  builds only (state/ready hooks the e2e uses).
- **E2E** `e2e/basecamp-offline.spec.ts` (Playwright; add a project/webServer for the BASECAMP dev server next to the spike's, keep the
  spike test working): (a) the pair-view flow 1–8 above in one page, asserting the on-screen text and that the two replicas' canonical
  states deep-equal at the end; (b) two browser contexts, each a single replica, joined by a **dev-only** `DevRelayLink`
  (`skeleton/src/sync/dev-relay-link.ts`, enabled only with a `?devrelay=<url>` query in dev/test, pointing at the existing
  `e2e/spike/relay.mjs` store-and-forward test server; never used in production, no server-side polling anywhere): both contexts
  `setOffline(true)` → A ticks the tent, B deletes it, both claim the stove → while offline **no** edit crosses → `setOffline(false)` →
  canonical states deep-equal, tent twin on both, exactly one stove claimant.

## Properties
Every new op gets its scaffolded `*.props.test.ts` and registers in `registry.gen.ts` (the hooks do this when you create `*.op.ts`).
`pnpm props` stays green at the fast tier and the full tier (`pnpm props:full`, 10,000 orderings) must still pass at the end.
Never weaken a property, test, hook or the vacuity guard; if a property fails, fix the op.

Each task must end with `pnpm typecheck && pnpm test && pnpm props` green (plus `pnpm e2e` for the e2e tasks). Keep tasks small,
numbered, with requirement ids; put the e2e tasks last.
