Create a Kiro **feature spec** named `limbo-layer` (requirements-first, EARS acceptance criteria) under `.kiro/specs/limbo-layer/`:
`requirements.md`, `design.md`, `tasks.md`. Write only those three files. Do not implement anything yet. Do not run git.
Read `.kiro/steering/*.md` first, then `.kiro/specs/skeleton-sync/` (the replica, links and `status.ts` this layer renders) and
`skeleton/src/core/`. The visual layer must render **only** state that `skeleton-sync` derives; it computes nothing of its own.

## Goal
React components in `skeleton/src/limbo/` that make a replica's real sync state visible: the fog when this replica is partitioned,
wisps for its queued ops, ghost twins for surfaced conflicts, a FIXED stamp when the replicas agree again, and an inspector that lists
every queued op and the merge rule it declares. Both apps (`apps/basecamp`, later `apps/aftershock`) use these components unchanged;
anything app-specific (rows, forms) stays in the app. The fog is functional, not a skin: every visual maps to a real sync state.

## Bindings (each one is a requirement and a test)
| Visual | Shown when (from `status.ts`) | Never shown when |
|---|---|---|
| `Fog` full | link `down` or `connecting` | link is up |
| `Fog` haze ("Syncing n…", n = unacked + behind) | link up and (`unacked > 0` or `behind > 0`) | both are 0 |
| `Wisps` + exact counter | `unacked > 0`; the digits stay visible above a 12-wisp visual cap | `unacked = 0` |
| crossing wisps | an exchange newly applied k ops (k = crossing count; duplicates/re-sends not counted) | k = 0 |
| `Twin` | a conflict surfaced by the app's materialized state (resurrect, causal-lww concurrent different values, claim-one losers) | resolved or superseded |
| `FixedStamp` | the FIXED event from `status.ts` | either axis leaves LIVE ∧ CLEAR |
| `StatusChip` | always; both axes in words: "Live" · "Offline — 3 waiting" · "Syncing 2…" · "Live · 1 conflict" · "Syncing 2… · 1 conflict"; "waiting for an earlier edit that was not saved" when `stalledOwn > 0` | — |
| `Inspector` drawer | on demand: Link (state, peer) · Queued ops (unacked: op name, target, declared merge, intent, stamp `l·r·n`, deps) · Recent exchanges (last 3 completed, newest first, every op that crossed in or out, same columns) · Conflicts (each twin + the rule that decided it, resolved ones until the next exchange) · Replica (id, vv, op-log size) | — |

## Components
`LimboShell` (provides replica + link + status to children via context; a hook `useLimbo()`), `Fog`, `Wisps`, `Twin` (generic shell:
the app passes the at-rest content, the ghost content, the caption lines, the rule line and the buttons), `FixedStamp`, `StatusChip`,
`Inspector`, `ReplicaPair` + `LinkCord` (two replicas from `createPair`, side by side ≥ 1024 px, stacked 640–1023 px; the cord is a drawn
line with a lever "Cut link" / "Restore link", captioned in small caps "SIMULATED LINK — DevTools offline does not cut it; use the lever";
a **Reset demo** button), `ShuffleTest` (replays the ops currently on screen in N random causal orders inside a Web Worker using the
merge-kit `simulate` delivery, prints the count it actually ran — "1,000 / 1,000 orderings → same state" — and, when the app supplies a
golden expected outcome for the seed script, "matches the specified result ✓"; on failure "k of N disagree" and the shrunk trace; the
caption says it replays the ops on screen). A single-replica layout (mobile default < 640 px, `?replicas=1|2` override) with a bottom
bar (Add, Inspector, "Try two replicas").

## Look (tokens are binding; put them in `skeleton/src/limbo/tokens.css`)
```css
:root {
  --bg:#F2EADB; --card:#E8DDC9; --ink:#2A2019; --muted:#6B5B4B; --rule:#CDBFA8;
  --live:#2F6B4F; --before:#8F989C; --fog-ink:#4E5A60; --developing:#80560F; --twin:#2F5D86; --after:#8A2E22;
  --font-display:"Old Standard TT","Libre Caslon Text",Georgia,serif;
  --font-body:"Atkinson Hyperlegible Next","Atkinson Hyperlegible",system-ui,sans-serif;
  --font-data:"DM Mono",ui-monospace,monospace;
}
```
World: a Victorian spirit photograph. Each replica is a mounted card (deckled inner frame) with a studio imprint at its foot in the
display italic ("REPLICA A — SARI"); plate-number small caps ("PLATE 7 · 3 WAITING"). Fog = silver veil (`--before`, overlay only, never
text; labels use `--fog-ink`) + desaturation `filter: saturate(.25) contrast(.9)`. Twin = the signature element: the ghost silhouette
offset 6 px right/down on the **same row** (never a second list row), in `--twin` at 70% opacity with a dashed outline and a "TWIN" label;
caption and buttons at 100% opacity. FIXED = oxblood `--after` stamp. Fonts are self-hosted via Fontsource packages (OFL) — never a CDN,
because a font CDN is exactly what disappears offline. Type scale: rows 18 px / 1.35, buttons 17 px, imprint 22 px italic display, screen
title 32 px display, inspector 14 px data face; tabular numerals for every count and amount. Touch targets ≥ 44 px.
Motion (all bound to state changes): fog drain-in 600 ms ease-out on link → down; fog lift 900 ms ease-in-out when LIVE; wisps cross
400–700 ms staggered, one per op newly applied; twin enters with the 6 px offset slide and resolves by sliding into its sibling; FIXED
250 ms scale-in then settles to a small mark after 2 s.
Colour never carries a state alone: every state also has a word and an icon.

## Accessibility (requirements, tested)
`prefers-reduced-motion: reduce` → every motion becomes an instant swap with the same label (fog = static desaturation + label, wisps =
the number, twins without the slide). Keyboard: `L` cut/restore (pair view), `I` inspector, arrow keys between rows, `Space` tick, `Enter`
on a focused twin = its first action, `Delete` = Delete. One `aria-live="polite"` region per replica announces state changes ("Link cut.
Edits will wait on this device." · "Link restored. Syncing…" · "3 edits synced. 1 conflict needs you."). Contrast: all text ≥ 4.5:1.

## Stack
React 19 + TypeScript; the skeleton package gets `react`/`react-dom` as peer dependencies. Component tests with Vitest +
`@testing-library/react` in a `jsdom` (or `happy-dom`) environment, added as a separate Vitest project or per-file environment so the
existing `unit` and `props` projects are untouched. Tests drive a real `createPair` (no mocked sync state): cut → fog shown, chip
"Offline — n waiting", wisp counter = unacked; restore → haze, then LIVE and fog gone; a conflict → twin rendered; resolve → FIXED fires
once; reduced motion → no animation classes; keyboard shortcuts work; the inspector lists the exact queued ops with merge and stamp.

Each task must end with `pnpm typecheck && pnpm test && pnpm props` green. Keep tasks small (one component or two + their tests), numbered,
with requirement ids.
