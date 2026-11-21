Create a Kiro **feature spec** named `ui-polish` (requirements-first, EARS acceptance criteria) under `.kiro/specs/ui-polish/`:
`requirements.md`, `design.md`, `tasks.md`. Write only those three files. Do not implement anything yet. Do not run git.
Read `.kiro/steering/*.md`, `.kiro/specs/limbo-layer/`, `.kiro/specs/basecamp/`, `.kiro/specs/aftershock/`, `skeleton/src/limbo/` (`tokens.css`,
`twin.tsx`, `marks.tsx`, `pair-view.tsx`, `shell.tsx`), `apps/basecamp/` (`app.css` is 17 lines, `src/main.tsx`, `src/views/`) and `apps/aftershock/`
(`app.css` is the reference: it imports the skeleton tokens and is further along).

## Why
Both apps are deployed (`https://basecamp.limbo.edycu.dev/`, `https://aftershock.limbo.edycu.dev/`) and work, but a review of the live pages found that the
judged surface looks unfinished: **Design** (is it a complete product, not a proof of concept) is 20% of the score and the first two minutes of a judge
are spent on these two screens. Fix the following, each as its own small task with a test or a measurable check. The fixes are visual and layout work: no op,
merge rule, property or e2e assertion changes meaning. Never weaken a test, property, hook or the vacuity guard.

## Defects to fix (found on the live pages)
1. **BASECAMP renders with browser-default controls.** `apps/basecamp/src/main.tsx` never imports `skeleton/src/limbo/tokens.css` (AFTERSHOCK does), so
   fonts, colours and state tokens are missing. Import the tokens and fonts the same way, and write the BASECAMP layout in `apps/basecamp/app.css` using only the
   tokens: item row as a grid (drag handle · tick box · name · claim chip · overflow button) with a 44 px minimum touch target, a drawn tick box with a
   visible checked state and a non-colour cue, buttons and inputs styled consistently (rest, hover, press, focus-visible, disabled), the expenses as a
   clean card list with no bullets (label, amount in tabular numerals, payer, member shares in a tidy row, Remove as a quiet text button).
2. **The twin ghost overlaps the real row** after "Restore link" (the central demo moment). In `skeleton/src/limbo/twin.tsx` the ghost is
   `position: absolute; inset: 0` over the whole twin block, so its text prints over the row, over the caption and over the next row, and the "Decided by" block
   spills out of the dashed box. Keep the signature (a cyanotype-blue dashed offset ghost of the at-rest content) but make it sized to the at-rest content only:
   the caption, the rule line and the actions sit below it in normal flow, nothing overlaps another row, and the block reserves its own height. This is a
   **bugfix with an Unchanged clause**: the Twin props, the roles and accessible names, the enter/leave classes and every existing twin test stay as they
   are. A change in `skeleton/` is allowed here and only here (and item 3); record each skeleton file you touch and its line delta in a section `## Skeleton changes`
   in `design.md` and re-measure the skeleton budget with the command in `evidence/aftershock/budget-baseline.md`.
3. **The wisp counter runs into the plate label** ("●●2PLATE 1 · 2 WAITING"). In the layer's plate/wisps markup give the dots, the count and the plate label
   their own elements with a gap, and show the count as "2 waiting" text next to the dots. Keep the existing `.wisp-count` and `.limbo-plate` hooks the tests use.
4. **Fog is barely visible.** While a replica is partitioned or holds unsynced ops, the fog is a flat tint. Make it visible without hurting legibility: a soft
   gradient veil with a subtle CSS-only grain (no image files), under the existing `data-fog` states, still bound only to the real sync state, and still disabled
   under `prefers-reduced-motion` (static veil, no animation). The status chip text stays the non-colour cue.
5. **Phones (below 640 px).** The fixed bottom bar covers the last content and the judge cannot find "Cut link" (it is hidden in the Inspector), so the first
   screen shows no fog, wisps or twins. Make the default on a phone the **stacked two-replica view** (two cards one under the other, the Cut / Restore link
   control between them, the shuffle test and Reset reachable), keep `?replicas=1` for the solo page, and make sure no fixed bar intercepts a tap (add bottom
   padding or make the bar non-fixed). Update the tests that assumed the single view below 640 px, with the reason in the commit.
6. **AFTERSHOCK specifics.** The scripted-edit labels print as "scripted editscripted editscripted edit": render one label per edited field with spacing
   (a small "scripted edit" tag next to each field). A stray "Offline" text under each card body must be removed or turned into a labelled element. The
   "Re-inspection" checkboxes are 13 px: give their label a 44 px minimum hit area. Sector cells (`role="gridcell"`) need a visible hover state (border tint
   and a 1 px lift, under the shared transition tokens) in addition to the existing focus ring; sector cards and the report form must use the same button,
   input and chip classes as item 1.
7. **Focus ring.** The browser-default 1 px focus outline is too thin. Add a shared `:focus-visible` rule in `tokens.css` (3 px outline in the accent token,
   2 px offset) that every interactive element inherits, without changing any element's size.
8. **Shuffle blurb.** The test prints "1,000 / 1,000 orderings → same state". Add one short line under it that says this is the live in-browser run of the ops on
   screen (the full-tier property suite is run in CI). No numbers beyond what the component computes.

## Checks (each task ends with `pnpm typecheck && pnpm test && pnpm props` green; the last tasks also `pnpm e2e`)
- A new Playwright test `e2e/ui-polish.spec.ts` (against the dev servers, like the other specs): on each app at 1280×900 and 390×800, after Cut link →
  Play the scene → Restore link: (a) no two sibling rows' bounding boxes overlap (twin block vs next row), (b) the computed font family of the body is the
  token display/body face, not the default serif or sans, (c) every interactive element's bounding box is at least 44 × 44 CSS px (item 6 included),
  (d) no horizontal page overflow at 390 px, (e) the Cut link control is visible without opening the Inspector at 390 px, (f) no fixed element intercepts a click on
  the last control on the page. Keep all existing e2e tests green.
- The skeleton budget stays within its limit (≤ 30 files, ≤ 2,400 lines per the baseline file); report the measured numbers.
- The last task records the measured test counts and every file changed outside `apps/` in `design.md`.

Tasks are small and numbered with requirement ids; put the Playwright task last. Use the existing look: light albumen paper, ink text, the display face for
headings, the cyanotype blue only for twins, and the state tokens for live/offline/conflict. No new colours, no new fonts, no images.
