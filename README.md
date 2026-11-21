# LIMBO

When the connection dies, your app crosses over, keeps working on the other side, and comes back without silently losing an
edit — a measured, property-tested claim, not a proof (see [Evidence](#evidence)).

For people whose shared list breaks when the signal does, and for the builders who need offline merges that do not diverge.

LIMBO is a Kiroween **Skeleton Crew** entry: a local-first skeleton where every operation declares how it merges, plus a `/.kiro`
kit (steering, hooks, custom agents, specs) under which Kiro built the skeleton and its apps.

> **Status (2026-11-22, interim README; the full one comes later).** Built: the skeleton and both apps on it, **BASECAMP**
> (`apps/basecamp`, a group trip list) and **AFTERSHOCK** (`apps/aftershock`, a field form whose sector reports merge into a shared
> grid; demo data only), live at https://basecamp.limbo.edycu.dev and https://aftershock.limbo.edycu.dev. The cross-device relay is
> not built: two replicas sync through the in-page simulated link, or through a dev-only test relay in the e2e suite.

## Try it locally (about 2 minutes)
```
pnpm install
pnpm --filter @limbo/basecamp dev        # http://localhost:5174
```
On a desktop-width window you get two replicas side by side: **Replica A — Sari** and **Replica B — Budi**.
1. Press **Cut link** on the cord between them. Both cards fog over; the cord is labelled as a simulated link, because DevTools
   "offline" does not cut it.
2. Press **Play the lake scene** (or do it by hand): Sari ticks the tent while Budi deletes it, and both claim the last stove.
   Each card counts its waiting edits.
3. Press **Restore link**. The edits cross; the tent comes back as a ghost **twin** (rule `resurrect`), the stove goes to one
   claimant on both replicas (rule `claim-one`), and the fog lifts once both sides agree.
4. Tap **Keep** on the tent twin and **OK** on the lost claim. The **FIXED** stamp appears.
5. Click inside a card, then press **I** (or use its Inspector button) for the inspector: each op that crossed, its declared merge rule, its causal stamp and deps.
6. **Run shuffle test** replays the ops on screen in random causal orders in your browser and prints the count it actually ran.

**Reset demo** returns the pair to the seed. `?replicas=1` shows a single replica.

## Evidence
- Full property tier: 3 replicas × 10,000 random orderings, seed 20251031, every property passing —
  [`evidence/convergence/full-2026-11-21.json`](evidence/convergence/full-2026-11-21.json) (log beside it).
- Offline e2e: the lake-scene test (one page, the pair view) and the two-browser-context test (a real partition through a dev-only
  test relay, then convergence) each passed 10 of 10 repeats —
  [`evidence/e2e/task-21-repeat10.txt`](evidence/e2e/task-21-repeat10.txt); fresh-clone runs (before and after
  the Inspector bugfix) —
  [`evidence/e2e/fresh-clone-2026-11-21.txt`](evidence/e2e/fresh-clone-2026-11-21.txt).
- How much of the product code Kiro wrote: [`evidence/kiro/share.json`](evidence/kiro/share.json) (commits touching `skeleton/` or
  `apps/` that carry a `Kiro-Session` trailer). Every Kiro session: [`evidence/kiro/sessions.jsonl`](evidence/kiro/sessions.jsonl);
  every hook fire: [`evidence/kiro/hooks.jsonl`](evidence/kiro/hooks.jsonl).

Offline claims are provisional. No CRDT can stop two offline people from claiming the last stove; LIMBO's declared rule picks one
claimant deterministically when they reconnect, and the other sees a twin naming the winner.

## Layout
- `.kiro/` — steering, hooks, custom agents, specs (authored by Kiro; never gitignored)
- `skeleton/` — the template: op layer, named merges, causal delivery, replica + sync, the Limbo visual layer
- `apps/basecamp/` — app 1, the trip list; `apps/aftershock/` — app 2, the sector grid (`pnpm --filter @limbo/aftershock dev`, port 5176)
- `kit/` — hook scripts, property harness, Kiro run wrapper, gate-integrity check
- `e2e/` — Playwright offline tests · `evidence/` — measured runs and the Kiro ledgers

## Checks
```
pnpm typecheck && pnpm test && pnpm props && pnpm e2e
pnpm props:full     # 10,000 orderings
```

License: MIT.
