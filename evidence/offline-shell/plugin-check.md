# offline-shell task 1: plugin check

Chosen strategy: **`generateSW`** with `vite-plugin-pwa@2.0.0`, pinned exactly in `devDependencies` of `apps/basecamp` and `apps/aftershock`.

Reason: the plugin builds on Vite 7.3.8 and Node v22.22.0, and the emitted worker and manifest use relative paths under `base: './'`. No fallback (`injectManifest` or hand-written) is needed.

## Versions

- Node: v22.22.0
- pnpm: 10.34.5
- vite: 7.3.8
- vite-plugin-pwa: 2.0.0 (npm `latest`; the highest of 1.0.x to 2.0.0)
- Peer dependencies of 2.0.0: `vite ^3.1.0 || ^4.0.0 || ^5.0.0 || ^6.0.0 || ^7.0.0 || ^8.0.0`, `workbox-build ^7.4.1`, `workbox-window ^7.4.1`, `@vite-pwa/assets-generator ^1.0.0 || ^2.0.0`. Engines `node >=20.19.0`.
- 1.3.0 peers also accept `vite@7`; 2.0.0 is the newest that does.

## Commands

```
pnpm view vite-plugin-pwa dist-tags            -> { latest: '2.0.0' }
pnpm view vite-plugin-pwa@2.0.0 peerDependencies engines
pnpm --filter @limbo/basecamp  add -D -E vite-plugin-pwa@2.0.0
pnpm --filter @limbo/aftershock add -D -E vite-plugin-pwa@2.0.0
pnpm --filter @limbo/<app> build      (with the throwaway entry below)
```

Throwaway entry (removed afterwards; task 3 adds the real one):

```ts
VitePWA({ strategies: 'generateSW', injectRegister: false,
  manifest: { name: 'X', short_name: 'X', start_url: './', scope: './' },
  workbox: { globPatterns: ['**/*.{html,js,css,woff2,svg,png,webmanifest}'],
    navigateFallback: 'index.html', skipWaiting: true, clientsClaim: true, cleanupOutdatedCaches: true } })
```

## Build output (both apps)

```
PWA v2.0.0
mode      generateSW
precache  24 entries (663.93 KiB)     # basecamp
precache  24 entries (649.67 KiB)     # aftershock
files generated
  dist/sw.js
  dist/workbox-9c191d2f.js
```

Both builds passed. `dist/` held `index.html`, `manifest.webmanifest`, `sw.js`, `workbox-9c191d2f.js`, `assets/`.

## Findings

- Precache URLs are relative, with no leading slash: `index.html`, `manifest.webmanifest`, `assets/index-*.js`, `assets/index-*.css`, `assets/shuffle.worker-*.js`, and the `woff2` files (no `woff`).
- `navigateFallback: 'index.html'` is emitted as `new NavigationRoute(createHandlerBoundToURL("index.html"))`. Workbox resolves that against the worker's scope (the `sw.js` location), so it is relative.
- `index.html` gets `<link rel="manifest" href="./manifest.webmanifest">`. Manifest: `start_url "./"`, `scope "./"`, `display "standalone"`.
- `sw.js` contains `skipWaiting()`, `clientsClaim()`, `cleanupOutdatedCaches()`. It contains 0 matches of `http://` or `https://`.
- Hashed files carry `revision: null` (the file name is the hash). `index.html` and `manifest.webmanifest` carry an MD5 revision.
- Points for later tasks:
  - `sw.js` imports a second file, `workbox-<hash>.js`, with `importScripts`/`define`. The file is not in the precache list; the browser keeps it with the worker script. Task 3 and 5 tests should expect it in `dist/`. One line of `workbox-*.js` contains a `http(s)://` string, so the task 5 scan of `sw.js` only (0 matches) passes, but a scan of the workbox file needs an allow-list entry.
  - `manifest.webmanifest` appears twice in the precache list (once from the glob, once from the plugin). It is harmless.
  - With no `manifest` icons or colours set, the defaults are `theme_color #42b883` and `background_color #ffffff`; task 3 sets `#F2EADB`.

## Checks after the change

- `pnpm typecheck`: passed.
- `pnpm test`: 78 files, 606 tests passed (includes both `build.test.ts` files).
- `pnpm props`: 22 files, 320 tests passed, 9 skipped (skips not introduced by this task).
- `vite.config.ts` in both apps is back to its original content.
