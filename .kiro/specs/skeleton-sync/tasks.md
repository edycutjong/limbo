# Tasks: skeleton-sync

Each task ends with `pnpm typecheck && pnpm test && pnpm props` green. Tests and properties are never weakened, skipped, or run with a lower `numRuns`. Each task touches one module and its tests, plus the minimum glue. Do not run git.

- [x] 1. Status derivation (pure)
  - `skeleton/src/sync/status.ts`: `deriveSync`, `countUnacked`, `countBehind`, `nextFixed`, `createExchangeLog`.
  - Tests (`status.test.ts`): table over link state and `unacked`, `behind`, `buffered` for the axis (fog only when down or connecting; haze only with unacked, behind, or a held op); both conflict values; chip strings exactly (`Live`, `Offline — 3 waiting`, `Syncing 2…`, `Live · 1 conflict`, `Syncing 2… · 1 conflict`, plural, `Offline`); `nextFixed` fires once per qualifying transition and not from `DEVELOPING` alone, hides on leaving either axis; exchange log excludes duplicates by construction, keeps the last 3, closes on settle and not on chunk count, records name, merge, stamp, deps; `countUnacked` skips seed and peer-authored ops; `countBehind` counts a buffered dot once.
  - _Requirements: R10, R11, R12, R13_

- [x] 2. Store: confirmed writes, meta, delete
  - First, a spike test in `store.test.ts` that shows `put` resolves only after the update is readable from a fresh connection (`fake-indexeddb`). If the ordering assumption in the design fails, use the second-object-store fallback and note it in the design.
  - `skeleton/src/sync/store.ts`: `put` returns `Promise<void>`, `meta.read` and `meta.write`, `deleteStore`, memory-only path. Keep it the only importer of `yjs` and `y-indexeddb`. Keep the existing `OpStore` callers compiling.
  - Tests: meta round-trip across close and reopen; `deleteStore` removes the log and meta; a second `put` of the same id is a no-op; no-IndexedDB path resolves.
  - _Requirements: R4.1, R4.2, R4.7, R4.9, R4.10_

- [x] 3. Replica runtime (in-memory store)
  - `skeleton/src/sync/replica.ts`: `createReplica` with seed application, `local`, `receive`, `state`, `vv`, `log`, `applied`, `buffered`, `rejected`, `subscribe`, `close`. Add a seed helper that builds byte-identical seed ops with a core replica `seed`.
  - Tests (`replica.test.ts`, a stub def set with a `set` op and a `delta` op, plus one BASECAMP check): local op changes state; out-of-order receive is buffered then applied; duplicate ignored and not in `applied`; unknown op rejected, logged, and never reaches the store; malformed id rejected; `local` with an unknown name throws; two replicas built from the same `seedOps` have equal seed ops and states; `vv` omits held ops; subscribers fire once per change.
  - _Requirements: R1, R2.1, R2.2, R2.4, R3_

- [x] 4. Replica persistence, incarnations, reload
  - `replica.ts`: awaited incarnation write before the first op, dot namespace `<id>#<k>`, Lamport start, stored-op redelivery, `saved`, `stalledOwn`, `peerAck`, `seed-version-changed`. Store failure recorded as `store-failed`.
  - Tests (`replica.persist.test.ts`, `fake-indexeddb`): reload restores state, log and the unacked inputs; `k` increments per load; a faulty store that drops one write, then reload and new ops, never reuses a dot and the new op has a distinct namespace; `stalledOwn > 0` after reload with a missing predecessor and returns to 0 when a peer supplies it; `saved(id)` is false until `put` resolves and stays false on failure; an op received with a missing dependency, reload, then re-delivery of the dependency applies it with no `vv` entry for the held op in between; seed version mismatch rejects.
  - _Requirements: R2.3, R4, R5_

