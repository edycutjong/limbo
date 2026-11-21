Create a Kiro **feature spec** named `skeleton-sync` (requirements-first, EARS acceptance criteria) under `.kiro/specs/skeleton-sync/`:
`requirements.md`, `design.md`, `tasks.md`. Write only those three files. Do not implement anything yet. Do not run git.
Read `.kiro/steering/*.md` first, and the existing code it builds on: `skeleton/src/core/{types,causal,merges,simulate}.ts`,
`skeleton/src/sync/store.ts`, `apps/basecamp/src/model.ts`, `e2e/offline-spike.spec.ts` (the spike that proved the partition).
The `merge-kit` spec (`.kiro/specs/merge-kit/`) is done; this spec turns its pure core into a running replica that persists and syncs.

## Goal
A replica in a browser tab that keeps working with the link cut, persists every op on the device, and syncs with a peer **only**
through an explicit `Link`, with every sync number the UI shows (`unacked`, `behind`, crossing count, link state, FIXED) derived from
real protocol state. Pure TypeScript, no React in this spec (the visual layer is the next spec, `limbo-layer`).

## Scope (in this spec)
1. **Replica runtime** `skeleton/src/sync/replica.ts`: wraps the merge-kit causal buffer and `createOp`. Holds the op log, `vv`
   (per replica id the highest **contiguous, applied** n), lamport, the causal buffer, and the app's `materialize(ops)` result.
   API sketch: `createReplica({ app, replicaId, defs, materialize, store, seedOps })` → `{ local(name, target, payload), receive(ops),
   state(), vv(), log(), buffered(), subscribe(fn) }`. Seed ops (authored by the fixed replica id `seed`) are applied first and are
   byte-identical on every replica. Ops are validated against the registered defs on receive (unknown op name → rejected, logged).
2. **Persistence + crash safety** (extend `store.ts`, keep it the only file that imports Yjs / y-indexeddb): one database per
   replica `limbo:<app>:<replicaId>`; stores the op log and a `meta` record (`replicaId`, incarnation `k`, `peerAckVV` per peer, seed
   version). **Incarnations:** every page load reads, increments and writes (awaited) `k` before the session's first op; the dot
   namespace is `<replicaId>#<k>`, counters start at 0 per incarnation, lamport = max `l` over stored ops. A crash can therefore never
   reuse a dot. Claimant identity (`who`) is the member, never the incarnation. The `seed` replica has no incarnation.
   **Reload:** stored ops are re-delivered through the causal buffer; ops whose deps are missing go back into the buffer; the stored
   maximum is never advertised as `vv`. An own op from an earlier incarnation whose predecessor never reached disk waits in the
   buffer forever, and the replica exposes that as `stalledOwn > 0` (the UI will say "waiting for an earlier edit that was not
   saved"). "Saved on this device" is exposed per op only when the store's write is confirmed; otherwise it is "waiting".
3. **Link protocol** `skeleton/src/sync/link.ts` + `skeleton/src/sync/inpage-link.ts`: a `Link` interface (send, onMessage, up/down
   events) and `InPageLink`, an in-memory duplex queue between two replicas in one page, which the user can **cut** and **restore**
   (labelled in the UI later as a simulated link), plus a **chaos mode** (random delay and reordering from a seeded RNG; the causal
   buffer makes reordering safe). Messages: `hello {replica, vv}` · `ops {ops[], vv}` · `ack {vv}`. Every `vv` sent is the sender's
   applied frontier (buffered ops excluded). Send what the peer's latest vv lacks. Every hello triggers a re-send of the ops its vv
   does not cover; an ack or ops message triggers a re-send only when its vv differs from the last vv seen from that peer in this
   link session (a stalled buffer heals, a reloaded peer is re-served, and there is no resend loop). `peerAckVV` = the vv in the
   peer's **latest** hello/ack in this link session (it may go down after the peer reloads, so a lost op shows as unacked again and
   is re-sent). While a link is cut, nothing is delivered in either direction (a real partition; no BroadcastChannel, no
   SharedWorker, no shared database between replicas, ever).
