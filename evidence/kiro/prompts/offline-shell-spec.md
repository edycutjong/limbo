Create a Kiro **feature spec** named `offline-shell` (requirements-first, EARS acceptance criteria) under `.kiro/specs/offline-shell/`:
`requirements.md`, `design.md`, `tasks.md`. Write only those three files. Do not implement anything yet. Do not run git.
Read `.kiro/steering/*.md` first, then `.kiro/specs/skeleton-sync/` (task 10, "Offline shell", was deferred to this spec; requirement R16),
`.kiro/specs/basecamp/`, `.kiro/specs/aftershock/`, `apps/basecamp/` and `apps/aftershock/` (both are built and deployed), `playwright.config.ts`, `e2e/`.

## Goal
Both apps are static Vite SPAs deployed to Vercel (`https://basecamp.limbo.edycu.dev/`, `https://aftershock.limbo.edycu.dev/`). They must
**open again when the user reloads while offline** (airplane mode), with the same replica state and the same wisp ("N waiting") count,
because the ops live in IndexedDB. Add an offline shell: a service worker that precaches the built shell (HTML, JS, CSS, fonts) and serves it
cache-first, registered by each app **in production builds only**. Constraints:
- Nothing in `skeleton/` changes (the zero-skeleton-change goal). The worker lives in each app (or in one shared tiny file each app imports
  by relative path, only if that avoids duplication without touching `skeleton/`; decide in design.md and state the reason).
- Prefer `vite-plugin-pwa` (devDependency, per app) with `injectManifest` or `generateSW`; if it fails to work with Vite 7, write a
  hand-written cache-first worker that precaches the file list of `dist/` at build time. Record which one and why.
- `base: './'` stays; the worker must work at `/` on a custom domain and on a `*.vercel.app` URL. No server code, no polling.
- A new worker version must not strand a user on a stale shell: skipWaiting + clientsClaim with a visible, quiet "updated, reload" is NOT
  required; just make sure the new worker takes over on the next load and old caches are deleted.
- `window.limbo` stays dev/test only; production builds must not expose it (a test asserts it).
- A web app manifest (name, short_name, `display: standalone`, theme colour `#F2EADB`, an icon) so the apps are installable; use a simple
  generated SVG/PNG icon created in the app's `public/` folder. No third-party trademarks.

## E2E (Playwright, all in `e2e/`; keep every existing test working)
1. `e2e/offline-shell.spec.ts`, both apps, against `vite preview` of the **production build** (service workers do not run in dev): load,
   wait for the worker to be active, make edits (BASECAMP: tick the tent; AFTERSHOCK: report a sector), `context.setOffline(true)`, reload,
   assert the app opens and shows the same state and the same wisp count. Add `webServer` entries and projects for the preview builds on
   free ports (5177 BASECAMP, 5178 AFTERSHOCK), built by `pnpm --filter <app> build` first.
2. `e2e/live.spec.ts`, **runs only when `LIMBO_LIVE_BASECAMP` / `LIMBO_LIVE_AFTERSHOCK` are set** (a deployed URL) and is skipped
   otherwise, so `pnpm e2e` stays offline-capable. For each app it runs the pair-view judge flow of that app **using only on-screen text and roles**
   (no `window.limbo`, which does not exist in production): cut the link, play the scripted scene, restore, tap the resolves, assert both cards
   show the same list/grid text, "0 twins", the FIXED stamp, and (BASECAMP) exactly one stove claimant, (AFTERSHOCK) C3 UNSAFE + "5 reported".
   Then, still on the live URL, edit while the in-page link is cut, `setOffline(true)`, **reload**, and assert the same state and wisp count.
   It writes a JSON record (date, URL, test names, pass count) to `evidence/live/` when `LIMBO_LIVE_RECORD=1`.
   Make base URLs configurable via those env variables only; no URL hard-coded in the specs.

## Properties and gates
No op changes, so no new property. `pnpm typecheck && pnpm test && pnpm props` stay green; `pnpm e2e` (default, no live env) stays green.
Each task ends with the green check and keeps tasks small, numbered, with requirement ids; put the e2e tasks last. The last task states the
measured counts and lists every file outside the two apps that changed (expected: `playwright.config.ts`, `e2e/*`, `pnpm-lock.yaml`,
`package.json`).
