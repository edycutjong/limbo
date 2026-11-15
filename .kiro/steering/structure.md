---
inclusion: always
---
# LIMBO: structure

- `.kiro/`: steering, hooks, agents, specs, settings. At the repo root, never gitignored.
- `skeleton/src/core`: op types, named merges, causal buffer, `simulate.ts`.
- `skeleton/src/sync`: replica, links, store.
- `skeleton/src/limbo`: Fog, Wisps, Twin, Inspector, ReplicaPair, ShuffleTest.
- `apps/<app>/src/ops`: `*.op.ts` (one op per file), `*.props.ts`, `registry.gen.ts` (generated, do not hand-edit).
- `kit/hooks/*.mjs`: hook scripts.
- `kit/props/`: `run.ts` runner, `config.ts`, `intents.json` intent manifest, `intent/` kit-owned intent properties, `bad/` mutation fixtures, `golden/` golden histories, `arbitraries/` op generators.
- `kit/mcp/server.mjs`: MCP server.
- `kit/scripts/`: `kiro-run.mjs` wrapper.
- `e2e/`: Playwright tests.
- `evidence/`: measured runs. Ledgers: `evidence/kiro/{sessions,hooks}.jsonl`.

## What an app supplies to the skeleton

1. Its model (entities).
2. Its ops (`*.op.ts`).
3. Its seed op script.
4. Its views.
5. Its config.

Skeleton budget (provisional): at most 30 files, 1,800 TS/TSX lines excluding tests, CSS and tokens, 15 exports.
