# Requirements: limbo-layer

This spec adds the React layer in `skeleton/src/limbo/` that makes a replica's real sync state visible: fog, wisps, twins, a FIXED stamp, a status chip, a limbo inspector, a replica pair with a simulated link, and a shuffle test. It renders only state that `skeleton-sync` already derives (`status.ts`, `pair.ts`, `replica.ts`, `link.ts`). It computes no sync number of its own. Both apps (`apps/basecamp`, later `apps/aftershock`) use the components unchanged; rows and forms stay in the app. The op contract in `.kiro/steering/local-first.md` is binding. Wording everywhere: "measured, property-tested", never "proven" or "guaranteed". Any number quoted in a page or comment comes from `evidence/`.

## Glossary

- **View**: `pair.view(id)`, a `PairView`: `link`, `unacked`, `behind`, `buffered`, `twins`, `axis` (`FOGGED` | `DEVELOPING` | `LIVE`), `conflict` (`CLEAR` | `CONFLICT`), `chip`, `fixed`, `fixedCount`.
- **Crossing event**: one call of `pair.sessions[id].onCross(cb)`. `cb` receives only the ops newly applied by that receive, so `k = ops.length` and duplicates are never counted.
- **Queued ops**: the ops counted by `unacked` (R21.1 exposes the list).
- **Exchange**: as in skeleton-sync R12. `pair.exchanges().last` is oldest first; the Inspector shows it newest first.
- **Conflict descriptor**: an app-supplied record for one surfaced twin: `{ id, target, rule, caption }`. `rule` is a `Merge` name from the op defs.
- **Presentation state**: a flag or retained list the layer keeps only to draw an animation or a "resolved" row. It never feeds a count, a label or a binding in R3 to R9.

## R1 Source of truth

User story: as a user, I want every fog, wisp and chip to match the protocol, so the screen never says something the sync layer does not.

1. The layer shall read sync state only from `Pair` (`view`, `exchanges`, `sessions[id].onCross`, `sessions[id].peerId`, `a`/`b` replica getters) and from the R21 additions.
2. The layer shall not compute `unacked`, `behind`, the axis, the conflict axis, the chip text, FIXED, or the crossing count. It shall display the values it is given.
3. The layer shall not own a timer that sets or clears a sync-derived visual. A timer may only run a CSS-equivalent animation delay in presentation state (R14).
4. The layer shall import no `yjs`, no `y-indexeddb`, no `BroadcastChannel` and no `SharedWorker`.
5. The layer shall not read `Date.now`, `new Date`, `Math.random`, `crypto.randomUUID` or `toLocale*` in any component or hook. A stagger delay is derived from the wisp index.
6. Anything app-specific (rows, forms, entity names) shall live in the app. The layer shall name no BASECAMP or AFTERSHOCK entity.

## R2 LimboShell and `useLimbo`

1. `LimboShell` shall accept `{ pair, defs, describeConflicts, children }` and shall provide the pair, the defs and the conflict descriptors to its children through React context.
2. `useLimbo(id)` shall return `{ view, replica, session, queued, exchanges, conflicts, crossing, announce }` for replica `id` (`'a'` or `'b'`), where `view` is the current `pair.view(id)`.
3. `useLimbo` shall subscribe to `replica.subscribe` and `session.subscribe` of that replica and shall re-render when either fires. It shall read the view once per change and shall return a referentially stable object until the next change.
4. `useLimbo` shall throw a clear error when it is used outside `LimboShell`.
5. When a component unmounts, it shall remove every subscription it added, including `onCross`.
6. `describeConflicts(state)` shall be called with `replica.state()` and shall return the descriptors for that replica. If its length differs from `view.twins`, the layer shall show `view.twins` as the count, shall render the descriptors it has, and shall log one development warning. It shall not hide a twin.

## R3 Fog

