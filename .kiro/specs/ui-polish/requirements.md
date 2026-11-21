# Requirements: ui-polish

Both apps are deployed (`https://basecamp.limbo.edycu.dev/`, `https://aftershock.limbo.edycu.dev/`) and work. A review of the live pages found that the surface a judge sees first looks unfinished: BASECAMP renders with browser-default controls, the twin ghost overprints the real row after "Restore link", the wisp counter runs into the plate label, fog is barely visible, a phone shows no Cut link, and AFTERSHOCK has label and hit-area defects. Design (is it a complete product, not a proof of concept) is 20% of the score. This spec fixes those defects with visual and layout work only.

**No op, merge rule, property, hook or e2e assertion changes meaning.** Tests, properties, hooks and the vacuity guard are never weakened, skipped, or run with a lower `numRuns`. Wording everywhere: convergence is "measured, property-tested", never "proven" or "guaranteed". Every number shown on a page or written in a comment comes from `evidence/` or is computed live.

Look to keep: light albumen paper (`--bg`, `--card`), ink text, the display face for headings, the cyanotype blue (`--twin`) only for twins, and the state tokens (`--live`, `--fog-ink`, `--developing`, `--after`) for live, offline, syncing and error. No new colours, no new fonts, no images. The `:root` block of `tokens.css` is pinned by `tokens.test.ts` and does not change.

Specs this one builds on: `limbo-layer` (Fog, Wisps, Twin, Inspector, ReplicaPair, ShuffleTest, tokens), `basecamp`, `aftershock`.

## Glossary

- **Token**: a custom property of the `:root` block in `skeleton/src/limbo/tokens.css`.
- **Interactive element**: a visible element matching `button, a[href], input, select, textarea, summary, [role="gridcell"], [role="radio"], [role="checkbox"], [role="tab"]`, excluding the `.limbo-sr` live regions and `[hidden]`. Rows that are only focusable containers (`li[data-limbo-row]`, `.limbo-twin`) are not counted.
- **Hit area**: the bounding box of the interactive element, or of its `<label>` when the label is the click target.
- **Twin stage**: the new wrapper inside `Twin` that holds the at-rest content and the ghost, and nothing else.
- **Solo page**: the page with `?replicas=1`.

## R1 BASECAMP uses the tokens and has a finished layout

1. WHEN BASECAMP loads, the app shall import `skeleton/src/limbo/tokens.css` the same way AFTERSHOCK does, so the self-hosted fonts and the tokens are present.
2. WHEN BASECAMP is rendered, the computed `font-family` of `body` shall equal the value of `--font-body`, and of the `h1` the value of `--font-display`.
3. The item row shall be a grid of drag handle, tick box, name, claim chip and overflow button, each interactive cell with a hit area of at least 44 × 44 CSS px.
4. The tick box shall be drawn (not the browser default) with a checked state that has a non-colour cue: a drawn check mark, and the item name struck through.
5. WHILE a button, input, select or textarea is at rest, hovered, pressed, keyboard-focused or disabled, the element shall show a distinct style for that state, using tokens only.
6. The expenses shall render as a list of cards without bullets. Each card shall show the label, the amount in tabular numerals, the payer, and the member shares in one tidy row. "Remove" shall look like a quiet text button and keep its 44 px hit area.
7. The BASECAMP rules of `app.css` shall use `var(--…)` for every colour and font, and no literal colour value.

## R2 The twin ghost stays inside its own row (bugfix)

Current behaviour: the ghost is `position: absolute; inset: 0` over the whole twin block, so its text prints over the row, the caption and the next row, and "Decided by" spills out of the dashed box.

1. WHEN a twin is shown, the ghost shall be sized to the at-rest content only. The caption, the rule line and the actions shall follow in normal flow below it.
2. The twin block shall reserve its own height. WHEN two rows are adjacent, the bounding boxes of the twin block (ghost included) and of the next row shall not overlap.
3. The ghost shall keep the signature: a `--twin` dashed outline, offset by `translate(6px, 6px)` at opacity 0.7, `aria-hidden`, and not interactive.
4. Unchanged: the `Twin` props, the roles and accessible names, the `limbo-twin-enter` and `limbo-twin-leaving` classes, the `data-limbo-row` and `data-leaving` attributes, Enter-key behaviour, and every existing twin test.

## R3 The wisp counter and the plate label are separate

