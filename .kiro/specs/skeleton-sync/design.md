# Design: skeleton-sync

## Layout

```
skeleton/src/core/simulate.ts      + export makeRand (one word; no behaviour change)
skeleton/src/sync/
  store.ts         openStore (extended), deleteStore. Only importer of yjs / y-indexeddb
  replica.ts       createReplica
  link.ts          Link, Msg, attachLink (the protocol session)
  inpage-link.ts   createInPageLink (cut / restore / chaos)
  status.ts        deriveSync, nextFixed, createExchangeLog (pure)
  identity.ts      acquireIdentity (Web Locks, sessionStorage)
  pair.ts          createPair (test and UI harness)
skeleton/src/index.ts   re-exports (see Budget)
```

Each module has a `*.test.ts` beside it. Tests that need IndexedDB import `fake-indexeddb/auto` at the top of the test file. The existing spike (`e2e/offline-spike.spec.ts`) cut the network with `context.setOffline` and a relay on `:5175`. This spec replaces the relay with an in-page link. `setOffline` cannot cut an in-memory link, so the cut is explicit and the UI labels it as simulated.

## Types

```ts
// replica.ts
interface ReplicaConfig<S> {
  app: string; replicaId: string; defs: readonly OpDef[];
  materialize(ops: readonly Op[]): S;          // the app's fold (e.g. basecamp/model.ts)
  twinCount(s: S): number;                     // supplied by the app
  store: OpStore; seedOps: readonly Op[];
}
interface Replica<S> {
  id: string;                                  // member id
  ns: string;                                  // dot namespace `${id}#${k}`
  local(name: string, target: string, payload: unknown): Op;
  receive(ops: readonly Op[]): { applied: Op[]; duplicates: number; held: number; rejected: Rejection[] };
  state(): S; twins(): number;
  vv(): VV;                                    // applied frontier, a copy
  log(): Op[];                                 // applied + held, apply order then arrival
  applied(): Op[]; buffered(): Op[]; stalledOwn(): number;
  saved(id: string): boolean;
  rejected(): Rejection[];
  subscribe(fn: () => void): () => void;
  peerAck: { get(peer: string): VV; set(peer: string, vv: VV): void };  // persisted via store.meta
  close(): void;
}
// link.ts
type Msg = { t: 'hello'; replica: string; vv: VV } | { t: 'ops'; ops: Op[]; vv: VV } | { t: 'ack'; vv: VV };
interface Link { send(m: Msg): void; onMessage(cb: (m: Msg) => void): () => void;
                 onState(cb: (s: 'up' | 'down') => void): () => void; isUp(): boolean }
interface Session { link(): 'up' | 'down' | 'connecting'; peerId(): string | undefined;
                    peerAckVV(): VV; peerVV(): VV | undefined; onCross(cb: (ops: Op[]) => void): () => void;
                    subscribe(fn: () => void): () => void; detach(): void }
