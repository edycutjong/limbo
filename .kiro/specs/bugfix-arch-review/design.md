# Design: bugfix-arch-review

Convergence is "measured, property-tested". Numbers come from `evidence/`. Nothing here weakens, skips or lowers `numRuns` of any property. `kit/**` is untouched.

## Files touched

| File | Defect | Change |
| --- | --- | --- |
| `apps/pair-identity.ts` (new, shared by both apps) | D1 | App-side wrapper: real `sessionStorage`, `navigator.locks`, id generator, `location.search` |
| `apps/basecamp/src/main.tsx`, `apps/aftershock/src/main.tsx` | D1 | `boot()` acquires identity, opens named stores, Reset demo uses `identity.reset()` |
| `skeleton/src/core/causal.ts` | D2 | `allocKey` accepts a dot |
| `apps/basecamp/src/actions.ts` | D2 | pass the dot; skip equal-key neighbours |
| `skeleton/src/core/merges.ts` | D2 | `orderedMove` doc comment only |
| `skeleton/src/sync/replica.ts` | D3 | `malformed`, stored-op validation |
| `apps/basecamp/src/ops/expense.add.op.ts` | D3 | spread order |
| `skeleton/src/limbo/marks.tsx` | D4 | `Fog` mode and label |
| `skeleton/src/sync/pair.ts` | D4 | `settle` argument |
| `skeleton/src/limbo/inspector.tsx` | D5 | "Rejected ops" section |

No new skeleton file, no new skeleton export (`skeleton/src/index.test.ts` stays as is). Estimated skeleton delta: +40 to +60 non-blank, non-comment lines on the last recorded 2,149 (limit 2,400). The last task re-measures with the command in `evidence/budget-basecamp-baseline.md` and records it in a `## Skeleton changes` section appended to this file. If a limit is passed, stop and report.

Test locations follow the repo: `*.test.ts(x)` in the `unit` project beside the code. No new `*.props.test.ts` is needed. Property-style checks below use fast-check inside a `*.test.ts` only where the existing test files already do; otherwise they use a fixed table.

---

## D1 Identity is implemented but not wired

### Root cause

`acquireIdentity` was built and exported for R14 but no task wired it. `createPair` already accepts `store?: (name) => OpStore` and defaults to `openStore('limbo:<app>:a' | ':b')`. `boot()` in both apps passes none, and its `reset` calls `deleteStore('limbo:<app>:a|b')`.

### Fix approach

Add `apps/pair-identity.ts` (apps share it; `apps/offline-shell.ts` is the precedent for a shared app helper):

```ts
export interface IdentityOptions { storage?: IdStorage; locks?: IdLocks; newId?: () => string; search?: string }
export function acquirePairIdentity(app: string, o: IdentityOptions = {}): Promise<Identity>
```

Defaults: `storage = sessionStorage`, `locks = navigator.locks` when it exists (else `undefined`), `search = location.search`, `newId` = a short id from `crypto.getRandomValues` (hex). This helper is the only place in the apps that draws a random value, and it is called only by `acquireIdentity`. It is not an op file, so the `op-lint` ban list does not apply; the unchanged-behaviour check greps the apps for the banned names outside this file.

`boot(el, o)` gets `o.identity?: IdentityOptions` and does:

```ts
const ready = acquirePairIdentity(config.name, o.identity).then(async (identity) => {
  const p = await createPair<State>({
    /* app, defs, materialize, twinCount, seedOps as today */
    store: (name) => openStore(name.endsWith(':a') ? identity.names[0]! : identity.names[1]!),
  });
  /* render, as today */
});
```

`createPair` calls the opener with `limbo:<app>:a` and `limbo:<app>:b`, so the opener maps by the side suffix and does not rely on call order. A test asserts the opened names equal `identity.names` for both sides. (Changing `createPair` to pass the side id is the alternative; it is rejected because it changes a skeleton signature for no gain.)

`reset`: `await identity.reset(() => pair?.close())`, then `(o.reload ?? (() => location.reload()))()`. `identity.reset` already deletes only `identity.names`, never enumerating databases, and removes the session key, so the reload mints a new session.

