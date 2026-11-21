# Requirements: offline-shell

BASECAMP and AFTERSHOCK are static Vite SPAs on Vercel. Their ops live in IndexedDB, but the page itself comes from the network, so a reload in airplane mode shows the browser's offline error. This spec adds a service worker that precaches the built shell, so the app opens again offline with the replica state it had before the reload. It completes `skeleton-sync` task 10 and R16, which were deferred to this spec.

Scope: both apps, Playwright, and the root files that Playwright and the lockfile need. Nothing in `skeleton/` changes. No op changes, so no new property.

Wording: convergence is "measured, property-tested", never "proven" or "guaranteed". Every number in a record comes from a run under `evidence/`.

## Glossary

- **Shell**: the files `vite build` writes to an app's `dist/`: HTML, JS (including the shuffle worker), CSS, fonts, the manifest and the icons.
- **Shell worker**: the service worker that precaches the shell and serves it cache-first.
- **Wisp count**: the number on a card's `.wisp-count` and the "N WAITING" plate.
- **Production build**: the output of `pnpm --filter <app> build`. `vite dev` is not one.

## R1 Precache and cache-first serving

1. Each app's production build shall emit one shell worker, `sw.js`, in `dist/`.
2. The shell worker shall precache every file of the shell needed to open the app: `index.html`, all JS and CSS under `assets/`, the shuffle worker script, the `woff2` fonts, the manifest and the icons.
3. WHEN a request matches a precached URL, the shell worker shall answer from the cache without waiting for the network.
4. WHEN a navigation request does not match a precached URL, the shell worker shall answer with the precached `index.html`.
5. The shell worker shall make no network request of its own except fetching the precache on install and checking for a new `sw.js`. It shall run no timer and no polling.
6. The shell worker shall contain no server code, no analytics and no third-party origin.

## R2 Open again offline

1. WHEN the app has been loaded once online, the worker is active, and the user reloads with the network off, the app shall open and show the same replica state on both cards as before the reload.
2. WHEN the app opens after that offline reload, each card's wisp count shall equal its count before the reload, with the in-page link in the same state at both moments (see D4 in the design: the in-page pair reconnects at boot, so the count compared is the settled one).
3. WHEN the app opens offline, the shuffle test shall still run, because its worker script is precached.
4. WHILE the network is off, the app shall make no request that fails visibly: no broken fonts, no blank page, no browser offline error.

## R3 Production only

1. The app shall register the shell worker only when `import.meta.env.PROD` is true and `navigator.serviceWorker` exists.
2. WHILE running under `vite dev` or Vitest, the app shall register no worker. The existing dev, jsdom and e2e tests run as before.
3. The production build shall not define `window.limbo`. A test shall assert it at run time on the built app (R8.4) and by build-output scan (R10.3).
4. IF registration fails, THEN the app shall keep running online and shall log one `console.warn`. It shall not throw.

## R4 New versions

1. WHEN a new `sw.js` is deployed and the user next loads the app, the new worker shall install, skip waiting and claim its clients, so no user stays on an old shell indefinitely.
2. WHEN the new worker activates, it shall delete every cache created by an older shell worker version.
3. The precache revision of each file shall come from the build (content hash in the file name, or a revision hash for unhashed files), so an unchanged file is not downloaded again.
4. The spec does not require a visible "updated, reload" prompt.

## R5 Installable manifest

1. Each app shall ship a web app manifest with `name`, `short_name`, `display: "standalone"`, `theme_color: "#F2EADB"`, `background_color`, `start_url: "./"`, `scope: "./"` and at least an SVG icon plus 192 and 512 pixel PNG icons.
2. `index.html` of each app shall link the manifest and set `<meta name="theme-color" content="#F2EADB">`.
3. The icons shall be simple generated artwork under each app's `public/`. They shall contain no third-party trademark and no text that names another product.
4. App names shall be `BASECAMP` and `AFTERSHOCK`. Short names shall be the same words.

## R6 Deployment compatibility