// status.ts
interface SyncInput { link: 'up'|'down'|'connecting'; unacked: number; behind: number; buffered: number; twins: number }
interface SyncView  extends SyncInput { axis: 'FOGGED'|'DEVELOPING'|'LIVE'; conflict: 'CLEAR'|'CONFLICT'; chip: string }
interface FixedState { dirty: boolean; visible: boolean; axis: SyncView['axis']; conflict: SyncView['conflict'] }
```

`store.ts` gains: `put(op): Promise<void>` (resolves when the write is confirmed), `meta: { read(): Meta; write(patch): Promise<void> }`, `deleteStore(name): Promise<void>`. `OpStore.ready` and `onChange` stay.

## Replica

State: merge-kit `Replica` core object `{ r: ns, counter: 0, maxL, vv }`, a `causalBuffer(vv)` sharing that `vv`, the applied-op array, a `saved` set, a rejection ring.

`createReplica` steps, in order:

1. `await store.ready`. Read `meta`. If `meta.seedVersion` exists and differs from `hash(seedOps)`, reject with `seed-version-changed`.
2. `k = (meta.k ?? 0) + 1`. `await store.meta.write({ replicaId, k, seedVersion })`. Only then does the replica exist for callers (no op before the awaited write, R4.3).
3. `ns = replicaId + '#' + k`. Core `r = ns`, `counter = 0`.
4. Offer `seedOps` to the buffer (they apply: `seed:1`, `seed:2`, ... chain by their own deps). Seed ops are authored once by a helper using `createOp` on a core replica with `r = 'seed'`, which keeps them byte-identical (`l`, `n`, deps are all determined by the script).
5. `maxL = max(l)` over seed ops and every stored op.
6. Offer every stored op to the buffer. Ops that cannot apply stay held (R5.2). The buffer's `vv` after this is the applied frontier; the stored maximum is never read as `vv`.
7. `saved` = ids of stored ops (they came from disk).
8. Subscribe to `store.onChange` only for the `ready`-time load. Later ops come only from `local` and `receive`.

`local(name, target, payload)`: look up def (throw if unknown), `createOp(core, def, target, payload)`, push to applied (createOp already moved `vv[ns]`), `observe`, `persist(op)`, notify. Because `createOp` sets `vv[ns] = n` itself and applies the op, it never passes through the buffer. This matches merge-kit.

`receive(ops)`: for each op: validate (R3); `buffer.offer(op)` returns the newly applied; record each applied op with `observe`; `persist(op)` for every accepted op, including held ones (so a held op survives a reload and the dependency can arrive after it). Return the result. Notify once at the end.

`persist(op)`: `store.put(op).then(() => saved.add(op.id), (e) => rejection(store-failed))`, then notify. Never awaited by `local` or `receive`.

`state()`: cached `materialize(applied)`, invalidated when `applied` grows. The apply order is the buffer's order, so the app's own buffer sees a causally closed list.

`stalledOwn()`: for each held op whose `stamp.r` starts with `replicaId + '#'` and `stamp.r !== ns`, check whether `vv[r] + 1` is held. Count the op if the first dot it needs, `(r, vv[r] + 1)`, is not held. This is evaluated live, so a peer re-send clears it.

Identity of the claimant: `who` is a payload field the app writes. The replica never writes it. Incarnation never reaches a `claim` (that is why `allocKey` already splits at `#`).

### Why incarnations are enough

A crash can drop a write that already advanced `counter`. The next page load would restart at the stored maximum and could reissue `a:5` with different content. With incarnations the new session writes `a#2:1`, a different dot, so the lost `a#1:5` and the new op never collide. If the peer holds `a#1:5`, it re-sends it after the hello. If nobody does, it is simply lost, and ops of `a#1` after it wait forever, which `stalledOwn` makes visible. The cost is that `vv` gains one key per incarnation. For a demo with a few reloads this is small. Compaction is out of scope.

## Store

`openStore(name)` today wraps `Y.Doc` and `IndexeddbPersistence`. Additions, all inside `store.ts`:

- `meta`: a `Y.Map<unknown>` named `meta` in the same doc, so a replica still has one database. Single writer by the lock (R14), so overwrites are safe. It is not an op log and carries no merge logic.
- `put(op)`: set in the `ops` map as now (no-op if present), then `return flush()`.
- `flush()`: y-indexeddb writes each Yjs update in its own readwrite transaction on its `updates` object store, without exposing a promise. IndexedDB runs readwrite transactions with overlapping scope in creation order. `flush()` opens an empty readwrite transaction on the `updates` store of `persistence.db` and resolves on its `complete`. By that ordering, the earlier update write is committed when it resolves. Task 2 starts with a spike test that fails if this ordering assumption does not hold under `fake-indexeddb`. If it does not hold in a real browser, the fallback is to write the op to a second object store opened by `store.ts` directly. The `OpStore` interface does not change.
- `meta.write(patch)`: set keys, then `flush()`.
- `deleteStore(name)`: `indexedDB.deleteDatabase(name)`, resolved on `success`. It resolves on `blocked` only after the store has been closed by the caller (identity closes first).
- Without `indexedDB`, `flush()` resolves immediately and the doc is memory-only.

