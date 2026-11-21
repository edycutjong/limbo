# Design: ui-polish

Visual and layout work on two deployed apps. No op, reducer, merge, property or e2e assertion changes. The approach is to fix each defect in the smallest place that owns it, and to keep skeleton edits to the three files R9.4 allows.

## 1. Open decisions (assumptions made; reverse any of them before task 1)

1. **"Accent token" for the focus ring.** `tokens.css` has no `--accent`, the `:root` block is pinned byte for byte by `tokens.test.ts`, and the cyanotype `--twin` is reserved for twins. The ring uses `--ink` (13.3:1 on `--bg`). AFTERSHOCK's selected-cell `--twin` outline is a selection, not a focus ring, so it moves to a border (section 8).
2. **Phone default lives in the apps.** `ReplicaPair` already accepts a `search` prop and treats `replicas=2` as "never single". Each app passes `search` with `replicas=2` added when the URL has no `replicas` parameter. This leaves the skeleton default and its single-view tests untouched. The alternative (change the default inside `pair-view.tsx`) would put a fourth skeleton file in scope and rewrite skeleton tests.
3. **Shared control styles live in `apps/controls.css`**, imported by both apps after `tokens.css`. The brief asks for the same button, input and chip classes in both apps. `skeleton/` may not take them, and an app folder cannot be shared. `apps/offline-shell.ts` already sets the precedent of a shared file directly under `apps/`.
4. **Playwright projects.** `ui-polish.spec.ts` needs both dev servers, so `playwright.config.ts` gains two projects (`ui-polish-basecamp` on 5174, `ui-polish-aftershock` on 5176) using the existing `app` option.

## 2. Files

| File | Change | Req |
| --- | --- | --- |
| `skeleton/src/limbo/tokens.css` | focus ring, shared transition tokens as custom properties on `.limbo-root`/`body`, twin stage rules, wisps row rules, fog veil | R2, R3, R4, R7 |
| `skeleton/src/limbo/twin.tsx` | wrap `atRest` and ghost in `.limbo-twin-stage` | R2 |
| `skeleton/src/limbo/marks.tsx` | split `Wisps` markup | R3 |
| `apps/controls.css` (new) | `.ui-btn`, `.ui-btn--quiet`, `.ui-input`, `.ui-check`, `.ui-chip`, `.ui-card`, fog label tag, `.limbo-button` look, solo bar, pair `min-width: 0` | R1, R4, R5, R6, R7 |
| `apps/basecamp/app.css`, `src/main.tsx` | tokens import, layout | R1, R5 |
| `apps/basecamp/src/views/{ItemRow,ExpenseRow,ClaimChip,AddItem,ShuffleSection}.tsx` | class names, `data-ticked`, blurb | R1, R8 |
| `apps/aftershock/app.css`, `src/main.tsx` | controls import, hover, check | R5, R6 |
| `apps/aftershock/src/views/{SectorCard,ReportForm,SectorGrid,ShuffleSection}.tsx` | tags, class names, blurb | R6, R8 |
| `e2e/ui-polish.spec.ts` (new), `playwright.config.ts` | two projects | R9 |
| `evidence/ui-polish/*.md` (new) | baselines and final counts | R9 |

## 3. BASECAMP layout (R1)

`main.tsx` imports `skeleton/src/limbo/tokens.css` before `../app.css`, then `../../controls.css`. `body` gets `background: var(--bg); color: var(--ink); font-family: var(--font-body)` as in AFTERSHOCK; the `h1` carries `limbo-title`.

Item row (`.bc-row`):

```
grid-template-columns: 44px 44px 1fr auto 44px;   /* handle · tick · name · claim · overflow */
align-items: center; min-height: 44px; column-gap: 8px;
```

At 390 px the claim chip drops to a second line under the name (`grid-template-areas`), so the row never scrolls sideways. The `li` gets `data-ticked` from `item.ticked`. The tick box is `appearance: none; width: 44px; height: 44px` with a 24 px drawn square as `::before` and, when checked, a drawn check as `::after`. The non-colour cue is the check shape plus `[data-ticked="true"] .bc-name { text-decoration: line-through }`.

`.bc-twin-row` is `display: block` (it carries `bc-row` and would otherwise be a grid or flex container around the twin).