4. **Sync state** `skeleton/src/sync/status.ts` — a pure derivation, unit-tested on its own, from protocol state to what the UI shows:
   - link `up` only after a hello from the peer has arrived in this link session; `down` when cut; `connecting` between.
   - `unacked` = ops in my log whose dot is not covered by that peer's `peerAckVV`.
   - `behind` = dots covered by the peer's latest announced vv that this replica has not applied (buffered ops counted once).
   - sync axis: `FOGGED` (link down or connecting) · `DEVELOPING` (up and `unacked + behind > 0`) · `LIVE` (up, both 0, buffer empty).
   - conflict axis: `CLEAR` (0 twins) / `CONFLICT` (k twins); twins come from the app's materialized state (a count it supplies).
   - **FIXED** event: fires once on each transition into `LIVE` ∧ `CLEAR` that follows a partition or a returned conflict; hides when
     either axis leaves; driven by link/replica events, never a timer.
   - **exchanges**: crossing count per exchange = ops **newly applied** by the receiver (duplicates and re-sends not counted); keep
     the last 3 **completed** exchanges (both sides at `unacked = 0` and `behind = 0`) with every op that crossed (name, declared
     merge, stamp, deps), so message chunking cannot evict the partition-era ops.
   - the chip text in words for both axes: "Live" · "Offline — 3 waiting" · "Syncing 2…" · "Live · 1 conflict" ·
     "Syncing 2… · 1 conflict".
5. **One writer per replica id** `skeleton/src/sync/identity.ts`: Web Locks (`navigator.locks`). A pair view keeps its two replicas
   (fixed ids `a` and `b`) in a per-tab namespace: a `sessionStorage` session id → databases `limbo:<app>:pair-<session>:a|b`. The tab
   takes a Web Lock on its pair's database name and mints a new session id if the lock is already held (browsers copy
   `sessionStorage` into duplicated tabs, so a duplicate becomes a new pair, never a second writer). A single-replica tab stores its
   random replica id in `sessionStorage` as its ownership token and holds the lock on its database name. **Reset demo** (and
   `?reset=1`) deletes this tab's pair databases and re-seeds (the pair restarts at incarnation 1). Fall back cleanly where
   `navigator.locks` is missing (tests) behind an injectable interface.
6. **Integration harness for tests** `skeleton/src/sync/pair.ts`: `createPair({ app, defs, materialize, seedOps })` → two replicas
   `a`/`b` joined by an InPageLink, with `cut()`, `restore()`, `settle()` (deliver until quiet). Used by the unit tests here and by the
   UI later.
7. **Offline shell** (last task, may run later): a service worker that precaches the app shell so an app reloaded with the network
   off still opens with the same state and wisp count (vite-plugin-pwa, or a hand-written cache-first worker if the plugin fails).

Out of scope: any React/visual code; the cross-device relay (PeerJS/WebRTC) — a separate, gated spec; snapshots/compaction.

## Tests that must exist (Vitest, `fake-indexeddb` is already a devDependency)
- replica: local op → state; receive out of order → buffered then applied; duplicate → ignored; unknown op name → rejected.
- persistence: reload restores state and wisp count; incarnation increments per load; a killed mid-write + reload never reuses a dot;
  receive an op with a missing dependency, reload, reconnect → the dependency is re-sent and there is no false ack.
- link: while cut, zero messages delivered both ways; after restore, both replicas' canonical states deep-equal; chaos mode with a
  fixed seed still converges; no resend loop (message count bounded after quiet).
- status: a table-driven test over the state-machine rows above (fog only when down/connecting; haze only with unacked or behind;
  FIXED once per qualifying transition; crossing counts exclude duplicates; the chip strings exactly).
- identity: second tab with the same session id gets a new pair; reset deletes only this tab's databases.

Each task must end with `pnpm typecheck && pnpm test && pnpm props` green. Keep tasks small (one module + its tests each), number them,
and reference the requirement ids. Keep the skeleton lean: anything app-specific belongs in the app, not here.