Test seam: `OpStore` is an interface, so tests inject a `faultyStore(openStore(...), { drop: (op) => boolean })` that resolves `put` but never writes a chosen op, to model a lost write.

## Link protocol (`link.ts`)

`attachLink(replica, link, opts?)` returns a `Session`. State per link session: `helloSent`, `helloSeen`, `peerId`, `lastSeen: VV | undefined`, `peerVV`. `peerAckVV` lives on the replica (persisted) and is overwritten by each hello and ack.

```
on link up:            reset session state; send hello{id, vv}
on hello{replica,vv}:  helloSeen = true; peerId = replica; ack = vv; peerVV = vv; lastSeen = vv
                       if !helloSent: send hello
                       sendMissing(vv)
on ops{ops,vv}:        res = replica.receive(ops); emit cross(res.applied)
                       peerVV = vv
                       send ack{replica.vv()}
                       if !equal(vv, lastSeen): sendMissing(vv)
                       lastSeen = vv
on ack{vv}:            ack = vv; peerVV = vv
                       if !equal(vv, lastSeen): sendMissing(vv)
                       lastSeen = vv
on local op (up):      sendMissing(peerVV ?? ack)  // sends the new op
on link down:          reset session state; keep ack
sendMissing(vv):       missing = replica.log() applied ops with vv[r] < n, sorted by (r, n)
                       send in chunks of opts.chunk (50); each chunk carries replica.vv()
```

`sendMissing` selects from applied ops only. A held op is never sent, because the peer would only hold it too. The receiver of a message from before `hello` (`ops` or `ack` with `helloSeen = false`) ignores it, which keeps `connecting` honest.

Loop bound. Only `ops` messages answer with an `ack`. An `ack` is never answered by an `ack`. An `ack` answers with `ops` only when its `vv` differs from the last seen and something is missing. The set of ops missing only shrinks, and each `ops` message that is not a re-send of known data raises the receiver's `vv`. A duplicate `ops` message gets one `ack` with an unchanged `vv`, which the peer ignores. So the message count after quiet is bounded by the op count plus a constant per hello. A test asserts that bound.

Healing a stalled buffer. The peer's `ack` or `hello` carries its applied frontier, which lacks the missing dep. The first message with that `vv` differs from `lastSeen`, so `sendMissing` re-sends it. A reloaded peer sends a new `hello`, which always re-serves.

"No false ack": the only `vv` ever sent is `replica.vv()`. A reloaded replica builds `vv` from the buffer, so a stored-but-held op does not appear. A remaining case is an ack sent before the write is durable. If the process then dies, the next `hello` has a lower `vv`, `peerAckVV` goes down, and the op is re-sent (R9.9). The ack is not gated on durability, so a short window of over-acknowledgement exists. The heal path covers it, and a test covers the reload case.

## In-page link (`inpage-link.ts`)

`createInPageLink({ chaos?, schedule? })`:

- Two queues, one per direction, of `{ msg, due }`. Messages are structurally cloned on send, so replicas cannot share object identity.
- `pump()` delivers one pending message: FIFO normally; with `chaos`, a random index among both directions, using `makeRand(seed)`. Returns `false` when empty or cut.
- Auto mode: `send` calls `schedule(pump, delay)`. `delay = 0` normally, `rand.int(20)` ms with chaos. The default `schedule` is `setTimeout`. Tests pass a manual scheduler or call `pump()` themselves.
- `cut()`: `up = false`, clear both queues (counted as dropped), emit `down` on both ends. `send` while cut counts as dropped and returns.
- `restore()`: `up = true`, emit `up` on both ends. The sessions send their hellos.
- `stats()`: `{ delivered: {ab, ba}, dropped: {ab, ba}, sent: {ab, ba} }`.
- Initial state is up after the pair is built (the pair calls `restore()` once after attaching both sessions).

## Status (`status.ts`)

Everything is a pure function except the exchange log, which is a small object over plain arrays.

```ts
deriveSync(i: SyncInput): SyncView
```

Rows (tested table-driven):

