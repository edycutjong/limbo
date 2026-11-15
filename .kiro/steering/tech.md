---
inclusion: always
---
# LIMBO: tech

- TypeScript strict. pnpm 10 workspace. Node 22.
- Vite + React static SPAs (later).
- Yjs 13.6.33 + y-indexeddb 9.0.12 are the replicated op-log store, behind one adapter: `skeleton/src/sync/store.ts`. The library only stores and moves the grow-only op log. Every merge rule is LIMBO's.
- fractional-indexing 4.0.0 (ordering), fast-check 4.10.2 (properties).
- Vitest 3 with two projects: `unit` = `*.test.ts`, `props` = `*.props.test.ts`.
- Playwright 1.59: two browser contexts, `context.setOffline`.

## Commands

| Command | Runs |
| --- | --- |
| `pnpm typecheck` | TypeScript strict check |
| `pnpm test` | `unit` project |
| `pnpm props` | `props` project (property tests) |
| `pnpm e2e` | Playwright two-context tests |

## Skeleton budget (provisional)

At most 30 files, 1,800 TS/TSX lines (excluding tests, CSS, tokens), and 15 exports.