1. `base: './'` shall stay in both `vite.config.ts` files.
2. The worker, the manifest and every precached URL shall resolve relative to the page, so the app works at `/` on a custom domain (`https://basecamp.limbo.edycu.dev/`, `https://aftershock.limbo.edycu.dev/`) and at `/` on a `*.vercel.app` URL.
3. The app shall need no `vercel.json`, no header rule and no server route. Vercel's default revalidation of unhashed files (`sw.js`, `index.html`) is relied on and shall be checked on the live URL (R9.5).
4. No URL of a deployment shall be hard-coded in a spec, a config or a source file.

## R7 Skeleton untouched

1. `skeleton/` shall have no changed file. The measured skeleton file count, non-blank non-comment TS/TSX lines and export count shall equal the figures in `evidence/budget-basecamp-baseline.md` (or its latest successor), measured with the command recorded there.
2. The worker policy and the registration helper shall live outside `skeleton/`, in `apps/` (D3 in the design).
3. The shell shall not change an op, a merge rule, an intent or `kit/props/intents.json`.

## R8 E2E: offline reload (`e2e/offline-shell.spec.ts`)

1. The spec shall run once per app against `vite preview` of the production build: BASECAMP on port 5177, AFTERSHOCK on port 5178. Each preview is built by `pnpm --filter <app> build` first.
2. For each app the test shall: load the app, wait until the worker is active, make an edit (BASECAMP: tick the tent; AFTERSHOCK: report sector C3), read both cards' state text and wisp counts, call `context.setOffline(true)`, reload, and assert the app opens with the same state text and the same wisp counts.
3. The test shall assert that the edit is present after the reload, so an empty page or a default seed cannot pass.
4. The test shall assert `'limbo' in window` is `false` in the production build, before and after the reload.
5. The test shall assert the page is controlled by the worker after the offline reload (`navigator.serviceWorker.controller` is not null).
6. All existing e2e tests (`offline-spike`, `basecamp-offline`, `aftershock-offline`) shall keep passing, with their ports and servers unchanged.

## R9 E2E: live deployment (`e2e/live.spec.ts`)

1. The spec shall run for an app only when `LIMBO_LIVE_BASECAMP` or `LIMBO_LIVE_AFTERSHOCK` holds a URL. Otherwise its tests shall be skipped, and `pnpm e2e` shall stay green with no network.
2. The base URLs shall come only from those two variables. No URL shall appear in the spec.
3. For each app the pair-view judge flow shall use only on-screen text and ARIA roles (plus the existing `data-replica` card scope), never `window.limbo`: cut the link, play the scripted scene, restore the link, tap the resolves, then assert both cards show the same list or grid text, no twin captions remain, and the FIXED stamp shows. BASECAMP: exactly one stove claimant. AFTERSHOCK: C3 UNSAFE and "5 reported".
4. After the judge flow, on the same live URL, the test shall make an edit while the in-page link is cut, `setOffline(true)`, reload, and assert the same state and the same wisp counts as in R8.2.
5. The spec shall assert the live `sw.js` response is revalidated (it carries no `max-age` greater than 0 and no `immutable`).
6. WHEN `LIMBO_LIVE_RECORD=1`, the spec shall write one JSON record to `evidence/live/` with the date, the URLs, the test names and the pass count. Otherwise it shall write nothing.

## R10 Constraints

1. Every task shall end with `pnpm typecheck && pnpm test && pnpm props` green. E2E tasks shall also end with `pnpm e2e` green. No test or property shall be weakened, skipped or have `numRuns` lowered.
2. `pnpm e2e` with no live variables shall need no network beyond `localhost`.
3. A build-output test shall assert that each production `dist/` contains `sw.js`, `manifest.webmanifest`, the three icons, and none of: `devrelay`, `DevRelayLink`, `window.limbo`, `localhost:5175`, `https://fonts`.
4. The spec shall add no runtime dependency. `vite-plugin-pwa` (with its workbox packages) is a devDependency of each app, pinned to an exact version.
5. Files changed outside the two apps shall be limited to `playwright.config.ts`, `e2e/*`, `package.json`, `pnpm-lock.yaml`, `apps/pwa-options.ts`, `apps/offline-shell.ts` and `evidence/` records. The last task lists them.
6. Do not run git.
