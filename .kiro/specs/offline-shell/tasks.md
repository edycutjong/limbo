# Tasks: offline-shell

Each task ends with `pnpm typecheck && pnpm test && pnpm props` green. The e2e tasks (6 to 8) also end with `pnpm e2e` green, with no live variables set. No test, property or `numRuns` is weakened, skipped or lowered. Nothing in `skeleton/` changes, and no `*.op.ts`, `registry.gen.ts` or `kit/props/intents.json` changes. Do not run git. Wording: "measured, property-tested". Every number written to a record comes from a run.

- [x] 1. Plugin check and dependency
  - `pnpm view vite-plugin-pwa peerDependencies` and pick the newest version that accepts `vite@7`. Add it to `devDependencies` of `apps/basecamp` and `apps/aftershock`, pinned exactly (`pnpm --filter @limbo/<app> add -D -E vite-plugin-pwa@<version>`).
  - Build both apps with a throwaway `VitePWA({ strategies: 'generateSW' })` entry and read `dist/sw.js` and the manifest. Confirm: the build passes on Vite 7.3.8 and Node 22, paths are relative under `base: './'`, and `navigateFallback: 'index.html'` resolves against the worker scope.
  - Record the chosen strategy (`generateSW`, else `injectManifest`, else the hand-written fallback in the design) and the reason in `evidence/offline-shell/plugin-check.md`, with the versions and the command output. If the plugin fails on Vite 7, stop here, write the fallback plugin in `apps/pwa-options.ts` as the design describes, and keep the same exports.
  - Test: the existing `build.test.ts` still passes.
  - _Requirements: R1.1, R6.1, R10.4_

- [x] 2. Icons, manifest values and theme colour
  - Generate `icon.svg`, `icon-192.png`, `icon-512.png` into `apps/basecamp/public/` and `apps/aftershock/public/` with a one-off script (not committed, no new dependency). Cream `#F2EADB` ground, a simple dark glyph, no third-party mark.
  - Add `<meta name="theme-color" content="#F2EADB" />` to both `index.html`.
  - Tests (`apps/<app>/src/shell.test.ts`, new): each PNG has the PNG signature and IHDR sizes 192×192 and 512×512; `icon.svg` exists and has no `<text>`; `index.html` has the theme-color meta.
  - _Requirements: R5.2, R5.3, R5.1_

- [x] 3. Shared build options and both Vite configs
  - Create `apps/pwa-options.ts` with `THEME` and `shellOptions({ name, description })` as in the design. In both `vite.config.ts`, add `VitePWA(shellOptions({ name: 'BASECAMP' | 'AFTERSHOCK', description }))` to `plugins`. Keep `base: './'`, ports and `outDir`.
  - Tests: in each `shell.test.ts`, assert the options (display, theme, `skipWaiting`, `clientsClaim`, `cleanupOutdatedCaches`, `injectRegister: false`, `devOptions.enabled: false`, relative `start_url` and `scope`). Extend each `build.test.ts` so the production build has `sw.js`, `manifest.webmanifest`, the three icons, a precache list naming `index.html`, the JS, the CSS, the shuffle worker and one `woff2`, a manifest with `name`, `short_name`, `display: standalone`, `theme_color: #F2EADB`, and none of the banned strings (`devrelay`, `DevRelayLink`, `window.limbo`, `localhost:5175`, `https://fonts`). Add these cases to the existing file so the two builds of one `dist/` never run in parallel.
  - _Requirements: R1.1, R1.2, R1.4, R4.1, R4.2, R4.3, R5.1, R5.4, R6.1, R6.2, R10.3_

- [x] 4. Registration helper and wiring
  - Create `apps/offline-shell.ts` with `registerShell(env)` as in the design. In both `main.tsx`, call `void registerShell({ prod: import.meta.env.PROD, nav: navigator })` inside the existing `if (el)` branch, after `boot(el)` or the dev relay branch is chosen. Nothing else in `main.tsx` changes.
  - Tests (`shell.test.ts`): `prod: false` calls `register` zero times; a `nav` without `serviceWorker` calls it zero times; `prod: true` calls `register('./sw.js', { scope: './' })` once; a rejected `register` calls `warn` once and resolves. The existing `app-shell.test.tsx`, `app.test.tsx` and scene tests still pass (Vitest has `PROD` false).
  - _Requirements: R3.1, R3.2, R3.4, R1.5_

