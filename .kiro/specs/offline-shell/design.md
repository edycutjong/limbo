# Design: offline-shell

## Findings from the code (read before this spec)

- Both apps: `base: './'`, `dist/` with `index.html`, one `assets/index-*.js`, one `assets/index-*.css`, `assets/shuffle.worker-*.js` (a module worker, needed by "Run shuffle test"), and self-hosted Fontsource fonts in both `woff2` and `woff`. Nothing is loaded from a CDN (`build.test.ts` already bans `https://fonts`).
- Both `main.tsx` guard debug with `DEBUG = import.meta.env.DEV || MODE === 'test'`. Production drops `window.limbo` and the dev relay. `build.test.ts` scans `dist/` text for the banned strings.
- `playwright.config.ts` runs one worker. Dev servers: spike 5173, BASECAMP 5174, relay 5175, AFTERSHOCK 5176.
- **The in-page pair reconnects at boot.** `createPair` (`skeleton/src/sync/pair.ts`) calls `link.restore()` and `await settle()` after both replicas load from IndexedDB, and the link carries no persisted "cut" state. After any reload both replicas exchange `hello`, re-serve ops and acknowledge, so `countUnacked` falls to 0. A reload therefore cannot show "N waiting" with N > 0 in the pair view, and a worker cannot change that. Making the cut survive a reload needs a skeleton change, which this spec forbids.

## Decisions

### D1 Plugin: `vite-plugin-pwa` with `generateSW`

| Option | Result |
| --- | --- |
| `generateSW` (chosen) | No worker source to maintain. The policy (precache list, navigation fallback, `skipWaiting`, `clientsClaim`, `cleanupOutdatedCaches`) is plain config, which a unit test can read. Workbox computes revisions. |
| `injectManifest` | Needs a hand-written `sw.ts` per app or shared. More code for the same behavior. Kept as the first fallback if `generateSW` cannot express the navigation fallback under `base: './'`. |
| Hand-written worker | Second fallback, only if the plugin fails to build or to work with Vite 7.3.8 on Node 22 (task 1 decides). Described under "Fallback" below. |

Task 1 records which one shipped and why, with the install and build output, in `evidence/offline-shell/plugin-check.md`. The version is pinned exactly (no `^`), chosen as the newest `vite-plugin-pwa` whose `peerDependencies` accept `vite@7`; task 1 checks that with `pnpm view vite-plugin-pwa peerDependencies` and a clean build.

### D2 Registration by hand, not by the plugin

`injectRegister: false`. A small helper registers `./sw.js` when `import.meta.env.PROD` is true. Reasons: no `virtual:pwa-register` module to type, no script the plugin injects into `index.html`, and tests can call the helper with a fake `navigator` and a fake `PROD` flag. Under `vite dev` the plugin's `devOptions.enabled` stays `false`, so `vite dev` emits no worker.

### D3 Two shared tiny files in `apps/`, none in `skeleton/`

- `apps/pwa-options.ts` (build time): `shellOptions({ name, shortName, description }): Partial<VitePWAOptions>`.
- `apps/offline-shell.ts` (run time): `registerShell(env)`.

Reason: the policy that must be identical in both apps (cache cleanup, skipWaiting, clientsClaim, globs, navigation fallback, theme colour) would otherwise be copied twice and could drift. The apps differ only in name and description. Each app already imports across folders (`../../../skeleton/...`), so a relative import adds no deployment risk: Vercel builds from the repo root context. Both files sit directly in `apps/`, so the workspace glob `apps/*` sees no new package (no `package.json`), and both are type-checked through the imports from `apps/<app>/vite.config.ts` and `src/main.tsx`. The tests live in each app (`apps/<app>/src/*.test.ts`), which the existing `unit` project already includes.

### D4 The wisp count compared after reload

Given the finding above, "same wisp count" means: read each card's wisp count with the in-page link up and settled before the reload, reload offline, read it again after boot settles. The two values are equal, and the state text is equal. The edit made while the link was cut proves the ops were persisted and replayed: it appears on both cards after the reload. The test also asserts, before the restore, that the count was greater than 0 while cut, so the edit really was a queued op. This is a weaker claim than "queued ops survive a reload still queued". The owner should know this; making the cut persist is a separate skeleton task (a `startCut` option on `createPair`).