Expenses: `.bc-expenses` is `list-style: none; padding: 0; display: grid; gap: 12px`. Each `.bc-expense` is a card (`ui-card`): head row with label, amount (`font-variant-numeric: tabular-nums`, `font-family: var(--font-data)`) and payer; `.bc-shares` a wrapping flex row without bullets; Remove is `ui-btn ui-btn--quiet` (text button, underline on hover, still 44 px).

## 4. Shared controls (`apps/controls.css`, R1.5, R6.5, R7.3)

States per class, tokens only:

| State | `.ui-btn` | `.ui-input` |
| --- | --- | --- |
| rest | `--card` fill, `--rule` border, `--ink` text, 6 px radius, `min-height: 44px` | `--bg` fill, `--rule` border |
| hover | border `--ink`, 1 px lift | border `--muted` |
| press | no lift, fill `--bg` | n/a |
| focus-visible | the global ring of section 7 (nothing added here) | same |
| disabled | `color: var(--muted)`, dashed border, `cursor: not-allowed`, no lift | same |

`.limbo-button`, `.limbo-lever` and `.limbo-reset` (skeleton buttons) share the `.ui-btn` rule through a selector list, so the lever, Reset and the shuffle buttons match without a skeleton edit. `.ui-chip` extends `.limbo-chip` for claim chips and need chips. `.ui-check` is a `<label>` with `min-height: 44px; display: flex; gap: 8px` and the same drawn checkbox as BASECAMP, so the label is the 44 px hit area (R6.3).

Transition tokens (R7.3), declared once on `body`: `--ui-dur: 120ms; --ui-ease: ease-out`. They are not colours and not in `:root`, so `tokens.test.ts` is unaffected. Every `transition` in `controls.css` reads them. The existing reduced-motion rule in `tokens.css` already sets `transition: none !important` under `.limbo-root`; `controls.css` repeats the media query for elements outside `.limbo-root`.

## 5. Twin ghost (R2) — bugfix with an Unchanged clause

Cause: `.limbo-twin { position: relative }` plus the inline `position: absolute; inset: 0` on the ghost make the ghost as tall as the whole block (rest, label, caption, rule, actions) and out of flow.

Fix: one wrapper.

```tsx
<div className="limbo-twin-stage">
  <div className="limbo-twin-rest">{p.atRest}</div>
  <div className="limbo-twin-ghost" … /* inline style unchanged */>{p.ghost}</div>
</div>
<span className="limbo-twin-label">TWIN</span>
…
```

CSS:

```css
.limbo-twin { position: relative; display: flow-root; margin-block: 8px; }
.limbo-twin-stage { position: relative; margin: 0 6px 6px 0; }  /* 6px reserves the ghost offset */
.limbo-twin-ghost { overflow: hidden; color: var(--twin); }
.limbo-twin-label { display: block; margin-top: 4px; }
.limbo-twin-actions { display: flex; flex-wrap: wrap; gap: 8px; }
```

The ghost stays `position: absolute; inset: 0`, now relative to the stage, so it has the at-rest size. Its inline `transform`, `outline`, `opacity` and `pointer-events` are not edited, so `twin.test.tsx` (`translate(6px, 6px)`, `0.7`, `aria-hidden`, caption and buttons outside the ghost) passes unchanged. The `onAnimationEnd` hook stays on the ghost. Expected delta: `twin.tsx` +2 lines (the stage open and close tags).

The first task of R2 writes a failing layout test (`twin-layout.test.tsx`, jsdom has no layout, so it checks the DOM contract: ghost and rest share one parent that contains neither caption, rule nor actions) and the e2e check (a) proves the pixels.

## 6. Wisps (R3)

```tsx
<div className="limbo-wisps" data-count={n}>
  {dots}                                              {/* .limbo-wisp-row, unchanged */}
  {n > 0 && <span className="limbo-wisp-summary"><output className="wisp-count">{n}</output><span className="limbo-wisp-word">waiting</span></span>}
  {n > 0 && <span className="limbo-plate">{`PLATE ${p.plate} · ${n} WAITING`}</span>}
  {cross}
</div>
```

