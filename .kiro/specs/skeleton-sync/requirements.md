# Requirements: skeleton-sync

This spec turns the pure merge core (`skeleton/src/core`, spec `merge-kit`) into a running replica that persists ops on the device and syncs with a peer only through an explicit `Link`. Every sync number a UI can show (`unacked`, `behind`, crossing count, link state, FIXED) is derived from real protocol state. It is pure TypeScript with no React. The visual layer is the next spec, `limbo-layer`. The op contract in `.kiro/steering/local-first.md` is binding. Wording everywhere: "measured, property-tested", never "proven" or "guaranteed". Any number quoted in a page or comment comes from `evidence/`.

## Glossary

- **Member**: the replica id a user acts as (`a`, `b`, or a random id). Claimant identity (`who`) is always the member.
- **Incarnation `k`**: a counter bumped on every page load of one replica. The **dot namespace** is `<replicaId>#<k>`. It is the `r` of every stamp, op id and `vv` key that replica creates. Counters `n` restart at 0 per incarnation.
- **Dot**: one op, `${r}:${n}`, as in merge-kit.
- **Applied frontier (`vv`)**: per dot namespace, the highest contiguous `n` the replica has applied. Buffered ops are not in it.
- **Link session**: the period from one restore (or first connect) of a link to its next cut. Session state is discarded when the session ends.
- **peerAckVV**: the `vv` of the peer's latest `hello` or `ack` in this link session. The last value is kept after the session ends and is persisted.
- **peerVV**: the `vv` of the peer's latest message of any kind in this link session (`hello`, `ops`, `ack`).
- **Unacked** and **behind**: defined in R10.
- **Exchange**: one stretch of ops crossing between the replicas, from the first crossing until both sides are settled (R12).
- **Seed ops**: ops authored by the fixed replica id `seed`, identical on every replica. `seed` has no incarnation.

## R1 Replica runtime

User story: as an app author, I want one replica object that applies local and received ops in causal order, so my `materialize` always sees a causally closed op set.

1. The module `skeleton/src/sync/replica.ts` shall export `createReplica({ app, replicaId, defs, materialize, twinCount, store, seedOps })`, which returns a promise of `{ local, receive, state, vv, log, buffered, stalledOwn, saved, rejected, subscribe, close }`.
2. When `local(name, target, payload)` is called with a registered op name, the replica shall create the op with merge-kit `createOp` (`l = 1 + max l seen`, `n = ++counter`, `deps = current vv`), apply it at once, return it, and notify subscribers.
3. When `receive(ops)` is called, the replica shall offer each op to the merge-kit `causalBuffer` and shall return `{ applied, duplicates, held, rejected }`, where `applied` lists the ops newly applied (in apply order, including ops released from the buffer).
4. When an op arrives whose id is already applied or already held, the replica shall ignore it and shall not count it in `applied`.
5. While an op's deps are unmet, the replica shall hold it in the buffer, shall not include it in `vv`, and shall apply it as soon as the deps are met.
6. The replica shall compute `state()` as `materialize(appliedOps)`, where `appliedOps` are the applied ops (seed ops included) in apply order. It shall recompute only when the applied set changes.
7. The replica shall supply the number of twins as `twinCount(state())`. The replica shall not interpret twins itself.
8. The replica shall not read the wall clock, randomness or locale in any code path that creates or applies an op. Only identity (R14) may draw random ids.
9. When `local` is called with an unregistered op name, the replica shall throw and shall create no op.

## R2 Seed

1. When a replica starts, it shall apply `seedOps` first, before any stored op and before any local op.
2. The replica shall not write seed ops to its store. It shall regenerate them from `seedOps` on every start.
3. The replica shall store a `seedVersion` (the canonical hash of `seedOps`) in `meta`. If a stored `seedVersion` differs from the current one, then the replica shall refuse to start and shall reject its promise with an error named `seed-version-changed`. Reset demo (R14) recovers.
4. The replica shall count seed ops as applied in `vv` under the key `seed`, and shall never count them as unacked.

## R3 Op validation on receive

1. When a received op names an op that is not in `defs`, the replica shall reject it, shall not offer it to the buffer, and shall record `{ id, reason: 'unknown-op' }` in `rejected()`.
2. When a received op has `id !== ${stamp.r}:${stamp.n}`, a non-integer `stamp.l` or `stamp.n`, or `n < 1`, the replica shall reject it with reason `malformed`.
3. The replica shall keep the last 50 rejections. A rejected op shall not reach the store.
4. A rejected op leaves a gap in its author's counter, so later ops from that author wait in the buffer. This is accepted behaviour and shall be visible through `buffered()`.