| link | unacked + behind | buffered | axis |
| --- | --- | --- | --- |
| down / connecting | any | any | FOGGED |
| up | > 0 | any | DEVELOPING |
| up | 0 | > 0 | DEVELOPING |
| up | 0 | 0 | LIVE |

Counting helpers, also pure and exported from the module for the pair: `countUnacked(log, peerAck, ownId, peerId)` and `countBehind(vv, peerVV)`. `unacked` skips `seed` and peer-authored ops (the author is `stamp.r.split('#')[0]`). Two members is the only topology in this spec; a relay spec revisits this.

`nextFixed(prev, view)`: `dirty' = prev.dirty || view.axis === 'FOGGED' || view.conflict === 'CONFLICT'`. If `view` is `LIVE` and `CLEAR`: `fired = dirty' && !prev.visible`, `visible = fired || prev.visible`, `dirty = fired ? false : dirty'`. Otherwise `visible = false`, `fired = false`, `dirty = dirty'`. No clock appears anywhere in the function. The caller feeds it on every replica or session notification.

Exchange log. `cross(side, ops)` appends `{ side, name, merge, stamp, deps }` records to `open`. `settle(true)` moves `open` (when non-empty) to `done`, and `done` keeps the last 3. Because an exchange closes only on settle, a partition that produces 40 ops across many chunks yields one exchange with 40 crossings. The pair calls `cross` from each session's `onCross` and calls `settle(both zero)` after every notification.

Chip text: `base = LIVE ? 'Live' : FOGGED ? (unacked ? 'Offline — N waiting' : 'Offline') : 'Syncing N…'`, then `' · k conflict'` or `' · k conflicts'`. `LIVE` with 0 twins is just `Live`.

## Identity (`identity.ts`)

```ts
acquireIdentity({ app, mode: 'pair' | 'single', storage, locks, newId, search? }): Promise<Identity>
Identity { names: string[]; replicaIds: string[]; exclusive: boolean; reset(closeStores): Promise<void>; release(): void }
```

Pair mode: session id from `storage['limbo:<app>:session']`, else `newId()`. Lock name `limbo:<app>:pair-<id>`. `locks.request(name, { ifAvailable: true }, (lock) => lock ? new Promise((res) => (release = res)) : null)` wrapped to resolve the outer promise with a boolean granted flag. If not granted: new id, store it, retry (max 5, then throw). Names: `<lockName>:a`, `<lockName>:b`. Single mode: the key holds the replica id, lock name = db name. `search` carrying `reset=1` triggers `reset` before the stores open.

`reset(closeStores)`: await the caller's close, `deleteStore` for each of this identity's names, remove its `storage` keys, mint nothing (the caller re-runs `createReplica`, which starts at `k = 1` because `meta` is gone). It never lists or enumerates other databases, so it cannot delete another session's data.

`locks` stand-in for tests: `{ request(name, opts, cb) }` with a `Set` of held names. `locks === undefined` gives `exclusive: false`.

## Pair (`pair.ts`)

`createPair` opens two stores (`store(name)` factory, default `openStore`), creates two replicas `a`, `b` with the same `seedOps`, makes the in-page link, attaches a session to each end, wires `onCross` into the exchange log, and calls `restore()`. `settle()`: loop `while (link.pending() > 0 || writesInFlight)`: `pump()` (or await the scheduler in auto mode), `await store flush`. A loop cap (10,000 pumps) turns a resend loop into a test failure instead of a hang.

`view(id)` builds a `SyncInput` from the replica and session (`countUnacked`, `countBehind`, `buffered().length`, `twins()`), runs `deriveSync`, and `nextFixed` on a per-replica `FixedState` that updates on subscribe callbacks.

## Offline shell

Task 10. `vite-plugin-pwa` with `registerType: 'autoUpdate'` and `workbox.globPatterns` for the built shell, or `public/sw.js` with a cache-first fetch handler and a versioned cache name if the plugin does not build under Vite 7 and Node 22. The Playwright check loads the app, makes edits, calls `context.setOffline(true)`, reloads, and compares state and the wisp count. It runs only where an app with a Vite config exists, so it may land with `limbo-layer`.