### D5 Update behavior

`registerType: 'autoUpdate'` plus explicit `workbox.skipWaiting: true`, `clientsClaim: true`, `cleanupOutdatedCaches: true`. The browser checks `sw.js` on each navigation (Vercel serves unhashed files with `must-revalidate`). A new version installs in the background, activates at once, and deletes the old precache. A tab that was already open keeps running its old JS until the next load. Known edge: that old tab asks for the old hashed shuffle worker URL after the old cache was deleted, and Vercel may no longer serve it. The user reloads to recover. Not required to fix (R4.4).

## Files

| File | Change |
| --- | --- |
| `apps/pwa-options.ts` | new, about 35 lines |
| `apps/offline-shell.ts` | new, about 25 lines |
| `apps/<app>/vite.config.ts` | add `VitePWA(shellOptions({...}))` to `plugins` |
| `apps/<app>/src/main.tsx` | one call `registerShell(...)` after boot, guarded by `PROD` |
| `apps/<app>/index.html` | `<meta name="theme-color">` (the plugin adds the manifest link) |
| `apps/<app>/public/icon.svg`, `icon-192.png`, `icon-512.png` | new, generated |
| `apps/<app>/package.json` | devDependency `vite-plugin-pwa` (exact) |
| `apps/<app>/src/build.test.ts` | extra cases for `dist/` contents |
| `apps/<app>/src/shell.test.ts` | new: options and `registerShell` |
| `playwright.config.ts`, `e2e/offline-shell.spec.ts`, `e2e/live.spec.ts` | Playwright |
| `package.json`, `pnpm-lock.yaml` | `e2e:live` script, lockfile |

No file in `skeleton/` and no `*.op.ts`.

## Build-time options (`apps/pwa-options.ts`)

```ts
import type { VitePWAOptions } from 'vite-plugin-pwa';

export const THEME = '#F2EADB';

export function shellOptions(a: { name: string; description: string }): Partial<VitePWAOptions> {
  return {
    strategies: 'generateSW',
    registerType: 'autoUpdate',
    injectRegister: false,
    devOptions: { enabled: false },
    manifest: {
      name: a.name, short_name: a.name, description: a.description,
      display: 'standalone', start_url: './', scope: './', id: './',
      theme_color: THEME, background_color: THEME,
      icons: [
        { src: 'icon-192.png', sizes: '192x192', type: 'image/png' },
        { src: 'icon-512.png', sizes: '512x512', type: 'image/png', purpose: 'any maskable' },
        { src: 'icon.svg', sizes: 'any', type: 'image/svg+xml' },
      ],
    },
    workbox: {
      globPatterns: ['**/*.{html,js,css,woff2,svg,png,webmanifest}'],
      navigateFallback: 'index.html',
      skipWaiting: true,
      clientsClaim: true,
      cleanupOutdatedCaches: true,
    },
  };
}
```

`woff` files are not precached: every browser that runs a service worker supports `woff2`, and Fontsource lists `woff2` first. `background_color` uses the same cream. Task 3 confirms the emitted `sw.js` and manifest paths are relative under `base: './'`; if the plugin resolves `navigateFallback` to an absolute path, the task switches to `injectManifest` (D1).

## Run time (`apps/offline-shell.ts`)

```ts
export interface ShellEnv {
  prod: boolean;
  nav?: Pick<Navigator, 'serviceWorker'>;
  warn?(msg: string, e: unknown): void;
}
/** Register `./sw.js` in production only. Never throws. */
export function registerShell(env: ShellEnv): Promise<void>;
```

It returns early when `!env.prod` or `nav.serviceWorker` is missing. It calls `register('./sw.js', { scope: './' })`, and on rejection calls `warn` once (default `console.warn`). `main.tsx` calls it as `void registerShell({ prod: import.meta.env.PROD, nav: navigator })` inside the existing `if (el)` branch, after `boot(el)`. The relative URL resolves against the document, so it is `/sw.js` at the root of a custom domain and of a `*.vercel.app` URL. The apps have no client-side routes, so the document URL is always the root.

