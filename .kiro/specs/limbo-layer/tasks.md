# Tasks: limbo-layer

Each task ends with `pnpm typecheck && pnpm test && pnpm props` green. Tests and properties are never weakened, skipped, or run with a lower `numRuns`. Each task touches one component or two, plus its tests and the minimum glue. Do not run git. After each task that adds TS/TSX under `skeleton/src`, record the measured non-test line count; if the total would pass 1,800, files pass 30, or `index.ts` exports pass 15, stop and report (R20.1).

- [x] 1. Sync-side additions (pure)
  - `sync/status.ts`: export `unackedOps(log, peerAck, peerId)`; `countUnacked` returns its length. `Crossing` gains `id` and `target`; `createExchangeLog.cross` fills them. `sync/pair.ts`: add `queued(id)`. `core/simulate.ts`: export `deliveryOrder` (no behaviour change).
  - Check how the existing budget measure counts files; if a `test/` directory is counted, add the exclusion rule there and note it.
  - Tests (extend `status.test.ts`, `pair.test.ts`): `unackedOps(...).length === countUnacked(...)` over the existing table; seed and peer-authored ops are skipped; `pair.queued(id).length === pair.view(id).unacked` while cut and after restore; crossing records carry `id` and `target`; `deliveryOrder` is exported and `simulate` output is unchanged for a fixed seed.
  - _Requirements: R21, R20.4, R1.1_

- [x] 2. Tooling for React component tests
  - Install `react`, `react-dom` (19) as skeleton peer dependencies; `@types/react`, `@types/react-dom`, `@testing-library/react`, `@testing-library/dom`, `@testing-library/user-event`, `jsdom` as root dev dependencies. Add `skeleton/src/**/*.tsx` to `tsconfig.json` and `jsx: react-jsx`. Add the Vitest project `limbo` (`skeleton/src/**/*.test.tsx`, jsdom, setup file) and change the `test` script to `vitest run --project unit --project limbo`. Leave `unit` and `props` untouched.
  - `skeleton/src/limbo/test/setup.ts` (cleanup, `matchMedia` stub with a settable `reduce` flag, CSS stub) and `test/app.ts` (the stub app of design §8 and a `renderApp(pair)` helper).
  - Test (`test/harness.test.tsx`): a trivial component renders under jsdom; `createPair` over the stub app builds; one edit on `a` shows in `view('a').unacked` while cut.
  - _Requirements: R19.1 to R19.6_

- [x] 3. Tokens, fonts and contrast
  - `skeleton/src/limbo/tokens.css`: the exact `:root` block, Fontsource imports (confirm package names, fall back per design §6), type scale, tabular numerals, base card and chip styles. Install the four Fontsource packages.
  - Tests (`tokens.test.ts`, in `unit`): the `:root` block equals the R13.1 block; every text token pair in design §6 is at least 4.5:1 against `--bg` and `--card`; `--before` is not used as a `color:` value; no `https://` or `fonts.googleapis` in `skeleton/src/limbo`.
  - _Requirements: R13, R18.1, R18.2_

- [x] 4. LimboShell, `useLimbo`, motion flag, live region
  - `skeleton/src/limbo/shell.tsx`: `LimboShell`, `useLimbo`, the per-replica store (view, queued, exchanges, conflicts, crossing), `data-motion` from `matchMedia`, the live-region message reducer.
  - Tests (`shell.test.tsx`): throws outside the shell; one `view` read per change and a stable snapshot between changes; unmount removes the replica, session and `onCross` subscriptions; `data-motion` follows the media query and its change; a descriptor count that differs from `view.twins` still shows `view.twins` and warns once; live region says "Link cut. Edits will wait on this device." then "Link restored. Syncing…" then "n edits synced." once each and not again on re-render.
  - _Requirements: R1, R2, R15.3, R17_