- [x] 5. Link protocol and in-page link
  - Export `makeRand` from `skeleton/src/core/simulate.ts` (no behaviour change).
  - `skeleton/src/sync/link.ts`: `Link`, `Msg`, `attachLink` and `Session`. `skeleton/src/sync/inpage-link.ts`: `createInPageLink` with `cut`, `restore`, `pending`, `pump`, `stats`, manual and `setTimeout` scheduling.
  - Tests (`link.test.ts`, two replicas with a manual scheduler): while cut, `stats().delivered` stays 0 both ways and `cut()` drops in-flight messages; after restore both canonical states deep-equal; a hello re-serves what the peer's `vv` lacks; a stalled buffer heals via the next ack; a reloaded peer is re-served and `peerAckVV` goes down so the lost op is unacked again and re-sent; an ack or ops with an unchanged `vv` causes no resend; the message count after quiet is bounded; messages before `hello` are ignored; every `vv` sent excludes held ops; `send` while down drops.
  - _Requirements: R6, R7, R9_

- [x] 6. Chaos mode
  - `inpage-link.ts`: seeded random choice among pending messages and random delay.
  - Tests (`link.chaos.test.ts`): with a fixed seed the delivery order is repeatable; across several fixed seeds both replicas converge to deep-equal canonical states after offline edits on both sides; no message is dropped or duplicated by chaos; the message count stays bounded.
  - _Requirements: R8_

- [x] 7. Pair harness and sync view
  - `skeleton/src/sync/pair.ts`: `createPair`, `cut`, `restore`, `settle` (with a pump cap), `view`, `exchanges`, `stats`, `close`.
  - Tests (`pair.test.ts`): edits on both sides while cut give `FOGGED` and `unacked` equal to each side's op count, `behind` 0 and the chip `Offline — N waiting`; after restore the view passes through `connecting` and `DEVELOPING`, then reaches `LIVE`; a conflicting edit gives `CONFLICT` and the chip with the conflict count; `FIXED` fires once after a partition or a returned conflict and not at start; the exchange holds the partition-era ops with their declared merge names and counts no duplicate; a reload of one replica mid-session leaves no false ack (peerAckVV drops, ops re-sent).
  - _Requirements: R10, R11, R12, R13, R15_

- [x] 8. Identity and ownership
  - `skeleton/src/sync/identity.ts`: `acquireIdentity` with injectable `storage` and `locks`, pair and single modes, `reset`, `release`, `?reset=1`.
  - Tests (`identity.test.ts`, stand-in `locks` with a held-name set and a Map-backed `storage`): the second tab with the same session id gets a new pair; a held single replica name gives a new replica id; `reset` deletes only this identity's databases (a second session's databases survive, checked with `fake-indexeddb`); a reset pair restarts at incarnation 1; `locks` undefined gives `exclusive: false`; the retry limit throws.
  - _Requirements: R14_

- [x] 9. Exports and budget check
  - `skeleton/src/index.ts`: add the six value exports (`createReplica`, `createPair`, `createInPageLink`, `attachLink`, `deriveSync`, `acquireIdentity`) next to the merge-kit exports, plus types.
  - Measure: file count, non-test TS/TSX lines, export count. Record the measured numbers in `evidence/` as a small JSON file named `skeleton-budget.json` only if the project already keeps budget evidence there; otherwise report them in the task result. If any limit is exceeded, stop and report which module to trim (design, Budget).
  - Test (`index.test.ts`): the index exports exactly the expected names, and `rg` for `yjs` or `y-indexeddb` outside `store.ts` finds nothing, and no `BroadcastChannel`, `SharedWorker`, `Date.now` or `Math.random` appears in `skeleton/src/sync` except the allowed `newId` in `identity.ts`.
  - _Requirements: R6.3, R14.1, R17_

- [ ] 10. Offline shell (may run after `limbo-layer`)
  - In the app with a Vite config: `vite-plugin-pwa` precache of the shell, or a hand-written cache-first worker if the plugin fails. Keep it out of `skeleton/`.
  - Test (`e2e/offline-shell.spec.ts`, `pnpm e2e`): load the app, make edits, `context.setOffline(true)`, reload, and assert the same state and the same wisp count.
  - Deferred, not skipped, if no Vite app exists yet.
  - _Requirements: R16_