- [x] 5. Production exposure and size check
  - Extend each `build.test.ts` so the built `main` bundle still contains no `window.limbo` after the worker was added, and `sw.js` contains no `limbo` global and no origin other than relative paths (scan for `http://` and `https://` in `sw.js`, allowing only the Workbox library's own source comments if present; list any match in the test as an allow-list entry with a reason).
  - Measure the skeleton count with the command in `evidence/budget-basecamp-baseline.md` and confirm it equals the recorded figures (`skeleton/` untouched). Write the result to `evidence/offline-shell/skeleton-unchanged.md`.
  - _Requirements: R3.3, R1.6, R7.1, R7.3_

- [x] 6. Playwright config: production previews
  - Add to `playwright.config.ts` the projects `basecamp-shell` (port 5177), `aftershock-shell` (port 5178) and `live`, the custom `app` option, and the two preview `webServer` entries (build then `vite preview --port <p> --strictPort`, `reuseExistingServer: false`). Existing projects, ports and servers stay as they are.
  - Add a placeholder-free smoke case: `e2e/offline-shell.spec.ts` loads `/` per app and expects the `h1` (BASECAMP or AFTERSHOCK). This proves the previews start.
  - Add the root script `"e2e:live": "playwright test --project=live"` to `package.json`.
  - Check: `pnpm e2e` runs the three existing projects plus the two smoke cases, all green.
  - _Requirements: R8.1, R8.6, R9.1, R10.2_

- [x] 7. E2E: offline reload (`e2e/offline-shell.spec.ts`)
  - Per app, in a fresh context: load, wait for the worker to be active and the page controlled, "Cut link", edit (BASECAMP: tick the tent, read the real checkbox name from the seed; AFTERSHOCK: report C3 as Unsafe, count 3, note), assert the wisp count is greater than 0 on the editing card, "Restore link", poll until the cards agree and the counts settle, take the snapshot (both cards' list or grid text, wisp counts, chip text), `context.setOffline(true)`, reload, and assert the snapshot is equal.
  - Assert the edit shows on both cards after the reload (tent checked on both; C3 `UNSAFE` on both), `'limbo' in window` is `false` before and after, `navigator.serviceWorker.controller` is not null, and "Run shuffle test" still prints its "orderings → same state" line while offline.
  - Replace the smoke case from task 6. Run the spec three times in a row to catch flakes; record the three results in `evidence/offline-shell/e2e-offline-shell.txt`.
  - _Requirements: R2.1, R2.2, R2.3, R2.4, R3.3, R8.2, R8.3, R8.4, R8.5_

- [ ] 8. E2E: live deployment (`e2e/live.spec.ts`)
  - Write the spec as in the design: URLs only from `LIMBO_LIVE_BASECAMP` and `LIMBO_LIVE_AFTERSHOCK`; each test skips when its variable is unset; judge flow by text and roles only (plus the `data-replica` card scope); the offline-reload part; the `sw.js` header check; the `LIMBO_LIVE_RECORD=1` JSON record to `evidence/live/live-<date>.json`.
  - Check without live variables: `pnpm e2e` is green and lists the live tests as skipped. Grep the spec for `http` and for `window.limbo` and `.limbo.`; both find no URL and no debug use.
  - Run it against both deployed URLs with `LIMBO_LIVE_RECORD=1`. Store the two JSON records under `evidence/live/`. If a live run fails, report the failing step and stop; do not change a deployed app in this task.
  - _Requirements: R9.1, R9.2, R9.3, R9.4, R9.5, R9.6, R6.4_

- [ ] 9. Final verification and record
  - Run `pnpm typecheck && pnpm test && pnpm props && pnpm e2e`. Write the measured counts (unit, limbo and props test files and tests; e2e tests passed and skipped; skeleton files, lines and exports) to `evidence/offline-shell/final.md`, from the real run output. State that `skeleton/` has no changed file.
  - List every file changed outside `apps/basecamp` and `apps/aftershock`. Expected: `playwright.config.ts`, `e2e/offline-shell.spec.ts`, `e2e/live.spec.ts`, `package.json`, `pnpm-lock.yaml`, `apps/pwa-options.ts`, `apps/offline-shell.ts`, and files under `evidence/`. Any other file is a defect to explain or revert.
  - Add the one open point to the record: the in-page pair reconnects at boot, so "same wisp count" compares the settled count (design D4). A persisted cut needs a skeleton change and is a separate spec.
  - _Requirements: R7.1, R7.2, R10.1, R10.5_