## R4 Persistence and incarnations

User story: as a user, I want every edit on this device to survive a reload or a crash, and a crash must never make two different ops share one id.

1. `store.ts` shall remain the only file that imports `yjs` or `y-indexeddb`. It shall keep one database per replica, named `limbo:<app>:<replicaId>`.
2. The store shall hold the op log (grow-only, keyed by op id) and a `meta` record `{ replicaId, k, peerAckVV: Record<peerId, VV>, seedVersion }`.
3. When a replica starts, the store shall read `k` (0 when absent), write `k + 1`, and confirm that write before the replica creates its first op. The session's dot namespace is `<replicaId>#<k + 1>`.
4. The replica shall start its counter at 0 in the new incarnation and shall start its Lamport counter at the maximum `l` over all stored ops and seed ops.
5. If a crash or a failed write loses some ops of an earlier incarnation, then the replica shall never reuse their dots, because each incarnation owns a distinct namespace.
6. The `seed` replica shall have no incarnation. Its ops use the key `seed` as written by `seedOps`.
7. When `local` or `receive` applies an op, the replica shall call `store.put(op)` and shall expose the op as saved only after the returned promise resolves. Until then `saved(id)` is `false` and the UI shall say "waiting".
8. When `put` rejects, the replica shall keep the op in memory and in the log, shall leave `saved(id)` false, and shall record the failure in `rejected()` with reason `store-failed`. It shall not retry silently in a loop.
9. The store shall persist `peerAckVV` whenever it changes. It need not await that write.
10. When there is no IndexedDB (a test, or private mode), the store shall run in memory, and `saved` shall resolve as for a durable store.

## R5 Reload

1. When a replica restarts, it shall re-deliver every stored op through the causal buffer in an order that does not matter.
2. When a stored op's deps are missing, the replica shall keep the op in the buffer. It shall not apply it, and it shall not advertise it in `vv`.
3. The replica shall never advertise the stored maximum as `vv`. It shall advertise only the applied frontier.
4. The replica shall expose `stalledOwn`: the number of held ops authored by one of its own earlier incarnations whose own-namespace predecessor (`n - 1`, or any lower dot in that chain) is neither applied nor held.
5. If `stalledOwn > 0`, then the replica shall keep those ops in the buffer and shall keep asking for the missing dots through its `hello` vv. If the peer holds them, they are applied after the next hello. If nobody holds them, they wait forever, and the UI will say "waiting for an earlier edit that was not saved".
6. After a reload, `log()` and the unacked count (R10) shall match the state before the reload for every op that reached the disk.

## R6 Link interface

1. `skeleton/src/sync/link.ts` shall define `Link`: `send(msg)`, `onMessage(cb)`, `onState(cb)` (events `up` and `down`), `isUp()`. Each returns an unsubscribe where it takes a callback.
2. The message type shall be exactly `hello { replica, vv }`, `ops { ops, vv }`, `ack { vv }`.
3. The replica shall talk to a peer only through a `Link`. There shall be no `BroadcastChannel`, no `SharedWorker`, and no database shared between replicas, in this spec or in the code it adds.
4. When `send` is called while the link is down, the link shall drop the message and shall not queue it for later.

## R7 In-page link

1. `skeleton/src/sync/inpage-link.ts` shall export `createInPageLink(opts)`, which returns two `Link` ends `a` and `b`, plus `cut()`, `restore()`, `pending()`, `pump()` and `stats()`.
2. While the link is cut, the link shall deliver no message in either direction.
3. When `cut()` is called, the link shall discard every message not yet delivered, in both directions, and shall emit `down` on both ends.
4. When `restore()` is called, the link shall emit `up` on both ends and shall start a new link session.
5. `stats()` shall return delivered and dropped message counts per direction, so a test can prove zero delivery while cut.
6. By default the link shall deliver on a scheduler (`setTimeout 0`). A test may inject a manual scheduler and call `pump()` to deliver one message.
7. The UI that wraps it shall label it as a simulated link. Browser-level offline (`context.setOffline`) does not affect it.

## R8 Chaos mode

1. Where `chaos: { seed }` is set, the link shall pick the next message to deliver at random among the pending messages of both directions, so messages reorder, and shall draw a random delay for each, from a seeded generator (`makeRand`).
2. Where the same seed and the same send sequence are used, the link shall produce the same delivery order.
3. Chaos shall not drop or duplicate messages. The causal buffer makes reordering safe.
4. Where chaos is on, both replicas shall still reach equal canonical states after `settle()`.