The aftershock `boot` keeps its `seedOps` option. `debug.ready` keeps resolving after the pair exists.

### Failing tests that show the bug

In `apps/basecamp/src/app.test.tsx` and `apps/aftershock/src/app.test.tsx`, with a shared in-memory `IdLocks` and in-memory `IdStorage` passed through `boot(el, { identity })` and `newId` returning `s1`, then `s2`:

- "opens the R14 database names": after boot, `indexedDB.databases()` contains `limbo:<app>:pair-s1:a` and `:b` and does not contain `limbo:<app>:a`. Fails today (the fixed names exist).
- "a second boot with a locked session opens other databases": boot once; boot again with storage copied from the first (same session id `s1`) and the same locks. The second pair's names are `pair-s2:a|b`. Fails today (both open the fixed names).
- "Reset deletes only this session's two databases": create a bystander database `limbo:<app>:pair-other:a` first; click Reset demo; `pair-s1:a|b` are gone, the bystander and the other tab's `pair-s2:*` remain, `reload` was called once, and the session key is cleared from storage. Fails today.

### Tests that show the fix

The same three tests pass. Add `apps/pair-identity.test.ts`: defaults read `sessionStorage`, use `navigator.locks` only when defined, and pass `location.search` (`?reset=1` wipes before the stores open). Update the existing "Reset demo deletes both databases and calls reload" tests (both apps) to assert the `pair-s1` names, and their `afterEach` database cleanup to delete the R14 names. Add a `beforeEach` that clears `sessionStorage` for tests that do not inject storage.

### Unchanged checks

`identity.test.ts` unchanged. `pair.test.ts`, `lake-scene.test.tsx`, `survey-scene.test.tsx` and any test that calls `createPair` directly still open `limbo:<app>:a|b` (default opener). Run `survey-scene.test.tsx` / `lake-scene.test.tsx` "Reset demo clears the flag" unchanged. Persistence: a test boots, edits, tears down the pair without reset, boots again with the same storage and locks (a reload in one tab), and sees the same list and queued ops under the same names (basecamp R14.7 persistence). `pnpm e2e` (new context per test, reload within one) is run in the last task.

---

## D2 One replica, one gap, one key

### Root cause

`allocKey(left, right, r)` returns `generateKeyBetween(left, right) + base62(r.split('#')[0] without '-') + '1'`. The suffix drops the incarnation and the counter, so the key depends only on (left, right, replica). Equal inputs give equal keys. Items with equal keys sort by id in `orderedMove`, so rendering is stable, but `generateKeyBetween(K, K)` throws, and `moveItem` computes `left` and `right` from neighbouring visible items without checking they differ.

### Fix approach

**(a) Unique keys.** Extend the third parameter: `allocKey(left, right, by: ReplicaId | Dot)` with `Dot = { r: ReplicaId; n: number }`. A string keeps today's behaviour exactly (seed, e2e spike, existing tests). A dot produces

```
key = k + enc(dot) + len3(dot) + '1'
dotString = `${dot.r}:${dot.n}`
enc = base62 of dotString   // 3 base62 digits per UTF-16 code unit, already injective
len3 = 3 base62 digits of dotString.length
```