## Budget

Current skeleton: 1,139 non-test TS lines in `core` and `sync`, 9 value exports in the merge-kit design. Target lines for this spec: store +45, replica 150, link 120, inpage-link 90, status 120, identity 70, pair 55, index 10. That is about 660 lines, ending near 1,800. This is at the limit. Task 9 measures the real count. If it exceeds 1,800, the task stops and reports which module to trim. Candidates, in order: merge `inpage-link` chaos into a tiny `chooser` function, drop `stats().dropped` per direction, fold `pair.ts` helpers into `status.ts`. The budget is not raised silently.

Index exports (6 new, total 15): `createReplica`, `createPair`, `createInPageLink`, `attachLink`, `deriveSync`, `acquireIdentity`. `nextFixed`, `createExchangeLog`, the count helpers and `openStore` stay path imports for the UI and kit. Types are type-only and do not count.

## Test plan

| Area | Test file | Cases (requirement) |
| --- | --- | --- |
| status | `status.test.ts` | table over the four axis rows and both conflict values (R10.5, R10.6); chip strings exactly (R13); `nextFixed` fires once per FOGGED then LIVE∧CLEAR, once per CONFLICT then CLEAR, never from DEVELOPING alone, hides on leave (R11); exchange log counts only passed ops, keeps last 3, closes on settle not on chunk (R12); `countUnacked` skips seed and peer ops, `countBehind` counts a buffered dot once (R10.3, R10.4) |
| store | `store.test.ts` | `put` resolves after write; meta round-trip; `deleteStore`; `flush` ordering spike (R4) |
| replica | `replica.test.ts` | local op to state; out-of-order receive buffered then applied; duplicate ignored; unknown op rejected and logged; malformed rejected; seed identical on two replicas; `saved` false until put resolves (R1, R2, R3, R4.7) |
| persistence | `replica.persist.test.ts` | reload restores state and log; `k` increments per load; lost write then reload never reuses a dot; stalled own op shows `stalledOwn > 0` and clears when a peer re-sends; seed version mismatch rejects (R4, R5) |
| link | `link.test.ts` | zero deliveries both ways while cut (stats); after restore canonical states deep-equal; hello re-serves; stalled buffer heals; reloaded peer re-served and `peerAckVV` goes down; message count bounded after quiet; chaos with a fixed seed converges and is repeatable; stale ack ignored before hello (R6 to R9) |
| pair | `pair.test.ts` | edit offline on both, `view` shows FOGGED with `unacked` equal to the op count, restore, settle, LIVE, CLEAR or CONFLICT, FIXED fires once, exchange holds the partition-era ops with their merge names (R15, R10 to R13) |
| identity | `identity.test.ts` | second tab with the same session id gets a new pair; single mode mints a new replica id when locked; `reset` deletes only its own names; no `locks` gives `exclusive: false` (R14) |

Reload scenario for the missing dependency: replica B receives op X (deps include A's `a#1:1`) without `a#1:1` having arrived. X is held and persisted. B reloads. X goes back into the buffer, `vv` has no `a#1` key. On reconnect, B's hello lacks `a#1:1`, A re-sends it, X applies. A's `peerAckVV` for B never covered X, so no false ack.

Tests use the BASECAMP defs and `materialize` where a real op set helps (`apps/basecamp/src/ops/registry.gen.ts`, `model.ts`). Unit tests in `skeleton/` may import from `apps/` only through the pair test, since `model.ts` already imports from `skeleton/`. If that cross-import is rejected by the project layout, the pair test uses a stub def set with `set` and `delta` ops, as `simulate.test.ts` does.

## Risks

- `flush()` ordering over y-indexeddb is an assumption about IndexedDB transaction order. The spike in task 2 decides it.
- `vv` grows by one key per incarnation. Accepted for the demo; compaction is out of scope.
- Rejected unknown ops leave a gap that blocks later ops from the same author (R3.4). Accepted and visible.
- Web Locks are absent in some test environments and old browsers. The fallback is explicit (`exclusive: false`).
- The line budget is tight (see Budget).
