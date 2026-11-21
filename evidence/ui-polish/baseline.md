# ui-polish baseline (task 1, before any change by this spec)

No code, design or test was changed to produce this file.

## Suites (all green)

| Command | Result |
| --- | --- |
| `pnpm typecheck` | exit 0, no errors |
| `pnpm test` | 85 files passed, 697 tests passed (duration 15.34 s) |
| `pnpm props` | 22 files passed, 320 tests passed, 9 skipped (329 total; the 9 skips existed before this spec and were not touched) |

The counts 85 files and 697 tests match the numbers written in design.md section 13.

## Skeleton budget

Scope and command: `evidence/aftershock/budget-baseline.md` (run from the repo root, unchanged).

| Measure | Value |
| --- | --- |
| Files | 21 |
| Non-blank, non-comment lines | 2142 |

Budget (`.kiro/steering/tech.md`): at most 30 files and 2,400 lines. Headroom: 9 files, 258 lines. Same values as the aftershock baseline.

## The eight defects (screenshot-free)

Method: the dev servers (5174, 5176) were not running in this session (`curl` returned no response), and no browser was driven. Each line is therefore confirmed from the source, not from a rendered page. Pixel confirmation is left to the failing checks of the later tasks (`ui-polish.spec.ts`).

1. BASECAMP has no tokens or fonts: `apps/basecamp/src/main.tsx` does not import `tokens.css` (AFTERSHOCK does, line 6), and `apps/basecamp/app.css` contains 0 `var(--` references, so controls render with browser defaults (R1).
2. Twin ghost overprints the row: `skeleton/src/limbo/twin.tsx` line 43 gives the ghost `position: absolute; inset: 0` against the whole `.limbo-twin` block, with no stage wrapper (R2).
3. Wisp count and plate label are not separated: `skeleton/src/limbo/marks.tsx` renders the dots, `<output class="wisp-count">` and the plate inside one `.limbo-wisps` block with no row layout and no "waiting" text (R3).
4. Fog is faint: `tokens.css` line 114 sets `.limbo-fog-veil` to a flat `var(--before)` at `opacity: .25`, no gradient or grain (R4).
5. Fog label is a loose line: `.limbo-fog-label` has no rule in `tokens.css` or in either app, so "Offline" sits under the card body (R4.6, R6.2).
6. Phone shows no Cut link by default: `ReplicaPair` takes `replicas` from the URL only, and neither app passes a `search` with `replicas=2`, so a narrow viewport gets the solo page with the fixed `.limbo-bar` (`tokens.css` line 110) (R5).
7. AFTERSHOCK survey scene and re-inspection label: scripted-edit tags carry no field name beside them, and the `.as-check` label has no 44 px hit area or drawn checkbox (`apps/aftershock/app.css` lines 88-92) (R6.1, R6.3).
8. No shared focus ring, hover or press states: `tokens.css` has no `:focus-visible` rule; only `.as-cell:focus-visible` exists (`apps/aftershock/app.css` line 56), `.as-cell` has no hover rule, and there is no shared button, input or chip style across the two apps (R6.4, R6.5, R7).

## Open decisions (pending owner)

The owner could not be asked in this run. None is resolved here. The text below is verbatim from design.md section 1, each with the design's stated default (the assumption the design already makes).

1. **"Accent token" for the focus ring.** `tokens.css` has no `--accent`, the `:root` block is pinned byte for byte by `tokens.test.ts`, and the cyanotype `--twin` is reserved for twins. The ring uses `--ink` (13.3:1 on `--bg`). AFTERSHOCK's selected-cell `--twin` outline is a selection, not a focus ring, so it moves to a border (section 8).
   - Design default: the ring uses `--ink`; selected cell moves to a border.
2. **Phone default lives in the apps.** `ReplicaPair` already accepts a `search` prop and treats `replicas=2` as "never single". Each app passes `search` with `replicas=2` added when the URL has no `replicas` parameter. This leaves the skeleton default and its single-view tests untouched. The alternative (change the default inside `pair-view.tsx`) would put a fourth skeleton file in scope and rewrite skeleton tests.
   - Design default: the apps pass `search`; the skeleton default is unchanged.
3. **Shared control styles live in `apps/controls.css`**, imported by both apps after `tokens.css`. The brief asks for the same button, input and chip classes in both apps. `skeleton/` may not take them, and an app folder cannot be shared. `apps/offline-shell.ts` already sets the precedent of a shared file directly under `apps/`.
   - Design default: new file `apps/controls.css`.
4. **Playwright projects.** `ui-polish.spec.ts` needs both dev servers, so `playwright.config.ts` gains two projects (`ui-polish-basecamp` on 5174, `ui-polish-aftershock` on 5176) using the existing `app` option.
   - Design default: add the two projects.
