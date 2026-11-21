# Skeleton unchanged (offline-shell task 5)

Measured with the command in `evidence/budget-basecamp-baseline.md` (same scope, run from the repo root, after the worker, icons, options and registration helper were added).

| Measure | Recorded (after bugfix-inspector-resolved task 2) | Measured now |
| --- | --- | --- |
| Files | 21 | 21 |
| Non-blank, non-comment lines | 2142 | 2142 |

Both figures equal the recorded ones. The offline-shell spec added no file under `skeleton/`. This is a count check, not a diff; the git state was not inspected (no git in this task).

Production exposure, from the extended `build.test.ts` of both apps (run in `pnpm test`, 80 files, 630 tests passed):

- The built `assets/index-*.js` bundle does not contain `window.limbo`.
- `sw.js` does not contain the string `limbo` in any case, and contains no `http://` or `https://`. The allow-list in the test is empty.
- The only absolute URL in the Workbox runtime is `https://bit.ly/wb-precache`, a `console.warn` message in `workbox-*.js`. It is never fetched.