- [x] 5. Fog and StatusChip
  - `skeleton/src/limbo/marks.tsx`: `Fog` (full, haze, none), `StatusChip` (icon per axis, conflict mark, stalled line).
  - Tests (`fog.test.tsx`, `chip.test.tsx`): cut → full fog with label "Offline" and the content wrapper desaturated; `connecting` also full; restore before settle → haze `Syncing n…` with `n = unacked + behind`; after settle → none; buffered-only → no fog and chip `Syncing…`; the veil has `pointer-events: none` and `aria-hidden`; all five chip strings exactly; `stalledOwn > 0` adds "waiting for an earlier edit that was not saved"; every state has a word and an icon.
  - _Requirements: R3, R8, R18.4_

- [x] 6. Wisps and crossing wisps
  - `marks.tsx`: `Wisps` with cap 12, exact counter and plate caption; crossing wisps from `crossing.seq`/`k`.
  - Tests (`wisps.test.tsx`): cut and add 3 → 3 wisps and counter `3` equal to `view.unacked`; 14 edits → 12 wisps and `14`; `unacked = 0` → nothing; restore and settle → `k` crossing wisps equal to the exchange crossing count; a no-op resend produces none; `k > 12` caps at 12; reduced motion renders the counter and no crossing wisps.
  - _Requirements: R4, R5, R15.2_

- [x] 7. Twin
  - `skeleton/src/limbo/twin.tsx`: generic `Twin` shell (row, ghost layer, TWIN label, caption, rule line, actions, Enter on first action, leaving state).
  - Tests (`twin.test.tsx`, stub app resurrect conflict and claim-one loser): after a real conflict the twin renders on the same row (no second `[data-limbo-row]`); ghost is `aria-hidden` and offset 6 px; caption and buttons are not in the faded layer; rule line names the merge; `Enter` triggers the first button; after resolve the twin is gone and a resolved or superseded conflict is never shown; with reduced motion no leaving class.
  - _Requirements: R6, R15.2, R16.4_

- [x] 8. FixedStamp
  - `marks.tsx`: `FixedStamp` bound to `view.fixed` and `fixedCount`.
  - Tests (`fixed.test.tsx`): not shown at start; shown once after cut → edit → restore → settle; hidden when the link is cut again or a conflict returns; resolving a conflict fires it once and a re-render does not replay the entrance; no JS timer sets or clears it (fake timers advance 5 s and the state is unchanged).
  - _Requirements: R7, R14.4_

- [x] 9. Inspector
  - `skeleton/src/limbo/inspector.tsx`: drawer with Link, Queued ops, Recent exchanges, Conflicts, Replica; focus trap and return; empty-section words.
  - Tests (`inspector.test.tsx`): opens and closes with the button and `Escape`, focus returns; Link shows state and peer id; queued rows equal `view.unacked` and show op name, target, declared merge, declared intent, stamp `l·r·n` and deps for each; exchanges newest first, last 3 only, with in/out and the same columns; a resolved conflict stays until the next crossing then goes; Replica shows id, `vv` and log size; an op with no def shows `unknown`.
  - _Requirements: R9, R18.6_

- [x] 10. ReplicaPair, LinkCord, Reset demo
  - `skeleton/src/limbo/pair-view.tsx`: two cards with imprint and plate caption, `LinkCord` with lever and caption, **Reset demo** button, per-card live region.
  - Tests (`pair-view.test.tsx`): lever reads "Cut link"/"Restore link" from `view('a').link` and calls `pair.cut()`/`pair.restore()`; both cards fogged while cut; caption text exact; **Reset demo** calls `onReset` and nothing else; each card has exactly one `aria-live="polite"`; stylesheet text contains the 1024 px and 640 px breakpoints; lever and buttons have a 44 px min size in CSS.
  - _Requirements: R10, R17.1, R18.3_