The key can be parsed from the end: strip the final `1`, read 3 digits as the length L, read the previous 3L digits as `enc`. So (k, dot) is recoverable from the key, and distinct dots can never give the same key, whatever the gap. `n` is digits only, so splitting `dotString` at the last `:` is unambiguous. The key keeps a final `1`, so the fractional part does not end in `0` and `generateKeyBetween` accepts it as a bound. Keys grow by `3 * len(dotString) + 4` characters per allocation; a test pins that bound. A test shows a dot key never equals a seed key (`seed`'s suffix has no length field and the real seed is only built with the string form).

**Callers pass the dot of the op they are about to create.** `Replica.local` creates `n = ++counter` in the current namespace, and `addItem` already computes it as `(r.vv()[r.ns] ?? 0) + 1`. Move that into a local helper `nextDot(r) => ({ r: r.ns, n: (r.vv()[r.ns] ?? 0) + 1 })` in `actions.ts` and use it in both `addItem` and `moveItem`. A test asserts that decoding the key of every op created by `addItem` and `moveItem` gives that op's `id`.

**(b) Seeds.** `seed.ts` and `e2e/spike/main.ts` call `allocKey(prev, null, 'seed')` with a string: the legacy branch is untouched, so keys and `seedVersion` stay as they are. The seed test asserts a recorded literal for the first seed key as well as the hash.

**(c) Equal neighbours.** In `actions.ts`, add one small function used by `moveItem`:

```ts
function gap(keys: readonly string[], i: number): [string | null, string | null] {
  const left = i > 0 ? keys[i - 1]! : null;
  let j = i;
  while (left !== null && j < keys.length && keys[j]! <= left) j++;   // skip keys equal to left
  return [left, j < keys.length ? keys[j]! : null];
}
```

`keys` are the winning `pos` of the other visible items, in `order`. `order` sorts by key, so keys never decrease and `<= left` means `=== left`. The new key lands after the run of equal keys instead of inside it (a visible position may shift by the run length; there is no valid key strictly between equal keys). `addItem` always has `right = null`, so `left >= right` cannot occur; a test pins that. `allocKey` itself keeps throwing on `left >= right`, because that is a caller bug and a silent result would hide it.

**(d) Doc comment.** In `merges.ts`, replace "Keys carry a replica suffix, so two moves into one gap give distinct keys; the id only breaks a tie between identical keys." with: "Keys from different ops differ (the key suffix encodes the op's dot); identical keys can exist in data written before that, and the id then breaks the tie." No code change.

### Failing tests that show the bug

- `skeleton/src/core/causal.test.ts`: `allocKey(L, R, {r:'a#1', n:1}) !== allocKey(L, R, {r:'a#1', n:2})`; the same with `r: 'a#1'` and `'a#2'`, and with dashes (`a-b#1` vs `ab#1`); a table of gaps. These cannot be written against today's string form. The bug itself is shown by `allocKey(L, R, 'a#1') === allocKey(L, R, 'a#2')` (true today) and `allocKey(K, K, 'b#1')` throwing "K >= K"; keep both lines in the test as a "legacy form is unchanged" case.
- `apps/basecamp/src/actions.test.ts`, "move after a restore with equal keys": create replicas `a` and `b` as the file's existing helper does. A adds L and R (or uses the seed), `moveItem(X)` into the L/R gap, `deleteItem(X)`, `addItem` Y or `moveItem(Y)` into the same gap, `restoreItem(X)`. Assert today: X and Y hold equal `pos` (fails the new "keys differ" assert), then `moveItem(Y, indexOfX)` throws. After the fix: it does not throw, the move op is applied (Y's `pos` is now strictly between or after as designed), and after exchanging ops `canonical(a.state()) === canonical(b.state())`.
- Pre-fix data: build the equal-key state by hand (two `item.add`/`item.move` ops with the same literal key, which is how stored data looks) and assert `moveItem` between them does not throw and returns a key `> K`.

### Tests that show the fix