## Icons

A one-off Node script, not committed, writes a flat `#F2EADB` square with a simple dark glyph (BASECAMP: a triangle tent shape; AFTERSHOCK: a jagged line over a baseline) as `icon.svg`, and renders `icon-192.png` and `icon-512.png` with `node:zlib` (no new dependency). The files are committed under each app's `public/`. A unit test checks the PNG signature and the IHDR width and height.

## Playwright

`playwright.config.ts` adds, without changing any existing entry:

```ts
projects: [
  // existing three
  { name: 'basecamp-shell',   testMatch: 'offline-shell.spec.ts', use: { baseURL: 'http://localhost:5177', app: 'basecamp' } },
  { name: 'aftershock-shell', testMatch: 'offline-shell.spec.ts', use: { baseURL: 'http://localhost:5178', app: 'aftershock' } },
  { name: 'live',             testMatch: 'live.spec.ts' },
],
webServer: [
  // existing four
  { command: 'pnpm --filter @limbo/basecamp build && pnpm --filter @limbo/basecamp exec vite preview --port 5177 --strictPort',
    url: 'http://localhost:5177/', reuseExistingServer: false, timeout: 120_000 },
  { command: 'pnpm --filter @limbo/aftershock build && pnpm --filter @limbo/aftershock exec vite preview --port 5178 --strictPort',
    url: 'http://localhost:5178/', reuseExistingServer: false, timeout: 120_000 },
],
```

`app` is a custom test option (`test.extend<{ app: 'basecamp' | 'aftershock' }>({ app: ['basecamp', { option: true }] })`). `reuseExistingServer` is `false` for the previews so a stale `dist/` is never served. The `live` project has no `baseURL` and no server. The two build commands write different `dist/` folders, so they can run in parallel. `pnpm e2e` ordering is unchanged because `workers: 1`.

`vite preview` serves `dist/` with `sw.js` at the root, which is the same layout as Vercel.

## E2E: `e2e/offline-shell.spec.ts`

Per app, in a fresh context (`serviceWorkers: 'allow'` is the default):

1. `page.goto('/')`. Wait `await page.evaluate(() => navigator.serviceWorker.ready.then(r => !!r.active))`. Then wait for the precache: `expect.poll` until `caches.keys()` is non-empty and `navigator.serviceWorker.controller` is non-null (reload once online if `clientsClaim` has not yet claimed the first page).
2. Edit through the UI with roles and locators the existing e2e already uses:
   - BASECAMP: `card('a').getByRole('checkbox', { name: /^Tick tent/i })` and `.check()`. First click "Cut link", then tick, assert `.wisp-count` > 0 on A, then "Restore link" and poll until both cards agree and wisp counts are 0 (D4).
   - AFTERSHOCK: the `report()` helper pattern (open C3, radio "Unsafe", count 3, note, Save), with the same cut, wisp > 0, restore sequence.
3. Capture `snap()`: for each card, `innerText` of its list or grid region and its wisp count text, plus the `.limbo-chip-text`.
4. `await context.setOffline(true)`, `await page.reload()`. Wait for the root card to render.
5. Assert: `snap()` equals the one from step 3; the tent checkbox is checked on both cards (BASECAMP) or C3 shows `UNSAFE` on both (AFTERSHOCK); `'limbo' in window` is `false` before and after; `navigator.serviceWorker.controller` is non-null.
6. Extra case, BASECAMP and AFTERSHOCK: still offline, click "Run shuffle test", expect the "orderings → same state" line (R2.3).

Locators are copied from the existing two specs, so no source change is needed. If the tent checkbox name differs from `Tick tent`, task 7 reads it from `apps/basecamp/src/seed.ts` and uses the real name.

## E2E: `e2e/live.spec.ts`