- [x] 11. Single-replica layout and bottom bar
  - `pair-view.tsx`: mode from `matchMedia` and `?replicas=1|2` (injectable `search`), replica `a` card only, bottom bar (Add, Inspector, "Try two replicas"), lever in the Inspector Link section.
  - Tests (`single.test.tsx`): narrow media → single; `?replicas=2` overrides narrow; `?replicas=1` overrides wide; the bar has the three controls, Add calls `onAdd`, "Try two replicas" switches to the pair layout; fog, chip and wisps follow replica `a` while the peer is headless; Inspector lever cuts and restores.
  - _Requirements: R11_

- [ ] 12. Keyboard
  - `shell.tsx`: root `keydown` for `L`, `I`, ArrowUp/ArrowDown over `[data-limbo-row]`; suppression in form fields and with modifiers. Document the `data-limbo-row` convention for Space and Delete in a comment block.
  - Tests (`keys.test.tsx`): `L` cuts then restores in the pair and in the single layout; `I` opens and closes the drawer; arrows move focus across rows; typing `l` or `i` in an input does nothing; Ctrl+L does nothing; a stub row bound by the test to Space and Delete works with the convention.
  - _Requirements: R16_

- [ ] 13. Shuffle replay and ShuffleTest
  - `skeleton/src/limbo/shuffle.ts`: `runShuffle` using `deliveryOrder`, `causalBuffer`, `canonical`, a bounded shrinker and `explainTrace`. `skeleton/src/limbo/shuffle-test.tsx`: `ShuffleTest` with the injected-runner interface and `groupThousands`. Add `apps/basecamp/src/shuffle.worker.ts` only if BASECAMP already has a Vite entry; otherwise leave the worker wiring for the app spec.
  - Tests (`shuffle.test.ts`, `shuffle-test.test.tsx`): 1,000 orderings of a converging stub op set print `1,000 / 1,000 orderings → same state` using the count the runner returned (a runner that returns 640 prints 640); golden line appears only when op ids equal the golden ids and the state matches, and is absent after an edit; a deliberately non-commutative stub `materialize` (read-modify-write) yields `k of N disagree` with `k > 0` and a trace that `explainTrace` produced; the shrunk set is no larger than the input and still disagrees; the caption says it replays the ops on screen; "Running…" and cancel show while pending; a runner error shows an error line and no pass; text contains no "proven" or "guaranteed".
  - _Requirements: R12_

- [ ] 14. Motion and reduced-motion sweep
  - Review each component so classes come from one place and depend on `data-motion`. Fill in the keyframes and durations in `tokens.css`.
  - Tests (`motion.test.tsx`): with `full`, the drain-in class appears on cut, the lift class on LIVE, crossing wisps carry `--i` stagger values, the twin carries its enter class, FIXED carries its scale-in class; with `reduce`, none of these classes or inline animation styles exist for the same scenario while every label and number is still present; `tokens.css` contains the `prefers-reduced-motion: reduce` rule and the durations 600 ms, 900 ms, 250 ms, 2 s, 400 to 700 ms.
  - _Requirements: R14, R15_

- [ ] 15. Entry, budget measure, evidence
  - `skeleton/src/limbo/index.ts`: export `LimboShell`, `useLimbo`, `Fog`, `Wisps`, `Twin`, `FixedStamp`, `StatusChip`, `Inspector`, `ReplicaPair`, `ShuffleTest`, `runShuffle` and types. Add the `./limbo` subpath to `skeleton/package.json` `exports`, plus `./limbo/tokens.css`.
  - Tests (`limbo/index.test.ts`, `unit`): the entry exports exactly those names; `skeleton/src/index.ts` still has 15 value exports and imports no React; no file in `skeleton/src` imports `yjs` except `store.ts`.
  - Measure file count, non-test TS/TSX lines and exports. Write the measured numbers to `evidence/skeleton-budget.json` only if the project already keeps budget evidence; otherwise report them in the task result. If the total is over budget, stop and report; do not raise it.
  - _Requirements: R20, R1.4_
