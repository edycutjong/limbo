# Design: limbo-layer

Requirements: `requirements.md` (R1 to R21). This design follows the binding op contract in `.kiro/steering/local-first.md` and the structure in `structure.md`. Wording: "measured, property-tested".

## 1. What exists and what the layer reads

| Source | Used for |
|---|---|
| `pair.view(id)` → `PairView` | link, axis, conflict, `unacked`, `behind`, `buffered`, `twins`, `chip`, `fixed`, `fixedCount` |
| `pair.exchanges()` → `{ last, open }` | Recent exchanges (oldest first; reversed for display), `k` for the live-region message |
| `pair.sessions[id].onCross(cb)` | crossing wisps (`ops` = newly applied only) |
| `pair.sessions[id].subscribe`, `pair.{a,b}.subscribe` | re-render triggers |
| `pair.sessions[id].peerId()` | Inspector Link |
| `replica.id`, `vv()`, `log()`, `stalledOwn()`, `state()` | Inspector Replica, chip extra line, conflict descriptors |
| `defs` (the app's `OpDef[]`) | merge and intent columns, looked up by op name |
| R21 additions | `pair.queued(id)`, `Crossing.id/target`, `deliveryOrder` |

`view(id)` calls `nextFixed` as a side effect and returns a new object each call. The hook therefore calls it once per change, never in render.

## 2. Files and line allowance

Budget check (measured while writing this spec): 12 non-test TS files, 1,494 lines. Headroom is 18 files and 306 lines. The allowance below is an estimate to be measured at each task. It totals about 330 lines with the R21 edits, which is over. Layout and decoration go in CSS (not counted) to keep TSX small.

| File | Role | Lines |
|---|---|---|
| `limbo/tokens.css` | tokens, fonts import, motion keyframes, reduced-motion rule, layout | not counted |
| `limbo/shell.tsx` | `LimboShell`, `useLimbo`, motion flag, live region, global keys | 75 |
| `limbo/marks.tsx` | `Fog`, `Wisps` (+ crossing wisps), `FixedStamp`, `StatusChip` | 70 |
| `limbo/twin.tsx` | `Twin` | 30 |
| `limbo/inspector.tsx` | `Inspector` | 60 |
| `limbo/pair-view.tsx` | `ReplicaPair`, `LinkCord`, single layout, bottom bar | 50 |
| `limbo/shuffle.ts` | `runShuffle` replay (worker-safe, no React) | 35 |
| `limbo/shuffle-test.tsx` | `ShuffleTest` | 25 |
| `limbo/index.ts` | entry | 10 |
| R21 edits in `sync/status.ts`, `sync/pair.ts`, `core/simulate.ts` | `unackedOps`, `queued`, `Crossing.id/target`, export | ~15 |

If the sum passes 1,800, the task that crosses it stops and reports (R20.3). Candidate cuts, in order: merge `shuffle-test.tsx` into `shuffle.ts`'s caller in the app; drop the dev warning in R2.6; move the live-region text table to CSS-free data. Do not cut a requirement without a spec change.

Files outside the budget: `skeleton/src/limbo/*.test.tsx`, `skeleton/src/limbo/test/` (stub app, helpers), `apps/<app>/src/shuffle.worker.ts` (app-owned worker entry). The measurement script must treat `test/` as test code; Task 1 checks how the existing budget measure counts files and adds that rule if it is missing.

## 3. Subscription and the hook

```ts
// shell.tsx
interface LimboCtx { pair: Pair<any>; defs: readonly OpDef[]; describe(state: unknown): Conflict[]; motion: 'full' | 'reduced' }

function useLimbo(id: 'a' | 'b'): Limbo {
  const { pair, defs, describe } = useContext(Ctx)!;       // throws outside LimboShell (R2.4)
  const store = useMemo(() => makeStore(pair, id), [pair, id]);
  const snap = useSyncExternalStore(store.subscribe, store.get); // snapshot cached per change
  ...
}
```

`makeStore` keeps `version`, a cached snapshot and a cached crossing record. `subscribe(fn)` registers `replica.subscribe`, `session.subscribe` and `session.onCross`, and returns one unsubscribe for all three. On any callback, it bumps `version`; `get()` recomputes `{ view: pair.view(id), queued: pair.queued(id), exchanges: pair.exchanges(), conflicts: describe(replica.state()), crossing }` only when `version` changed. `onCross` also sets `crossing = { seq: seq + 1, k: ops.length }`. The snapshot is therefore stable between changes, as `useSyncExternalStore` requires.

Conflict descriptors are read from the app each change. The "resolved" memory (R9.5) lives in the same store: a map `id → descriptor` of descriptors seen since the last crossing. When a descriptor leaves the current list it stays in the map with `resolved: true`. The next `onCross` clears resolved entries. This is presentation state only. No count or label reads it except the Inspector's resolved rows.

## 4. Binding table (the tests assert each row)

| Visual | Component reads | Test input |
|---|---|---|
| Full fog | `view.axis === 'FOGGED'` | `pair.cut()` |
| Haze `Syncing n…` | `axis === 'DEVELOPING' && unacked + behind > 0`; `n = unacked + behind` | restore, before `settle` |
| Fog off | otherwise | after `settle` |
| Wisps | `view.unacked`; `min(unacked, 12)` icons; digits = `unacked` | cut, add 3 edits, then 14 |
| Crossing wisps | `crossing.k`, `crossing.seq` | restore and settle; resend with no new ops gives none |
| Twin | descriptors from `describeConflicts`, count shown from `view.twins` | concurrent conflicting edits, restore |
| FixedStamp | `view.fixed`; entrance on `fixedCount` change | resolve, then `settle` |
| Chip | `view.chip` + `replica.stalledOwn()` | each of the five chip strings |
| Inspector queued | `pair.queued(id)` | same count as `view.unacked` |
| Inspector exchanges | `exchanges().last` reversed | three exchanges, fourth evicts the first |

Edge cases made explicit: buffered-only (`unacked = 0`, `behind = 0`, `buffered > 0`) gives no fog and the chip `Syncing…` (R3.7). `stalledOwn > 0` adds the chip line.

## 5. Components

### Fog and marks

```tsx
function Fog({ id, children }) {            // wraps one replica's content
  const { view } = useLimbo(id);
  const mode = view.axis === 'FOGGED' ? 'full'
    : view.axis === 'DEVELOPING' && view.unacked + view.behind > 0 ? 'haze' : 'none';
  return (
    <div className="limbo-fog" data-fog={mode}>
      {children}
      {mode !== 'none' && <FogVeil mode={mode} label={...} />}   // aria-hidden overlay, pointer-events: none
    </div>
  );
}
```

- `data-fog="full"` applies `filter: saturate(.25) contrast(.9)` to the content wrapper, not to the label. The veil is a sibling overlay with `pointer-events: none`, and the label sits in a separate element in `--fog-ink` with its own background chip so it is never on the veil colour (R3.4, R3.5).
- `Wisps` renders `min(unacked, 12)` `<span class="wisp">`, plus `<output class="wisp-count">` with the full number. The plate caption is `PLATE {plate} · {unacked} WAITING`.
- Crossing wisps: an effect keyed on `crossing.seq` renders `min(k, 12)` transient elements with `style={{ '--i': index }}` for the CSS stagger. They are removed on `animationend`. With reduced motion none are rendered (the counter changes instead).
- `FixedStamp`: `view.fixed` gates rendering. The entrance class is set when `fixedCount` differs from the last rendered value (kept in a ref). The settle to a small mark is a CSS animation with `animation-delay: 2s` and `forwards`; no timer in JS.
- `StatusChip`: `<span role="status">`-free (the one live region is separate). Icon by axis (cloud-slash, arrows, check), conflict icon (two overlapping squares).

### Twin

```tsx
function Twin({ id, atRest, ghost, caption, rule, actions }) {
  // id is the conflict descriptor id; the app renders <Twin> only while a descriptor exists.
}
```

Single row element `div.limbo-twin[data-limbo-row]`: at-rest content in flow, the ghost as an absolutely positioned layer with `transform: translate(6px, 6px)`, `outline: 1px dashed var(--twin)`, `opacity: .7`, `aria-hidden`, and a "TWIN" label (small caps, 100% opacity because it sits outside the faded layer). Caption, rule line (`Decided by: claim-one`) and `actions` render below at 100% opacity. `onKeyDown` on the row: `Enter` clicks the first `button` inside `actions` (R6.6). The exit animation uses a `data-leaving` state set from the descriptor's removal; under reduced motion the element unmounts at once.

The app decides what a twin looks like and when it is present. For BASECAMP the app passes the claim-one loser as `ghost` and the winner as `atRest`. The layer never reads the item model.

### Inspector

A `<dialog>`-style drawer (`role="dialog"`, `aria-modal`, labelled by its title). Five `<section>`s in the requirement order. Rows are `<table>` rows with a header (`op`, `target`, `merge`, `intent`, `stamp`, `deps`). Stamp formatting is `${l}·${r}·${n}` and deps is the `r:n` list. The intent text comes from `defs.find(d => d.name === op).intent` rendered as `kind` plus `field` where present. This is presentation formatting, not derivation. Exchanges: `exchanges().last` reversed, each crossing labelled `in` when `crossing.side === id`, else `out`. The crossings come from the shared log, so both replicas' Inspectors list every op that crossed in either direction.

Focus: on open, focus moves to the close button; Tab cycles inside; `Escape` and `I` close; focus returns to the opener (`useRef` to `document.activeElement` at open).

### ReplicaPair and LinkCord

`ReplicaPair({ names, plate, onReset, onAdd, renderReplica })`: for each of `a` and `b`, a card containing `Fog`, `Wisps`, `StatusChip`, `FixedStamp`, the live region and `renderReplica(id)` (the app's rows and forms). `LinkCord` is a SVG line with a lever `<button>` (44 px). Label and drawn state follow `view('a').link === 'up'`. Layout is CSS grid with two media queries (`min-width: 1024px` side by side, `640px to 1023px` stacked). The pair layout is not rendered below 640 px unless `?replicas=2`.

### Single layout

`?replicas=1|2` is read once from `location.search` in the shell (an injectable `search` prop for tests). Without the query, `matchMedia('(max-width: 639px)')` selects single. In single mode the shell renders replica `a`'s card with `renderReplica('a')` and a fixed bottom bar: Add (`onAdd`), Inspector (opens the drawer), "Try two replicas" (sets mode to pair). The peer `b` still exists and syncs through the same link; its card is not drawn. The lever is in the Inspector Link section.

### Shuffle test

`runShuffle` is plain TypeScript (no React, no DOM) so a worker can import it:

```ts
export interface ShuffleInput { ops: Op[]; n: number; seed: number; dupRate?: number }
export interface ShuffleResult { ran: number; disagree: number; states: string[]; trace?: string }
export function runShuffle(
  input: ShuffleInput,
  materialize: (ops: readonly Op[]) => unknown,
  onProgress?: (done: number) => void,
): ShuffleResult
```

For each of `n` runs it makes a seeded `makeRand(seed + i)`, calls the exported `deliveryOrder(ops, rand, dupRate)` from `core/simulate.ts`, feeds the ids through `causalBuffer()`, collects the applied ops in apply order, and records `canonical(materialize(applied))`. `ran` counts completed runs. `disagree` is the number of final states that differ from the first. On disagreement the shrinker removes ops (and, with them, ops that depend on them, so the set stays causally closed), keeps the removal if two orders still disagree, and stops after 200 attempts. The trace is `explainTrace` over steps rebuilt from the two disagreeing orders of the smallest set.

The seed op set has a golden: `ShuffleTest` takes `golden?: { opIds: string[]; state: string }`. When the on-screen op ids equal `golden.opIds` and the first final state equals `golden.state`, it prints "matches the specified result ✓". Otherwise it prints no golden line (R12.4).

`ShuffleTest` props: `{ ops, n = 1000, createRunner, golden }`. `createRunner` returns `{ run(input): Promise<ShuffleResult>; cancel(): void }`. The app wires it to `new Worker(new URL('./shuffle.worker.ts', import.meta.url), { type: 'module' })`; the worker file imports `runShuffle` and the app's `materialize`. Tests inject a runner that calls `runShuffle` directly. A worker needs the app's `materialize` in its own bundle; passing functions through `postMessage` is not possible, which is why the worker file is app-owned.

Output line: `${ran.toLocaleString?}` is banned (locale). Use a small `groupThousands(n)` that inserts commas by string slicing, so output is `1,000 / 1,000 orderings → same state` on every machine.

## 6. Tokens, fonts and CSS

`tokens.css` begins with the exact `:root` block from R13.1, then the Fontsource imports (`@import '@fontsource/old-standard-tt/400-italic.css'` and so on), then component CSS. Package names to confirm at task time: `@fontsource/old-standard-tt`, `@fontsource/libre-caslon-text`, `@fontsource/atkinson-hyperlegible-next`, `@fontsource/dm-mono`. If `atkinson-hyperlegible-next` is not on Fontsource, use `@fontsource/atkinson-hyperlegible`, which is already the second family in the token, and note the change in this design. The fonts ship through the app's Vite build, so they are precached with the app shell (skeleton-sync R16) and load offline.

Contrast, computed from the tokens (WCAG 2.x, computed while writing this spec):

| Text | on `--bg` | on `--card` |
|---|---|---|
| `--ink` | 13.32 | 11.84 |
| `--muted` | 5.45 | 4.85 |
| `--live` | 5.26 | 4.68 |
| `--fog-ink` | 5.94 | 5.28 |
| `--developing` | 5.40 | 4.80 |
| `--twin` | 5.80 | 5.15 |
| `--after` | 7.04 | 6.26 |
| `--before` | 2.46 | 2.19 |

All text colours pass 4.5:1. `--before` fails, so it is overlay and border only (R13.5, R18.2). The ghost at 70% opacity of `--twin` over `--bg` is about 3.1:1, so ghost content is decorative and `aria-hidden`; the readable caption is at 100%. The contrast test parses `tokens.css` and recomputes these.

Motion lives in CSS keyframes named `limbo-drain`, `limbo-lift`, `limbo-cross`, `limbo-twin-in`, `limbo-twin-out`, `limbo-stamp`, `limbo-settle`. Components add a class only when `data-motion="full"`; under `reduced` the class is not added, and the media query is a second guard (R15).

## 7. Live region and keyboard

One `<div aria-live="polite" class="limbo-sr">` per card. A reducer inside `useLimbo` compares the previous and current snapshot and yields at most one message per change:

| Transition | Message |
|---|---|
| link `up` → `down` | `Link cut. Edits will wait on this device.` |
| `down` → `connecting`/`up` | `Link restored. Syncing…` |
| entering LIVE after an exchange closed | `{k} edit(s) synced.` + ` {n} conflict(s) need you.` if `twins > 0` |

`k` is the length of the newest entry of `exchanges().last` when its crossing set is new (compare the stored count of exchanges). No other message is produced.

Keys: one `keydown` listener on the shell root. It ignores events from `input, textarea, select, [contenteditable]`, and events with `ctrlKey`, `metaKey` or `altKey`. `l`/`L` calls `pair.cut()` or `pair.restore()` according to `view('a').link`. `i`/`I` toggles the drawer. ArrowUp and ArrowDown move focus across `[data-limbo-row]` in DOM order within the root. Enter-on-twin is in `Twin`. Space and Delete belong to the app rows (documented in the README of `skeleton/src/limbo`, not a new file: a comment block in `shell.tsx`).

## 8. Test plan

Project `limbo`: `include: ['skeleton/src/**/*.test.tsx']`, `environment: 'jsdom'`, `setupFiles: ['skeleton/src/limbo/test/setup.ts']` (cleanup, `matchMedia` stub, CSS import stub). The root script becomes `vitest run --project unit --project limbo`. Existing `unit` and `props` blocks are untouched.

The stub app (`test/app.ts`): ops `note.set` (causal-lww, `set`), `note.add` (commutes, `create`), `note.delete` and `note.restore` (resurrect, `life`), `note.claim` (claim-one, `claim`). `materialize` folds the ops with `merges`; `twinCount` counts the resurrect twin and claim losers; `describeConflicts` returns descriptors from the same fold. Each test builds a real `createPair` with the in-memory store and a manual scheduler, and calls `pair.settle()`. A helper `renderApp(pair)` wraps `LimboShell`.

Scenarios (each maps to a requirement in the task list): cut → fog, chip, counter; restore → haze then clear; 14 edits → 12 wisps and `14`; crossing wisps equal `k`, and none on a no-op resend; conflict → twin on one row; resolve → one FIXED, none on re-render; stalled own op line; Inspector rows equal `unacked`, columns correct, exchanges newest first, resolved conflict kept until next crossing; reduced motion; keys including form-field suppression; live-region messages once; `ReplicaPair` lever labels and Reset demo callback; single layout bottom bar and `?replicas`; ShuffleTest ran-count, golden line, failure path with an injected broken materialize (`k of N disagree` and a trace); contrast; no CDN string.

The Playwright two-context e2e (`pnpm e2e`) is not part of this spec's tasks. It belongs to the first app with a Vite build.

## 9. Risks and open points

1. **Line budget.** The estimate exceeds the 306 lines of headroom (R20.3). The owner decides whether to raise the provisional budget if the measure crosses 1,800.
2. **Exports.** `skeleton/src/index.ts` is at its 15-export cap, so the layer uses its own subpath entry (R20.2). This is an assumption: if the cap is meant to cover the whole package, it is already reached.
3. **Single-replica fog.** A replica with no link attached has link `down`, so it would sit in full fog forever. The single layout therefore keeps the peer headless and linked, and shows replica `a`. A real single-device app with no peer is out of scope.
4. **Test script.** `pnpm test` runs only `unit` today. The `limbo` project is added to that script so component tests run in the normal gate (R19.3). Kit hooks that call `pnpm test` need no change.
5. **Shrunk trace.** Greedy shrinking with a 200-attempt cap may not find a minimal set. It is reported as "smallest found".
6. **Resolved conflicts.** "Resolved until the next exchange" needs a retained list (presentation state, R9.5). It is the one place the layer keeps history of its own, and it never feeds a count.
7. **Row keys.** Space and Delete are app-owned (R16.5). The user asked for them as layer behaviour in the keyboard list; the layer cannot know the app's ops, so it exposes the `data-limbo-row` convention only.
8. **Fontsource names.** Verify the four package names when installing (Section 6).