CSS: `.limbo-wisps { display: flex; flex-wrap: wrap; align-items: center; column-gap: 12px; row-gap: 4px }`, `.limbo-wisp-summary { display: inline-flex; gap: 4px }`, plate in `--muted`, `font-variant: small-caps; letter-spacing: .06em`. `.wisp-count` text is still only the number; `.limbo-plate` text is byte-identical. The visible "2 waiting" and the plate "2 WAITING" repeat the number; the plate is a fixed contract of existing tests, so it stays. Expected delta: `marks.tsx` +2 lines.

## 7. Fog and focus (R4, R7)

Veil (replaces the flat `background: var(--before); opacity: .25`; drain animation keeps working because it animates `opacity` from 0):

```css
.limbo-fog-veil {
  background:
    repeating-conic-gradient(color-mix(in srgb, var(--ink) 5%, transparent) 0 25%, transparent 0 50%) 0 0 / 3px 3px,
    linear-gradient(180deg,
      color-mix(in srgb, var(--before) 40%, transparent),
      color-mix(in srgb, var(--fog-ink) 16%, transparent) 70%,
      color-mix(in srgb, var(--before) 30%, transparent));
}
[data-fog="haze"] .limbo-fog-veil { opacity: .55; }
```

Every layer is an alpha of a token, so there is no new colour and no file. The worst-case alpha under the text is 0.45 (40% + 5%). A unit test (`fog-veil.test.ts`) reads `tokens.css`, parses the percentages, composites `--before` at that alpha over `--card` and over `--bg`, and requires `--ink` contrast ≥ 4.5:1 (R4.2). If a colour name or alpha in the test cannot be parsed, the test fails. Animation: none added; grain is static, so reduced motion needs no new rule.

`.limbo-fog-label` (R4.6, R6.2): `controls.css` positions it `absolute; top: 8px; right: 8px` inside `.limbo-fog` as a small chip (`--bg` fill, `--fog-ink` text, `--before` border, 12 px). It stays `aria-hidden`; the e2e tests that read its text still find it.

Focus ring (R7.1) at the end of `tokens.css`:

```css
:focus-visible { outline: 3px solid var(--ink); outline-offset: 2px; }
```

Outlines do not affect layout, so size is unchanged (checked in e2e). The per-component rules `.as-cell:focus-visible` and `.as-btn[aria-pressed]` outline are deleted so the shared rule is the only one. The veil has `pointer-events: none`, so it never blocks a focused control.

## 8. Phones (R5)

Each `main.tsx` passes:

```tsx
<ReplicaPair search={withReplicas(location.search)} … />
// withReplicas: URLSearchParams; if no `replicas`, set replicas=2; return `?${params}`
```

The helper is 4 lines, defined once per app in `main.tsx` (not exported from the skeleton; the skeleton export budget of 15 stays). Result: `<640 px` renders `.limbo-pair` (`grid-template-columns: 1fr`): card A, cord with lever and caption, card B, Reset demo. `?replicas=1` still gives the solo page and the bar.

`controls.css`:

```css
.limbo-pair > * { min-width: 0; }                       /* a 1fr track must not grow to its widest child */
.limbo-bar { position: static; margin-top: 16px; }      /* solo bar in flow: no fixed element on the page */
.limbo-single { padding-bottom: 16px; }
pre, .limbo-inspector { overflow-x: auto; max-width: 100%; }
.limbo-cord-caption { text-align: center; text-wrap: balance; }
```

Cut link is the lever inside the cord, so it is visible when the Inspector is closed. Risk: if card A is taller than the 800 px viewport at 390 px, the lever is below the fold. It is still visible and reachable by scrolling, and the e2e check scrolls to it. If the first screen should show it without scrolling, a follow-up can make the cord `position: sticky` at the top; that would conflict with R5.4 and needs an owner decision, so it is not in scope.

Tests: the unit tests do not mock a narrow viewport for the apps (`setup.ts` supports it only for skeleton tests), so no existing app test assumed the single view. `pair-view.test.tsx` and `single.test.tsx` test the skeleton default and stay unchanged. New: `main.test.tsx`-level unit tests for `withReplicas` (no param → `replicas=2`; `replicas=1` kept; `replicas=2` kept; other params kept). Reason to record in the commit message: apps now default to two replicas on phones so a judge sees Cut link, fog, wisps and twins on the first screen.

## 9. AFTERSHOCK (R6)