## R9 Sync protocol

1. When a link goes `up`, the session shall send `hello { replica, vv }` with the applied frontier.
2. When a `hello` arrives, the session shall record it as peerAckVV and peerVV, shall answer with its own `hello` once per link session if it has not sent one, and shall send every op the peer's `vv` does not cover.
3. When an `ops` message arrives, the session shall pass the ops to `receive`, shall record the message's `vv` as peerVV, and shall answer with `ack { vv }` carrying its applied frontier. When its `vv` differs from the last `vv` seen from that peer in this link session, it shall also send every op that `vv` does not cover.
4. When an `ack` arrives, the session shall record it as peerAckVV and peerVV. When its `vv` differs from the last `vv` seen from that peer in this link session, the session shall send every op that `vv` does not cover. The session shall never answer an `ack` with an `ack`.
5. Every `vv` the session sends shall be the sender's applied frontier. Buffered ops shall never be in it.
6. When a local op is created while the link is up, the session shall send it as `ops`.
7. The session shall send ops in chunks of at most `chunk` ops (default 50). Each chunk carries the `vv` at the time of sending.
8. When the link goes down, the session shall discard its link-session state (last `vv` seen, `hello` sent flag, peerVV). It shall keep peerAckVV as the last known value.
9. When the peer reloads, its new `hello` shall replace peerAckVV, which may go down. Ops it lost shall count as unacked again and shall be re-sent.
10. After the replicas have exchanged all ops and the link is quiet, the number of messages sent shall stay bounded: no message shall cause an unbounded chain of replies.
11. While a replica's buffer holds an op whose dep the peer has, the next ack or hello of that replica shall cause the peer to send the dep, so a stalled buffer heals.

## R10 Sync state (pure derivation)

User story: as a UI author, I want every number to come from one pure function over protocol state, so a number can never disagree with the protocol.

1. `skeleton/src/sync/status.ts` shall export `deriveSync(input)` as a pure function of `{ link, unacked, behind, buffered, twins }`, and shall have no import from `replica.ts` or `link.ts` beyond types.
2. The link state shall be `up` only after a `hello` from the peer has arrived in this link session, `down` when the link is cut or was never up, and `connecting` between `up` on the transport and that `hello`.
3. `unacked` shall equal the number of ops in the log whose dot is not covered by peerAckVV, not counting seed ops and ops authored by the peer. A dot `(r, n)` is covered iff `peerAckVV[r] >= n`.
4. `behind` shall equal the sum over every dot namespace `r` of `max(0, peerVV[r] - vv[r])`. A buffered op is inside that range and shall be counted once. While no `hello` has arrived in this link session, `behind` shall be 0.
5. The sync axis shall be `FOGGED` when the link is `down` or `connecting`, `DEVELOPING` when the link is `up` and `unacked + behind > 0` or the buffer is not empty, and `LIVE` when the link is `up`, `unacked = 0`, `behind = 0` and the buffer is empty.
6. The conflict axis shall be `CLEAR` for 0 twins and `CONFLICT` for `k >= 1` twins, where `twins` is `twinCount(state())` from the app.
7. The module shall expose `unacked` and `behind` as plain numbers in the view, with the axis values and the chip text.
8. Where a replica has no link attached, the link state shall be `down`.

## R11 FIXED event

1. The module shall export a pure `nextFixed(prev, view)` returning `{ state, fired }`.
2. When the view enters `LIVE` and `CLEAR` and the state had seen `FOGGED` or `CONFLICT` since the last FIXED or since start, the function shall return `fired = true` once, and shall set `visible = true`.
3. When either axis leaves `LIVE` or `CLEAR`, the function shall set `visible = false`.
4. Where the view stays in `LIVE` and `CLEAR`, the function shall not fire again.
5. A replica that starts `LIVE` and `CLEAR`, or goes `DEVELOPING` and back without a `FOGGED` or `CONFLICT` in between, shall not fire FIXED.
6. `FIXED` shall be driven by link and replica events passed to `nextFixed`. No timer shall drive it, and no timer shall hide it.

## R12 Exchanges

1. The module shall export `createExchangeLog(defs)` with `cross(side, ops)`, `settle(bothSettled)`, `last()` and `open()`.
2. When `cross(side, ops)` is called, the log shall record each op in `ops` as one crossing in the open exchange, opening one if none is open. A crossing record shall hold the op name, its declared merge (from `defs`), its stamp and its deps.
3. A caller shall pass only the ops newly applied by the receiver (`receive(...).applied`). Duplicates and re-sends shall not be counted.
4. When `settle(true)` is called, meaning both sides have `unacked = 0` and `behind = 0`, the log shall close the open exchange, if it has at least one crossing.
5. `last()` shall return the last 3 completed exchanges, oldest first, each with every op that crossed. Message chunking shall not evict partition-era ops from an exchange, because exchanges close on settle and not on message boundaries.
6. The crossing count of an exchange shall equal the number of its crossing records.