The above pass. Add: a property in `causal.test.ts` (fast-check, same style as the file's other properties) over random gaps (`generateKeyBetween` chains) and random dots: keys are pairwise distinct for distinct dots, every key sorts strictly between `left` and `right`, and `decode(key)` returns the dot (the decoder lives in the test file, not in the skeleton). `model.test.ts`: `orderedMove` order with equal keys is still (key, id).

### Unchanged checks

`causal.test.ts` existing `allocKey` cases; `seed.test.ts`; the golden histories G01 to G21 (which carry literal keys) and `pnpm props`; the `item.move` and `item.add` op files are untouched; `lake-scene.test.tsx` and `survey-scene` order assertions pass unchanged (they only rely on relative order).

---

## D3 Ingress validation

### Root cause

`malformed(op)` checks `id`, `stamp.r`, `stamp.l`, `stamp.n`, and `id === r:n`. It never looks at `deps`, `target`, `op` or `payload`. `causalBuffer.ready` does `Object.keys(op.deps)` and `op.deps[r] ?? 0`, so `deps: null` throws a `TypeError`, and `deps: { x: 'a' }` or `{ x: -1 }` compares nonsense. In `createReplica` the stored-op loop runs `observe(core, op)` and `buf.offer(op)` with no check, so a corrupt stored entry throws before the replica exists. `expense.add.op.ts` spreads the payload after `target`.

### Fix approach

```ts
const plain = (v: unknown): v is Record<string, unknown> =>
  typeof v === 'object' && v !== null && !Array.isArray(v) && (Object.getPrototypeOf(v) === Object.prototype || Object.getPrototypeOf(v) === null);
```

`malformed` adds: `!plain(op.deps) || Object.values(op.deps).some((n) => !Number.isSafeInteger(n) || n < 0)`, `typeof op.target !== 'string'`, `typeof op.op !== 'string'`, `op.payload === undefined`. The existing checks stay, and the `op?.` guards stay so `null` and non-objects are rejected, not thrown on.

In `createReplica`, split `stored` into good and bad before anything reads it: bad ops get `reject({ id: String(op?.id), reason: 'malformed' })` and are skipped (not `observe`d, not in `savedIds`, not offered). Good ops follow the existing path. The `Rejection` type already has `'malformed'`.

`expense.add.op.ts`: `{ ...op.payload, target: op.target, op }`.

An op with `payload: null` stays valid (only `undefined` is rejected), since existing payloads never use `null` and rejecting more would exceed the request.

### Failing tests that show the bug

In `skeleton/src/sync/replica.test.ts` (using its existing `peerOps()` helper and store stub):

- `receive` of `{ ...base, deps: null }`, `{ deps: { x: 1.5 } }`, `{ deps: { x: -1 } }`, `{ deps: [] }`, `{ target: 3 }`, `{ op: 3 }`, `{ payload: undefined }`: each expected `rejected = [{ id, reason: 'malformed' }]`, no throw, nothing applied, `puts` empty, `log()` empty. Today `deps: null` throws a `TypeError`; the others are accepted.
- Startup: a store whose `all()` returns one valid op and one op with `deps: null`. Expected: `createReplica` resolves, the valid op applies, `rejected()` has the bad id with `'malformed'`, `saved(badId)` is false. Today it rejects with a `TypeError`.
- `apps/basecamp/src/ops/expense.add.op.test.ts` (or the existing expense ops test file): payload with a `target: 'evil'` field gives `adds[op.id].target === op.target`.

### Tests that show the fix

The same tests pass. Add a table-driven positive test: valid ops (`deps: {}`, `deps: { 'a#1': 3 }`, payload `{}`, payload `null`, payload with nested values, a seed op) are accepted, apply and persist exactly as before. The `replica.test.ts` "keeps the last 50" test passes unchanged.

### Unchanged checks

All of `replica.test.ts`, `link.test.ts`, `pair.test.ts`, `store.test.ts`; `pnpm props` (simulator ops are well-formed); `expense` model tests and goldens.

---

## D4 Fog and exchange settle disagree with the chip

### Root cause

`deriveSync` makes `buffered > 0` alone DEVELOPING. `Fog` recomputes its own condition (`unacked + behind > 0`) instead of following the axis, and `tickAll` in `createPair` omits `buffered` from the settle sum.

### Fix approach

`marks.tsx`: `const mode: FogMode = view.axis === 'FOGGED' ? 'full' : view.axis === 'DEVELOPING' ? 'haze' : 'none'`; the label is `` mode === 'full' ? 'Offline' : n > 0 ? `Syncing ${n}…` : 'Syncing…' `` with `n = view.unacked + view.behind`.

`pair.ts`: `log.settle(va.unacked + va.behind + va.buffered + vb.unacked + vb.behind + vb.buffered === 0)`.

`deriveSync`, `nextFixed`, `createExchangeLog` are not touched. While an op stays held forever, the chip stays "Syncing…" (as today) and the exchange stays open instead of being moved to "Recent exchanges"; the open list is not capped today and this change does not add a cap.

### Failing tests that show the bug

- `skeleton/src/limbo/fog.test.tsx`: use the pattern of `chip.test.tsx` (`pair.a.receive([{ id: 'b#9:2', … deps: { 'b#9': 1 } }])`, a second op whose dependency is missing, so it is held). Assert `view.buffered === 1`, `unacked + behind === 0`, `data-fog` is `haze`, and the label is `Syncing…`. Today `data-fog` is `none`.
- `skeleton/src/sync/pair.test.ts`: inject a held op on one side after an exchange has crossed; assert `pair.exchanges().open` still holds the crossing and `last` has not grown while `buffered > 0`; deliver the missing op and assert the exchange then settles into `last`. Today it settles at once.

### Tests that show the fix

Both pass. `fog.test.tsx` "haze reads Syncing n… with n = unacked + behind" passes unchanged (label with `n > 0`).

### Unchanged checks

`chip.test.tsx` (the five strings and icons in the same order), `fog.test.tsx` (full fog, filter, lift and drain classes, reduced motion adds no class), `status.test.ts` (`deriveSync`, `nextFixed`), `wisps` tests (count = `unacked`), `pair-view.test.tsx`, the Inspector "Recent exchanges" tests, and the e2e judge flow.

---

## D5 Rejected ops are invisible

### Root cause

`Replica.rejected()` has no consumer. The Inspector shows queued ops, exchanges, conflicts and replica facts only.

### Fix approach

In `inspector.tsx`, add after "Conflicts":

```tsx
<section aria-label="Rejected ops">
  <h3>Rejected ops</h3>
  {rejected.length === 0 ? <p>No rejected ops.</p> : (
    <table aria-label="Rejected ops"><thead><tr><th>op id</th><th>reason</th></tr></thead>
      <tbody>{rejected.map((r, i) => <tr key={`${r.id}:${i}`}><td>{r.id}</td><td>{r.reason}</td></tr>)}</tbody></table>)}
</section>
```

with `const rejected = replica.rejected()` read during render. `replica.receive` already calls `notify()` when it rejects, and `persist` calls `notify()` on a store failure; `useLimbo` subscribes to `replica.subscribe(bump)`, which builds a new snapshot, so the Inspector re-renders. `Table` is not reused because it has fixed op columns. No change to `shell.tsx`. Keys include the index because malformed ids can repeat.

### Failing tests that show the bug

In `skeleton/src/limbo/inspector.test.tsx`: open the Inspector, read "No rejected ops." (fails: no such text), then `act(() => pair.a.receive([{ …, deps: null }]))` and assert a row with the bad id and `malformed`; then receive an unknown-op op and assert a second row with `unknown-op`. A store-failed case uses a store stub whose `put` rejects and `replica.local(...)` to show `store-failed`. The update is seen with the drawer open, with no reopen.

### Tests that show the fix

These pass. A second case checks the table follows `replica.rejected()` order and holds at most 50 rows. A focus test checks the drawer's focus trap still works with the added section.

### Unchanged checks

Every existing `inspector.test.tsx` case, including "keeps a resolved conflict until the next crossing, then drops it" and the "Queued ops" / "Recent exchanges" / "Conflicts" / "Replica" section names, and `shell.test.tsx` (stable snapshot, unsubscribe).

---

## Cross-cutting checks (last task)

- `pnpm typecheck && pnpm test && pnpm props` green; record test counts.
- `pnpm e2e` green (two contexts, `setOffline`, the judge flow, Reset demo).
- `grep` the apps and skeleton for `Date.now|new Date|performance.now|Math.random|randomUUID|toLocale|BroadcastChannel|SharedWorker`: the only new hit is the id generator in `apps/pair-identity.ts` (`crypto.getRandomValues`, not on the banned list), and none is in an op file or in `replica.ts`, `causal.ts`, `merges.ts`.
- `grep` the skeleton for app names (`basecamp`, `aftershock`, `item.`, `expense.`, `sector.`) outside tests: no new hit.
- Skeleton budget re-measured with `evidence/budget-basecamp-baseline.md`; export count unchanged.

## Skeleton changes

(Filled in by the last task: each skeleton file touched, its line delta, and the measured totals.)