1. While `view.axis` is `FOGGED` (link `down` or `connecting`), `Fog` shall render the full state: the silver veil overlay, desaturation `filter: saturate(.25) contrast(.9)` on the replica content, and the label "Offline" with an icon.
2. While `view.axis` is `DEVELOPING` with `unacked > 0` or `behind > 0`, `Fog` shall render the haze state with the label `Syncing n…`, where `n = unacked + behind` from the view.
3. While the link is up and `unacked = 0` and `behind = 0`, `Fog` shall render nothing.
4. The veil shall be an overlay only. It shall never be drawn over text, never carry text colour, and shall not intercept pointer or keyboard input.
5. Fog labels shall use `--fog-ink`. The veil shall use `--before`.
6. While the link is `connecting`, the label shall still read "Offline" (the full fog), because the view maps `connecting` to `FOGGED`.
7. Where the buffer is non-empty but `unacked = 0` and `behind = 0`, `Fog` shall render nothing; the chip (R8) shall still say `Syncing…`.

## R4 Wisps

1. While `view.unacked > 0`, `Wisps` shall render one wisp per queued op up to a visual cap of 12, and shall render the exact counter `unacked` as digits.
2. Where `unacked > 12`, `Wisps` shall render 12 wisps and the digits shall still show the full count.
3. While `view.unacked = 0`, `Wisps` shall render no wisp and no counter.
4. The counter shall use tabular numerals and the data face, and shall stay visible when motion is reduced.
5. `Wisps` shall carry the plate-number caption in small caps, for example `PLATE 7 · 3 WAITING`, where the plate number is a prop from the app and the count is `unacked`.

## R5 Crossing wisps

1. When a crossing event delivers `k > 0` ops to replica `id`, the layer shall play `k` crossing wisps toward that replica, one per op newly applied.
2. When `k = 0`, the layer shall play no crossing wisp.
3. Where ops are re-sent and the replica ignores them as duplicates, no crossing event shall fire, so no wisp shall play. The layer shall add no deduplication of its own.
4. Where `k > 12`, the layer shall play at most 12 crossing wisps. The Inspector and the chip carry the exact count.
5. A crossing wisp's presence shall not be read as a state. The queued wisps (R4) are the only wisps tied to a count.

## R6 Twin

