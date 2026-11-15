# LIMBO

When the connection dies, your app crosses over, keeps working on the other side, and comes back without silently losing an edit.

LIMBO is a Kiroween **Skeleton Crew** entry: a lean local-first skeleton where every operation declares how it merges, a `/.kiro`
kit that makes Kiro block merge code that diverges when operations arrive in a different order, and two apps built from the one
skeleton (`apps/basecamp`, `apps/aftershock`).

> Work in progress. This README is a stub; numbers appear here only once `evidence/` holds the measured runs.

## Layout
- `.kiro/` — steering, hooks, custom agents, specs (authored with Kiro)
- `skeleton/` — the template: op layer, named merges, causal delivery, simulator
- `apps/basecamp/`, `apps/aftershock/` — two distinct apps on the skeleton
- `kit/` — hook scripts, property harness, Kiro run wrapper
- `evidence/` — measured runs, Kiro session and hook ledgers

## Run
```
pnpm install
pnpm typecheck && pnpm test
```

License: MIT.
