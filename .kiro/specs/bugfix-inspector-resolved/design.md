# Design: bugfix-inspector-resolved

## 1. Root cause

`makeStore` in `skeleton/src/limbo/shell.tsx` keeps `seen: Map<id, { d, resolved }>`. The map is updated only inside `build()`, which runs lazily from `get()`: every descriptor in the current list is stored as open, and every stored id missing from the list is marked `resolved`.

The `session.onCross` handler runs `for (const [k, e] of seen) if (e.resolved) seen.delete(k)`, then bumps `crossing`. The handler cannot tell two kinds of resolved entry apart:

- entries resolved before this crossing began (the ones R9.5 says to remove now), and
- entries resolved by the ops this crossing applied.

For an incoming resolve, the receive applies the op, `replica.subscribe` fires and `build()` marks the entry resolved, and then `onCross` fires in the same crossing and deletes it. Whether `build()` ran before `onCross` or not, the entry never reaches a snapshot as resolved:

- If `build()` ran first, `onCross` purges the entry.
- If `build()` has not run yet, `seen` still holds the entry as open. The next `build()` marks it resolved, and that happens after the purge, so it would survive. The lake scene hits the first case.

A local resolve is marked by a `build()` between crossings, so the next `onCross` correctly purges it. That is why the viewer's own resolve (the tent) stays listed.

The layer's own docs say "the next `onCross` clears resolved entries" (limbo-layer design §3). That wording is the source of the bug.

## 2. Fix approach

Give each resolved entry a marker saying when it resolved, and have `onCross` purge only entries that resolved before this crossing's ops were applied.

- `seen` entries gain `at?: number`. It is set once, when `build()` first marks the entry resolved, to `replica.log().length`. It is cleared when the id reappears in the list (re-twinned).
- `onCross(ops)` first sweeps: it runs `build`'s marking step against `replica.state()` so that an entry the receive has just resolved, and `build()` has not yet seen, is marked now.
- It then computes `before = replica.log().length - ops.length`, the log size before this crossing applied its ops, and deletes the entries with `resolved && at <= before`. Entries resolved while applying the crossing's ops have `at > before` and stay until the next crossing.
- The rest of `onCross` is unchanged: `crossing = { seq + 1, k: ops.length }`, then `bump()`.

The marking step moves out of `build()` into a small local function, `mark(now)`, that both call. No new export, file or timer. The `Limbo` interface and `index.ts` do not change.

Why a log-length marker rather than a crossing counter: `build()` is lazy and `replica.subscribe` fires before `onCross` inside a receive, so a counter read in `build()` is the old counter whether the resolve was local or incoming. Log size is monotone, and the crossing's `ops` are exactly the ops it newly applied, so `log().length - ops.length` separates the two cases without reading arrival order or a clock.

Assumption to verify in task 2: `replica.log()` contains the ops of `onCross`'s argument by the time `onCross` fires (they are applied, not buffered). If a test shows otherwise, use the fallback: record the id set of `replica.log()` at marking time and test whether the crossing's op ids were in the log at that time.

Edge cases:

- `ops.length === 0` (no-op resend): `before` equals the log size, so every entry resolved so far is purged, as today.
- A conflict opened and resolved inside one crossing, never seen by a `build()`: it was never listed open, so it is not listed as resolved. This matches R6.7 and is unchanged.
- Re-twinned (resolve ‖ resolve): the id is back in `now`, so `mark` sets `resolved: false` and clears `at`. It shows as an open twin.

## 3. Tests

Each test runs against a real `createPair` with the manual scheduler and `pair.settle()`, as the existing layer tests do.

### Shows the bug exists (fail before the fix)

| Test | File | Expectation |
| --- | --- | --- |
| Incoming resolve is listed | `skeleton/src/limbo/inspector.test.tsx` (new case beside "keeps a resolved conflict...") | Stub pair: concurrent `note.claim` ‖ `note.claim` while cut, restore, settle. A shows the claim conflict. Then `b.local('note.delete', ...)` and settle. A's Conflicts section has one `[data-resolved]` row naming `claim-one`; `useLimbo('a').resolved` has the descriptor. Fails today: the section reads "No conflicts." |
| Dropped at the next crossing | same case, continued | `pair.b.local('note.add', 'n2', {})`, settle. The resolved row is gone and "No conflicts." shows. |
| Lake scene lists both | `apps/basecamp/src/views/lake-scene.test.tsx` | Replace the `toHaveLength(1)` assertions with: two rows, one `(rule: resurrect) resolved` and one `(rule: claim-one) resolved`. Fails today with length 1. |

### Shows the fix works

The three tests above pass after the fix, plus:

| Test | File | Expectation |
| --- | --- | --- |
| e2e lists both | `e2e/basecamp-offline.spec.ts` | `conflicts` has two rows, one per rule, each ending `resolved`. |
| Mixed order | `inspector.test.tsx` | Local resolve in crossing N-1 and incoming resolve in crossing N: after N, only the incoming one is listed. After N+1, none. |

### Shows unchanged behaviour still holds

| Test | File | Expectation |
| --- | --- | --- |
| Local resolve | existing "keeps a resolved conflict until the next crossing, then drops it" | Passes unchanged. |
| Re-twinned | `inspector.test.tsx` | Concurrent `note.delete` ‖ `note.restore` (Keep ‖ Delete): after the exchange the conflict is an open twin (`conflicts`, `view.twins`), not in `resolved`. |
| Counts and strings | existing `shell.test.tsx`, `chip.test.tsx`, `wisps.test.tsx`, `fog.test.tsx` | Pass unchanged, including the live-region sequence. |
| Recent exchanges | existing Inspector exchanges test | Passes unchanged (last 3, newest first). |
| Stable snapshot, unsubscribe | existing `shell.test.tsx` | Pass unchanged. |
| No timer | new `shell.test.tsx` case with fake timers | Advancing timers changes neither `resolved` nor `crossing`. |
| Basecamp scene | rest of `lake-scene.test.tsx`, goldens, `pnpm props` | Unchanged and green. |

## 4. Risks

- Skeleton budget: the change is a few lines in `shell.tsx`. Measure the non-test line count with the command in `evidence/budget-basecamp-baseline.md` after the fix and report it. No new file or export.
- The limbo-layer design §3 wording ("The next `onCross` clears resolved entries") becomes wrong. Update it in the same task as the fix.
