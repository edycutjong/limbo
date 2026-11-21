Follow-up UI fixes after a review of the deployed apps (`ui-polish` spec, round 2). Fix exactly these, with tests where a unit test can pin it, and keep every existing test, property, hook
and e2e assertion passing (accessible names that tests use must stay the same; add visible text through `aria-label`-preserving changes). Do not run git. Do not run `pnpm e2e` or `props:full` (the orchestrator runs them).
1. Twin blocks look like a rendering fault: the Keep / Delete / OK / Why buttons inside `.limbo-twin-actions` are browser-default buttons about 30 px tall. In `skeleton/src/limbo/tokens.css`
   give `.limbo-twin-actions button` the same look and the 44 px minimum height as the shared control classes (see `apps/controls.css`), and give the whole `.limbo-twin` block a card look:
   padding, a 3 px left border in `--twin`, the card background. Only CSS (and class names) in `skeleton/`; Twin props and roles unchanged.
2. BASECAMP: on the replica whose claim lost, a bare bullet "• Budi's claim lost · rule: claim-one" hangs outside the list (a stray `li` in `apps/basecamp/src/views/ItemRow.tsx` or its caller).
   Render it as a quiet in-row note (no bullet, `list-style: none`, muted text, aligned with the item name column).
3. AFTERSHOCK: both note-twin buttons read "Keep this note" visibly. Keep the accessible names (`Keep this note: <value>`) but make the visible text distinguish them:
   "Keep Sari's note" / "Keep Budi's note" (use the author names the twin already has), and show each note's text next to its button so the judge can compare them.
4. The status "Offline" fog label sits over the grid's top-right corner and covers the F1 cell label in AFTERSHOCK. Place the fog label above the grid (static, in the header row of the card),
   and in BASECAMP hide the second "Offline" text beside the Add field when the status pill already says Offline.
5. At 1280 px the pair columns are about 280 px wide with a large empty gutter. In `skeleton/src/limbo/pair-view.tsx` / `tokens.css` set the desktop pair grid to
   `minmax(340px, 1fr) minmax(120px, 160px) minmax(340px, 1fr)` and add `white-space: nowrap` to the claim pill so "I'll bring it" never breaks in two lines.
6. AFTERSHOCK "scripted edit" tags: use the body face at 12 px (not monospace) and the text "edited offline" instead of "scripted edit" (keep any test hook attribute names such as `data-scripted`).
Finish with `pnpm typecheck && pnpm test && pnpm props` green and report the measured test counts.
