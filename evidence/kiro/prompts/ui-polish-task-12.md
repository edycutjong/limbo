Continue task 12 of the ui-polish spec. Your previous session was stopped by the 560 s watchdog after writing `e2e/ui-polish.spec.ts`, the `playwright.config.ts`
entries and a one-line change in `apps/aftershock/src/main.tsx`. The orchestrator has since run `pnpm typecheck && pnpm e2e`: 22 passed, 8 skipped (the live-URL
tests need env variables), exit 0. Do NOT run `pnpm e2e` or `props:full` again (they exceed the session time). Do only the remaining bookkeeping: run
`pnpm typecheck && pnpm test && pnpm props`, then fill the final record in `design.md` (measured counts from those runs and the orchestrator's e2e result above, every
file changed outside `apps/` incl. the `## Skeleton changes` section and the re-measured skeleton budget with the baseline command), and tick task 12.