## R13 Chip text

1. `deriveSync` shall produce the chip string for both axes.
2. LIVE and CLEAR: `Live`. LIVE and CONFLICT: `Live · 1 conflict` (`k conflicts` for `k >= 2`).
3. FOGGED: `Offline — <unacked> waiting`, or `Offline` when `unacked = 0`. With conflicts, append ` · <k> conflict(s)`.
4. DEVELOPING: `Syncing <unacked + behind>…`, or `Syncing…` when that sum is 0 and the buffer is not empty. With conflicts, append ` · <k> conflict(s)`.
5. The chip shall use the Unicode ellipsis `…` and the em dash `—` exactly as written above.

## R14 One writer per replica id

User story: as a user with two tabs, I want a duplicated tab never to write into the same databases as the original.

1. `skeleton/src/sync/identity.ts` shall export `acquireIdentity({ app, mode, storage, locks, newId })`. `storage` is `sessionStorage` or a stand-in. `locks` is `navigator.locks` or a stand-in, or `undefined`. `newId` returns a random id. The module shall be the only place that draws random ids.
2. Where `mode` is `pair`, the tab shall keep a session id in `storage`, shall name its databases `limbo:<app>:pair-<session>:a` and `limbo:<app>:pair-<session>:b`, and shall take a Web Lock on `limbo:<app>:pair-<session>`.
3. If that lock is already held, then the tab shall mint a new session id, store it, and try again, up to 5 times. A duplicated tab therefore becomes a new pair and never a second writer.
4. Where `mode` is `single`, the tab shall store its random replica id in `storage` as its ownership token, shall name its database `limbo:<app>:<replicaId>`, and shall take a Web Lock on that name. If the lock is held, it shall mint a new replica id.
5. The lock shall be held until `release()` is called or the tab closes.
6. When `reset()` is called, or the URL has `?reset=1`, the identity shall close this tab's stores, delete only this tab's databases, clear its `storage` keys, and shall let the caller re-seed. A pair restarts at incarnation 1.
7. `reset()` shall not delete a database that belongs to another session.
8. Where `locks` is `undefined`, the identity shall grant the lock without exclusion and shall report `exclusive: false`.

## R15 Pair harness

1. `skeleton/src/sync/pair.ts` shall export `createPair({ app, defs, materialize, twinCount, seedOps, store, chaos })`, returning a promise of `{ a, b, cut, restore, settle, view, exchanges, stats, close }`.
2. `a` and `b` shall be replicas with fixed member ids `a` and `b`, joined by an in-page link and a session on each end.
3. `settle()` shall deliver messages until none is pending and every issued store write has resolved, then shall return.
4. `view(id)` shall return the `deriveSync` view for that replica, computed from live protocol state, together with the FIXED state.
5. `exchanges()` shall return the exchange log of R12, fed from both replicas' `receive` results and settled when both replicas are at `unacked = 0` and `behind = 0`.
6. The `store` parameter shall default to `openStore`. A test may inject an in-memory or faulty store.

## R16 Offline shell

1. Where an app has a Vite build, the app shall precache its shell with a service worker (`vite-plugin-pwa`, or a hand-written cache-first worker if the plugin fails).
2. When the app is reloaded with the network off, it shall open with the same state and the same wisp count as before the reload.
3. The service worker code shall live with the app build, not in the skeleton budget.
4. This task may run after `limbo-layer` provides the Vite app. Until then it is deferred, not skipped.

## R17 Constraints

1. The new code in `skeleton/src/sync` shall import no React and no DOM code except `store.ts` (IndexedDB) and `identity.ts` (injected `storage` and `locks`).
2. The skeleton shall stay within its provisional budget: at most 30 files, 1,800 TS/TSX lines excluding tests, CSS and tokens, and 15 exports from `skeleton/src/index.ts`. A task that would exceed it shall stop and report, not raise the budget.
3. Anything app-specific shall live in the app, not in `skeleton/`.
4. Every task shall end with `pnpm typecheck && pnpm test && pnpm props` green. No test or property shall be weakened, skipped, or have `numRuns` lowered.
5. The cross-device relay (PeerJS or WebRTC) and snapshots or compaction are out of scope.
