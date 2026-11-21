Create a Kiro **feature spec** named `convergence-mcp` (requirements-first, EARS acceptance criteria) under `.kiro/specs/convergence-mcp/`:
`requirements.md`, `design.md`, `tasks.md`. Write only those three files. Do not implement anything yet. Do not run git.
Read `.kiro/steering/*.md`, `.kiro/specs/merge-kit/` (the harness it wraps), `kit/props/` (`run.ts`, `config.ts`, the arbitraries, `intents.json`),
`skeleton/src/core/simulate.ts`, `kit/hooks/` (the `op-lint` logic and its selftests), `.kiro/agents/limbo-builder.json` and `kit/package.json`.

## Goal
A local **stdio MCP server** `kit/mcp/server.mjs` that lets Kiro call LIMBO's convergence harness while it writes an op. Kiro asks "does the
op I just wrote converge under random orderings?" and gets either a pass with the run count, or the **shrunk counterexample**.
It calls the **same** harness code the hooks and the in-page ShuffleTest use: one harness, three callers (no second implementation).
Use `@modelcontextprotocol/sdk` (add it to `kit/package.json`; run `pnpm install`). The server resolves the workspace root from its own path
(`import.meta.url`), never from the process cwd. Wire it in `.kiro/settings/mcp.json` as server `limbo-convergence`
(`{"command":"node","args":["kit/mcp/server.mjs"]}`) and add it to the `mcpServers` of `.kiro/agents/limbo-builder.json` (keep the agent's other
fields and permissions; allow only this server's tools). Never gitignore `.kiro/`.

## Tools
| Tool | Input | Output |
|---|---|---|
| `list_ops` | `{app}` (`basecamp` or `aftershock`) | registered ops: name, merge rule, intent kind, props file |
| `fuzz_op` | `{app, op, orderings=500, replicas=3, seed?}` | `{pass, runs, seed, vacuity:{concurrentShare}, counterexample?:{script, deliveries}}` |
| `explain_trace` | `{app, counterexample}` | per-replica state after each delivery, and the first delivery step where states differ |
| `check_lint` | `{file}` | the `op-lint` result for an op file, exactly as the PostFileSave hook reports it |
`orderings` is clamped to 5,000 per call; a call returns within 60 s. Errors are structured results, never a crash; unknown app/op → a clear message.

## Evidence and tests
Each tool call appends one JSON line to `evidence/kiro/mcp-calls.jsonl` (ts, tool, app, op, pass, runs, ms), written by the server only.
Tests (`kit/mcp/server.test.ts`, run by `pnpm test`): the tool handlers are exercised through the SDK's in-memory transport or by spawning the
server over stdio; `fuzz_op` on a registered good op passes; on a deliberately wrong op (use the existing mutation fixtures under `kit/props/bad/`,
read-only) it returns a counterexample whose replay reproduces the divergence; `explain_trace` names the first differing step; `check_lint` flags
a wall-clock op file; the server starts from a different cwd. Never weaken a property, test or hook.
Add a startup smoke script `kit/scripts/mcp-smoke.mjs` that starts the server over stdio, lists tools and calls `list_ops`, and exits 0.
Each task ends with `pnpm -s typecheck && pnpm -s test && pnpm -s props` green. Small numbered tasks with requirement ids; the last task
runs the smoke script and records the measured test count.