1. The `Wisps` markup shall give the dots, the count text and the plate label each their own element, laid out in a row with a gap and wrapping on narrow widths.
2. WHILE `view.unacked` is greater than 0, the count shall read, in text next to the dots, the number followed by "waiting" (for example "2 waiting").
3. Unchanged: `.wisp-count` still holds only the number, `.limbo-plate` still holds exactly `PLATE <p> · <n> WAITING`, the cap of 12 dots and the crossing wisps.

## R4 Fog is visible and stays legible

1. WHILE `data-fog` is `full` or `haze`, the veil shall be a soft gradient with a subtle grain, built in CSS from tokens only (no image file, no network request).
2. The text of the card under full fog shall keep a contrast ratio of at least 4.5:1 with `--ink` against the veil composited over `--card` and over `--bg`, measured by a unit test.
3. The fog shall remain bound only to the real sync state (`data-fog` as derived by `Fog`). No new state, timer or prop.
4. WHILE `prefers-reduced-motion: reduce`, the veil shall be static: no animation or transition.
5. The status chip text ("Offline", "Syncing …") shall remain the non-colour cue.
6. The `.limbo-fog-label` ("Offline", "Syncing n…") shall render as a small tag in the corner of the fogged card, not as a loose line below the body. Its text is unchanged.

## R5 Phones show the two-replica view by default

1. WHEN the viewport is narrower than 640 px and the URL has no `replicas` parameter, each app shall show the stacked two-replica view: card A, the Cut / Restore link control, card B, then Reset demo.
2. WHERE the URL has `?replicas=1`, the app shall show the solo page. WHERE it has `?replicas=2`, the two-replica view.
3. At 390 px the "Cut link" button shall be visible without opening the Inspector, the shuffle test and Reset demo shall be reachable, and the page shall not scroll horizontally.
4. No fixed or sticky element shall intercept a tap on the last control on the page, in the pair view and in the solo page.
5. The change shall live in the apps and in CSS. `ReplicaPair` keeps its default and its tests.

## R6 AFTERSHOCK specifics

1. The survey scene shall render one tag per edited field, each with spacing and the field name next to it (for example "Note" then "scripted edit"). Each `[data-scripted]` element keeps the text `scripted edit`.
2. The "Offline" fog label shall be restyled per R4.6 so no stray "Offline" text sits under the card body.
3. The "Re-inspection" label shall give a hit area of at least 44 × 44 CSS px, with a drawn checkbox as in R1.4.
4. A `role="gridcell"` shall show a hover state (border tint and a 1 px lift) under the shared transition tokens of R7, in addition to the focus ring.
5. Sector cards and the report form shall use the same button, input and chip classes as BASECAMP (R1.5).

## R7 Shared focus ring and transitions

1. `tokens.css` shall carry one `:focus-visible` rule: `outline: 3px solid var(--ink)`, `outline-offset: 2px`. Every interactive element inherits it, and no per-component `:focus-visible` rule overrides it. (There is no accent token; see design, open decision 1.)
2. Focusing an element shall not change its bounding box.
3. Hover and press transitions shall use one shared duration and easing declared once, and shall be off under `prefers-reduced-motion: reduce`.

## R8 Shuffle blurb

1. WHEN the Shuffle section is on the page, one short line shall sit under the shuffle test: "This is the live in-browser run of the ops on screen. The full-tier property suite runs in CI."
2. The line shall contain no number. The existing count line ("1,000 / 1,000 orderings → same state") is unchanged.

## R9 Checks and budget

1. `e2e/ui-polish.spec.ts` shall run against the dev servers of both apps at 1280×900 and 390×800, after Cut link → Play the scene → Restore link, and assert:
   - (a) no two sibling rows' bounding boxes overlap, and the twin block does not overlap the next row;
   - (b) the `body` font family equals the `--font-body` token value and the `h1` the `--font-display` value;
   - (c) every interactive element has a hit area of at least 44 × 44 CSS px;
   - (d) at 390 px there is no horizontal page overflow;
   - (e) at 390 px "Cut link" is visible with the Inspector closed;
   - (f) a trial click on the last control on the page is not intercepted, in the pair view and in the solo page.
2. Each task shall end with `pnpm typecheck && pnpm test && pnpm props` green. The last task shall also end with `pnpm e2e` green, with every existing e2e test unchanged.
3. The skeleton budget shall stay within 30 files and 2,400 lines, measured with the command of `evidence/aftershock/budget-baseline.md`. The measured numbers shall be reported in `design.md`.
4. Changes under `skeleton/` are limited to `twin.tsx` and `marks.tsx` (R2, R3) and `tokens.css` (R2, R3, R4, R7). Every file touched outside `apps/` and its line delta shall be recorded in `design.md` under "Skeleton changes".
