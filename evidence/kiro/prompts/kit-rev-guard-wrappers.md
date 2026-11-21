Kit revision (continuation of hooks-fail-closed): `kit/hooks/guard-shell.mjs` still lets a denied command through when a runner prefix
wraps it. Measured with the current guard: `timeout 5 git commit -m x`, `pnpm exec npm publish`, `pnpm dlx vercel` and `npx vercel --prod`
all exit 0 (allowed), while `nice -n 5 git push` and `{ git commit -m x; }` are denied.

Treat these as wrappers whose remaining words are the real command (strip their own options and arguments, then check the rest):
`timeout` (with its options and the duration), `pnpm exec`, `pnpm dlx`, `npm exec`, `npx` (and `--yes` / `-y` / `-p <pkg>`), `pnpx`,
`yarn dlx`, `yarn exec`, `bunx`, `stdbuf` (with its options). Add tests for each denied shape above and for allowed ones that must stay
allowed: `npx vitest run`, `npx tsc --noEmit`, `npx playwright test`, `pnpm exec vitest run`, `timeout 30 pnpm test`, `git diff`.
Run `pnpm typecheck && pnpm test` until green, then `node kit/scripts/gate-integrity.mjs --write` and `pnpm gate`. Report the counts.
Keep this session short. Do not run git. Do not run `pnpm e2e` or `pnpm props:full`.