- `SectorCard`: each scripted field renders `<span class="as-scripted-tag"><span class="as-scripted-field">{Field}</span><span data-scripted={f}>scripted edit</span></span>`. The `[data-scripted]` text stays `scripted edit`, so `survey-scene.test.tsx` (`tags` equal three `scripted edit`) passes. The tags sit in a wrapping flex row with `gap: 8px`.
- Re-inspection: the label becomes `ui-check`; the input is the drawn checkbox of section 4.
- `.as-cell`: `transition: transform var(--ui-dur) var(--ui-ease), border-color var(--ui-dur) var(--ui-ease); `; `:hover` → `border-color: var(--muted); transform: translateY(-1px)`. Selection (`aria-selected="true"`) becomes `border: 2px solid var(--twin)` plus a lighter fill, so it no longer competes with the focus ring. Severity borders (`unsafe`, `damaged`) keep their tokens and still win over hover tint.
- `as-btn`, `as-input`, `as-check` class names are replaced by `ui-btn`, `ui-input`, `ui-check` in `ReportForm.tsx` and `SectorCard.tsx`. Tests that select by `.as-btn` are updated to the new class in the same task, selectors only, no assertion changes.

## 10. Shuffle blurb (R8)

Both `ShuffleSection.tsx` files render the existing `<ShuffleTest>` followed by `<p className="ui-note">This is the live in-browser run of the ops on screen. The full-tier property suite runs in CI.</p>`. The skeleton `ShuffleTest` is not touched (R9.4). The line is static text with no number.

## 11. Playwright (R9.1)

`e2e/ui-polish.spec.ts`, generated per app and per viewport (4 tests plus 2 solo checks). Flow: `goto('/')`, wait for `window.limbo.ready`, click "Cut link", click "Play the lake scene" or "Play the survey scene" (from the `app` option), click "Restore link", wait until the two states are equal (poll as the other specs do).

| Check | Method |
| --- | --- |
| (a) | collect `[data-limbo-row]` and `.limbo-twin` boxes per card (`getBoundingClientRect`); the ghost rect is inside `.limbo-twin`; for every pair of siblings the intersection area is 0 (tolerance 0.5 px); `.limbo-twin-rule` and `.limbo-twin-actions` rects are inside the `.limbo-twin` rect |
| (b) | `getComputedStyle(body).fontFamily` equals `getPropertyValue('--font-body')` of `:root`, `h1` equals `--font-display` (quotes and spaces normalised) |
| (c) | every interactive element (glossary selector, visible, not `.limbo-sr`), its own box or its `<label>` box ≥ 44 × 44 (0.5 px tolerance) |
| (d) | `document.documentElement.scrollWidth <= window.innerWidth` at 390 |
| (e) | at 390 with the Inspector closed, `getByRole('button', { name: 'Cut link' })` has count 1 and is visible (run before cutting) |
| (f) | last visible interactive element in document order: `scrollIntoViewIfNeeded()` then `click({ trial: true })` (Playwright fails the trial if another element receives the pointer); repeated on `/?replicas=1` |
| focus | focus the first button by keyboard: box unchanged, computed `outline-width` is `3px` |

The overlap and size checks run inside one `page.evaluate` that returns offenders (selector, rect), so a failure prints what overlapped. The test does not change any existing e2e file.

## 12. Skeleton changes

Filled in by each task. Format: file, lines before → after (non-blank, non-comment, from the baseline command), reason.

| File | Before → after | Reason |
| --- | --- | --- |
| `skeleton/src/limbo/twin.tsx` | 2142 → 2144 total (+2 lines, the stage open and close tags; 21 files, unchanged); `tokens.css` twin rules changed in the same task | R2 stage wrapper |
| `skeleton/src/limbo/marks.tsx` | (task 7) | R3 wisps markup |
| `skeleton/src/limbo/tokens.css` | CSS, not counted | R2, R3, R4, R7 |
| `skeleton/src/limbo/tokens.css` (task 2) | CSS, not counted; +2 lines at end (`:focus-visible` rule), `:root` untouched | R7.1 |

Budget (limit 30 files, 2,400 lines): baseline recorded in task 1 in `evidence/ui-polish/baseline.md`; final in task 12. The expected delta is about +4 lines.

## 13. Final record (task 12 fills in)

- Test counts before: 85 files, 697 tests (`pnpm test`, measured before this spec). After: (task 12).
- `pnpm props`, `pnpm e2e` results: (task 12).
- Files changed outside `apps/`: (task 12).