1. `Twin` shall be a generic shell. The app shall pass the at-rest content, the ghost content, the caption lines, the rule line and the action buttons. The layer shall not know item, claim or form fields.
2. While a conflict descriptor is present for a target, `Twin` shall draw the ghost on the same row as the at-rest content: offset 6 px right and down, in `--twin` at 70% opacity, with a dashed outline and the label "TWIN". It shall not add a second list row.
3. The caption, the rule line and the buttons shall render at 100% opacity. The ghost content shall be `aria-hidden`, because it is decorative at 70% opacity.
4. `Twin` shall show the rule that decided the conflict (the descriptor's `rule`, one of the six `Merge` names).
5. When the descriptor disappears (resolved or superseded), `Twin` shall stop rendering the ghost. With motion on, the ghost shall slide into its sibling first (R14). It shall not remain.
6. While a `Twin` is focused, `Enter` shall activate its first action button.
7. A conflict that is resolved or superseded shall never be shown as a twin.

## R7 FixedStamp

1. When `view.fixed` is true, `FixedStamp` shall render the oxblood (`--after`) stamp with the word "FIXED" and an icon.
2. When `view.fixed` is false, `FixedStamp` shall render nothing. In particular, while either axis leaves `LIVE` or `CLEAR`, the stamp shall be gone.
3. `FixedStamp` shall play its entrance when `view.fixedCount` increases and not otherwise. It shall not re-play on a re-render with the same `fixedCount`.
4. The layer shall not set or clear FIXED with a timer. After the 2 s entrance the stamp settles to a small mark by a CSS animation and stays visible while `view.fixed` is true.

## R8 StatusChip

1. `StatusChip` shall always render. It shall show `view.chip` verbatim: `Live`, `Offline — 3 waiting`, `Syncing 2…`, `Live · 1 conflict`, `Syncing 2… · 1 conflict`.
2. `StatusChip` shall add an icon for each sync axis and shall mark a conflict with a second icon and word, so colour never carries a state alone.
3. While `replica.stalledOwn() > 0`, `StatusChip` shall add the line "waiting for an earlier edit that was not saved".
4. `StatusChip` shall use the colour of the axis: `--live`, `--before`/`--fog-ink`, `--developing`; and `--twin` for the conflict part.

## R9 Inspector

1. `Inspector` shall be a drawer opened on demand, with a visible close button and a focus trap while open. Closing it shall return focus to the control that opened it.
2. The Link section shall show the link state (`up`, `down` or `connecting`) and the peer id (`session.peerId()`, or "none yet").
3. The Queued ops section shall list every queued op, one row each, with: op name, target, declared merge, declared intent, stamp as `l·r·n`, and deps. The merge and the intent shall come from the op defs by op name.
4. The Recent exchanges section shall list the last 3 completed exchanges, newest first. Each lists every op that crossed in or out, with the same columns and a direction (`in` where the crossing side is this replica, `out` otherwise).
5. The Conflicts section shall list each conflict descriptor with the rule that decided it. A conflict that has resolved shall stay listed, marked "resolved", until the next exchange begins (the next crossing event). It shall then be removed. This list is presentation state (see Glossary).
6. The Replica section shall show the replica id, the `vv` and the op-log size (`replica.log().length`).
7. The Inspector shall use the data face at 14 px with tabular numerals.
8. When a section has no entries, it shall say so in words ("No queued ops.").
9. The Inspector's queued rows shall equal `view.unacked` in number, because both come from the same predicate (R21.1). A test shall assert it.
10. Where an op name has no def, the merge column shall show `unknown`, as the exchange log does.

## R10 ReplicaPair and LinkCord

1. `ReplicaPair` shall render the two replicas of a `Pair` as mounted cards (deckled inner frame). From 1024 px up the cards sit side by side. From 640 px to 1023 px they stack.
2. Each card shall show a studio imprint at its foot in the display italic, for example "REPLICA A — SARI", from props.
3. `LinkCord` shall draw a line between the cards with a lever. The lever shall read "Cut link" while the link is up and "Restore link" while it is down. It shall call `pair.cut()` and `pair.restore()` and nothing else.
4. `LinkCord` shall show the caption in small caps: "SIMULATED LINK — DevTools offline does not cut it; use the lever".
5. The lever's label and the cord's drawn state (intact or severed) shall follow `view('a').link`; the cord shall not keep its own state.
6. `ReplicaPair` shall render a **Reset demo** button that calls an app-supplied `onReset`. The layer shall not delete databases itself.
7. Each card shall contain its own `Fog`, `Wisps`, `StatusChip`, `FixedStamp` and live region, bound to that replica's view.
8. While the link is cut, both cards shall show full fog (the link is shared). The layer shall not special-case which side was edited.

## R11 Single-replica layout

1. Below 640 px, `LimboShell` consumers using `ReplicaPair` shall render the single-replica layout by default: replica `a` only, with the peer running headless. The query `?replicas=1` or `?replicas=2` shall override the width.
2. The single layout shall show a bottom bar with three controls: Add, Inspector, and "Try two replicas". Add calls an app-supplied `onAdd`. "Try two replicas" switches to the pair layout.
3. In the single layout the link lever shall be a button in the Inspector's Link section ("Cut link" / "Restore link") and shall also respond to `L`.
4. The single layout shall bind its fog, wisps, chip, FIXED stamp and live region to replica `a`'s view in the same way as the pair layout.
5. The bottom bar shall not cover the last row; the content area shall leave room for it.

## R12 ShuffleTest

1. `ShuffleTest` shall take the ops currently on screen, the number of orderings `N` (default 1,000) and a runner. The ops are the applied ops of both replicas, de-duplicated by op id, seed ops included.
2. When the user starts it, the runner shall replay those ops in `N` random causal delivery orders, with duplicates, through the merge-kit `causalBuffer` and the app's `materialize`, inside a Web Worker. The app supplies the worker factory; the layer supplies the replay function the worker calls.
3. The component shall print the count the runner reports it actually ran: `1,000 / 1,000 orderings → same state`. It shall not print `N` unless the runner ran `N`.
4. Where the app supplies a golden expected outcome (a canonical state string) for the seed script, and the replayed ops equal the seed ops, the component shall also print "matches the specified result ✓". Where the ops differ from the seed (the user has edited), it shall print no golden claim.
5. When `k` of `N` orderings end in a different state from the first, the component shall print `k of N disagree` and the shrunk trace (R12.6).
6. The shrunk trace shall be the output of `explainTrace` on the smallest op subset the runner finds that still disagrees, found by removing ops while keeping the set causally closed, with at most 200 attempts.
7. The caption shall say that the test replays the ops on screen, not a stored script: "Replays the N ops on screen in random causal orders."
8. While the worker runs, the component shall show "Running…" with a cancel control. A worker error shall be shown as an error line, not as a pass.
9. Where no `Worker` exists (test environment), the component shall accept an injected runner that runs the same replay function inline.
10. The component shall use "measured, property-tested" wording, and never "proven" or "guaranteed".

## R13 Look and tokens

1. `skeleton/src/limbo/tokens.css` shall define these tokens exactly:

```css
:root {
  --bg:#F2EADB; --card:#E8DDC9; --ink:#2A2019; --muted:#6B5B4B; --rule:#CDBFA8;
  --live:#2F6B4F; --before:#8F989C; --fog-ink:#4E5A60; --developing:#80560F; --twin:#2F5D86; --after:#8A2E22;
  --font-display:"Old Standard TT","Libre Caslon Text",Georgia,serif;
  --font-body:"Atkinson Hyperlegible Next","Atkinson Hyperlegible",system-ui,sans-serif;
  --font-data:"DM Mono",ui-monospace,monospace;
}
```

2. Fonts shall be self-hosted through Fontsource packages (OFL). No stylesheet or script shall load a font from a CDN. A test shall scan `skeleton/src/limbo` for `https://` and `fonts.googleapis` and shall find none.
3. The type scale shall be: rows 18 px / 1.35, buttons 17 px, imprint 22 px display italic, screen title 32 px display, inspector 14 px data face.
4. Every count and amount shall use tabular numerals (`font-variant-numeric: tabular-nums`).
5. `--before` shall be used for overlays and borders only, never as text colour.
6. The layer shall not import CSS in a way that needs a bundler inside the unit tests; tests shall run with CSS imports stubbed.

## R14 Motion

1. Fog shall drain in over 600 ms ease-out when the link goes down, and lift over 900 ms ease-in-out when LIVE is reached.
2. Crossing wisps shall cross in 400 to 700 ms, staggered, one per op newly applied.
3. A twin shall enter with the 6 px offset slide and shall resolve by sliding into its sibling.
4. FIXED shall scale in over 250 ms and settle to a small mark after 2 s.
5. Every animation shall start from a state change in the view, a crossing event or a conflict descriptor change, and from nothing else.
6. Animation classes shall be added by one place per component, so the reduced-motion rule (R15) can remove them.

## R15 Reduced motion

1. Where `prefers-reduced-motion: reduce` matches, no component shall add an animation or transition class, and no inline animation style shall be set.
2. With reduced motion, fog shall be a static desaturation plus its label, wisps shall be the counter alone, and a twin shall appear and disappear without the slide. Every label and every number shall stay.
3. `LimboShell` shall read the preference with `matchMedia`, shall re-read it on change, and shall expose it on its root as `data-motion="reduced"` or `data-motion="full"`.
4. The stylesheet shall also carry a `@media (prefers-reduced-motion: reduce)` rule that sets animation and transition to none.

## R16 Keyboard

1. `L` shall cut the link while it is up and restore it while it is down (pair view and single layout).
2. `I` shall open the Inspector, and shall close it when it is open.
3. Arrow Up and Arrow Down shall move focus between the elements marked `data-limbo-row` inside the shell.
4. `Enter` on a focused twin shall activate its first action (R6.6).
5. `Space` (tick) and `Delete` (delete) belong to the app's rows. The app shall bind them to its own ops. The layer shall document the `data-limbo-row` convention and shall not implement them.
6. Shortcuts shall not fire while focus is in a text input, textarea, select or contenteditable element, or when a modifier key (Ctrl, Meta, Alt) is held.

## R17 Live regions

1. Each replica card shall have exactly one `aria-live="polite"` region. The single layout shall have one.
2. When the link goes down, the region shall announce "Link cut. Edits will wait on this device."
3. When the link comes back (`connecting` or `up` after `down`), the region shall announce "Link restored. Syncing…"
4. When LIVE is reached after an exchange of `k` edits, the region shall announce `k edits synced.` (`1 edit synced.` for 1) and, where `view.twins > 0`, shall add `n conflict(s) need you.` `k` is the crossing count of the exchange just completed, read from `pair.exchanges().last`.
5. The region shall announce only on a change. It shall not repeat an announcement on a re-render.
6. The announcement text shall be formed only from the view and the exchange log.

## R18 Accessibility and legibility

1. Every text colour pair used by the layer shall have a contrast ratio of at least 4.5:1 against its background. A test shall compute the ratios from `tokens.css`.
2. Text shall never be drawn in `--before`, or in a 70% opacity ghost. Ghost content is decorative.
3. Every interactive control (lever, buttons, bottom bar, drawer close, twin buttons) shall have a hit area of at least 44 px by 44 px.
4. Colour shall never carry a state alone: each of Fog, Wisps, Twin, FIXED and the chip shall also have a word and an icon.
5. Icons shall be inline SVG with `aria-hidden` and a visible or accessible text label beside them.
6. The Inspector shall be reachable and operable by keyboard alone.

## R19 Stack and test harness

1. The skeleton package shall list `react` and `react-dom` (19.x) as peer dependencies, and `@types/react`, `@types/react-dom`, `@testing-library/react`, `@testing-library/dom`, `@testing-library/user-event` and `jsdom` (or `happy-dom`) as dev dependencies at the workspace root.
2. Component tests shall be `*.test.tsx` under `skeleton/src/limbo/`, in a new Vitest project `limbo` with a jsdom environment. The existing `unit` and `props` projects shall keep their current `include`, `exclude` and settings.
3. The root `test` script shall run both `unit` and `limbo`, so `pnpm test` covers the component tests.
4. `tsconfig.json` shall include `skeleton/src/**/*.tsx` and set `jsx` to `react-jsx`. `pnpm typecheck` shall cover the new files.
5. Tests shall drive a real `createPair` with a stub app (defs, `materialize`, `twinCount`, `seedOps`) and an in-memory store, and shall not mock sync state, `view`, `exchanges` or `onCross`.
6. Tests shall await `pair.settle()` where they need the exchange to complete, and shall not use real timers to wait for it.
7. The tests shall cover, at least: cut shows fog, the chip reads "Offline — n waiting" and the wisp counter equals `unacked`; restore shows the haze and then LIVE with the fog gone; a conflict renders a twin; resolving it fires FIXED once; reduced motion adds no animation class; the keyboard shortcuts work; the Inspector lists the exact queued ops with merge and stamp.

## R20 Budget and constraints

1. The skeleton shall stay within its provisional budget: at most 30 files, 1,800 TS/TSX lines excluding tests, CSS and tokens, and 15 exports from `skeleton/src/index.ts`. A task that would exceed it shall stop and report. It shall not raise the budget.
2. The layer shall expose its components through its own entry `skeleton/src/limbo/index.ts`, reachable as the package subpath `@limbo/skeleton/limbo`, so `skeleton/src/index.ts` keeps its 15 exports and stays free of React.
3. At the time of writing, `skeleton/src` holds 12 non-test TS files and 1,494 lines, so about 306 lines remain for this layer (R21 additions included). The design carries a per-file line allowance. Where the measured total exceeds 1,800, the task that crosses it shall stop and report, and the owner decides whether to raise the provisional budget.
4. `skeleton/src/sync` shall stay free of React and DOM code (skeleton-sync R17.1). The R21 additions are pure TypeScript.
5. Every task shall end with `pnpm typecheck && pnpm test && pnpm props` green. No test or property shall be weakened, skipped, or have `numRuns` lowered.
6. The service-worker offline shell (skeleton-sync R16) and the cross-device relay stay out of scope.

## R21 Sync-side additions the layer needs

The layer cannot list queued ops, show a crossing's target, or replay the ops on screen from what `skeleton-sync` exposes today. These are the minimum additions, each pure and each covered by a test. They keep the layer free of its own derivation.

1. `status.ts` shall export `unackedOps(log, peerAck, peerId): Op[]` using the same predicate as `countUnacked`, and `countUnacked` shall return its length. `Pair` shall expose `queued(id): Op[]`.
2. The `Crossing` record shall add `id` and `target`, so the Inspector can show the target of an exchanged op. Existing fields and tests shall stay.
3. `core/simulate.ts` shall export `deliveryOrder` (no behaviour change), so the shuffle replay uses the merge-kit delivery, not a copy of it.
4. No other change to `skeleton/src/sync` or `skeleton/src/core` is in this spec.