- `const URL_OF = { basecamp: process.env.LIMBO_LIVE_BASECAMP, aftershock: process.env.LIMBO_LIVE_AFTERSHOCK }`. Each test starts with `test.skip(!url, 'LIMBO_LIVE_* not set')`.
- Judge flow, using `getByRole('button', { name })` and `getByText`, scoped to a card by `[data-replica="a"|"b"]` (a DOM attribute, not `window.limbo`):
  - BASECAMP: "Cut link", "Play the lake scene", wait for "2 WAITING" on both plates, "Restore link", wait for both cards to lose the fog (`Syncing` gone, chip "Live"), A: "Keep", B: "OK". Assert: both cards' list text equal (`innerText` of the card's list region), no `TWIN ·` caption, `FIXED` visible on both, `Sari is bringing it` exactly once per card and no `Budi is bringing it`.
  - AFTERSHOCK: "Cut link", "Play the survey scene", wait for "3 WAITING", "Restore link", A: `Keep this note: gas smell, east wall`. Assert: both grids' text equal, no `TWIN ·` caption, `FIXED` visible, C3 shows `UNSAFE`, `5 reported — Sari 2, Budi 3`.
  - The brief asks for "0 twins". No such text exists on screen. The shell has `.limbo-twin` elements and `TWIN ·` captions, so "0 twins" is asserted as zero `TWIN ·` texts and zero `Keep`/`OK` resolve buttons.
- Offline part, fresh context on the same URL: wait for the worker as in the e2e above, "Cut link", one edit (tick the tent / report C3), "Restore link", settle, `setOffline(true)`, reload, assert the snapshot equals (D4).
- Header check: `request.get(url + 'sw.js')`, assert `cache-control` has no `max-age=N` with N > 0 and no `immutable`.
- Record: a module-level array filled in `test.afterEach` from `testInfo.title` and `testInfo.status`. `test.afterAll` writes `evidence/live/live-<ISO date>.json` with `{ date, urls, tests: [{name, status}], passCount }` when `LIMBO_LIVE_RECORD === '1'`. The date comes from the run clock in the spec, which is allowed: it is a test file, not an op file.

## Fallback: hand-written worker

Used only if task 1 fails. A Vite plugin in `apps/pwa-options.ts` (`closeBundle` hook) lists `dist/` and writes `sw.js` from a template: `CACHE = 'limbo-shell-' + sha256(sorted file list + each file's size)`, `install` adds all files and calls `skipWaiting`, `activate` deletes every cache whose name starts with `limbo-shell-` and is not `CACHE`, then `clients.claim()`, `fetch` answers `caches.match(request, { ignoreSearch: true })` first and falls back to the cached `index.html` for navigations. The manifest is written by the same plugin. The options helper and the tests keep the same names.

## Budget

`skeleton/` is untouched, so the skeleton budget (30 files, 2,400 lines, 15 exports) is unchanged. The task 9 measurement uses the command in `evidence/budget-basecamp-baseline.md` and states the equal result. The two shared files are in `apps/`, not in the skeleton.

## Test plan

| Area | Test | Cases (requirement) |
| --- | --- | --- |
| options | `apps/<app>/src/shell.test.ts` | `shellOptions` has `display: standalone`, theme `#F2EADB`, `skipWaiting`, `clientsClaim`, `cleanupOutdatedCaches`, `injectRegister: false`, `devOptions.enabled: false` (R4, R5) |
| registration | same file | `prod: false` registers nothing; no `serviceWorker` registers nothing; `prod: true` calls `register('./sw.js', ...)`; a rejection warns once and resolves (R3) |
| build output | `apps/<app>/src/build.test.ts` | `dist/sw.js`, `manifest.webmanifest`, three icons exist; the precache list in `sw.js` names `index.html`, the JS, the CSS, the shuffle worker and one `woff2`; manifest fields (R1, R5, R10.3); banned strings absent |
| icons | `shell.test.ts` | PNG signature, 192 and 512 sizes (R5.1) |
| offline reload | `e2e/offline-shell.spec.ts` | R2, R3.3, R8 |
| live | `e2e/live.spec.ts` | R9, skipped by default |

No property test: no op changed. The existing properties and the intent manifest stay as they are.
