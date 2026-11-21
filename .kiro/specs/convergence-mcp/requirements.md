# Requirements: convergence-mcp

A local stdio MCP server, `kit/mcp/server.mjs`, that lets Kiro call LIMBO's convergence harness while it writes an op. Kiro asks "does the op I just wrote converge under random orderings?" and gets a pass with the run count, or the shrunk counterexample. The server wraps the harness that already exists (`kit/props/`, `skeleton/src/core/simulate.ts`, `kit/hooks/op-lint.mjs`). It adds no second implementation of any property, merge or lint rule. Wording everywhere: "measured, property-tested", never "proven" or "guaranteed". The op contract in `.kiro/steering/local-first.md` is binding.

## Glossary

- **Harness**: the per-op properties (`convergence`, `replay equivalence`, `idempotence`, `commutes`, `no lost edit`), the op's own intent checks from `<op>.props.ts`, and the manifest check, over runs of `simulate()`.
- **Engine**: `kit/props/engine.ts`, the vitest-free module that holds the harness. `kit/props/run.ts` re-exports it and adds `runOpProperties`.
- **Run**: one `simulate()` script with its delivery orders. "Orderings" in a tool call means runs.
- **Counterexample**: the shrunk `{seed, steps}` pair that fails, with the script and delivery order per replica it produces.
- **Job**: one fresh `node` child process that does the work of one tool call.
- **Concurrent share**: the share of runs whose script holds at least one pair of concurrent ops on one target.

## R1 Server and transport

User story: as a Kiro session, I want one local MCP server for the harness, so I can check an op without leaving the editor.

1. The server shall be `kit/mcp/server.mjs`, speak MCP over stdio, and be built on `@modelcontextprotocol/sdk`.
2. The server shall resolve the workspace root from `import.meta.url` and never from `process.cwd()`.
3. When started from any working directory, the server shall list the same tools and return the same results.
4. The server shall write nothing to stdout except MCP frames. Diagnostics go to stderr.
5. The server shall expose exactly four tools: `list_ops`, `fuzz_op`, `explain_trace`, `check_lint`.
6. `@modelcontextprotocol/sdk` (and `zod`, which the SDK's tool schemas use) shall be declared in `kit/package.json` at exact versions, and `pnpm install` shall leave the lockfile consistent.

## R2 One harness, three callers

User story: as the kit owner, I want every caller to run the same code, so a property cannot pass in one place and fail in another.

1. The harness (property table, `checkRun`, `failingProperties`, `formatFailure`, `loadManifest`, `checkManifest`, `PROPERTY_NAMES`) shall live in `kit/props/engine.ts`, which shall not import `vitest`.
2. `kit/props/run.ts` shall re-export every name it exports today, with the same behavior, and shall keep only `runOpProperties` and the vitest registration.
3. The server shall import the engine and `skeleton/src/core/simulate.ts` directly. It shall not copy, reword or reimplement a property, a merge, the delivery order, `explainTrace` or a lint rule.
4. The hooks (through `pnpm props`, which runs `run.ts`) and the server (through the engine) shall run the same property functions. The in-page ShuffleTest shall keep sharing `simulate.ts` (`deliveryOrder`, `explainTrace`) and `causalBuffer` with both.
5. When the engine is extracted, every existing test and property shall pass unchanged, with no property weakened, skipped or run fewer times.

## R3 `list_ops`

1. When `list_ops` receives `{app}` with `app` equal to `basecamp` or `aftershock`, the server shall return every op in `apps/<app>/src/ops/registry.gen.ts`, sorted by name, each as `{name, merge, intent, propsFile}`.
2. `intent` shall be the op's declared intent kind. `propsFile` shall be the repo-relative path of `<op>.props.ts`, or `null` when none exists.
3. The server shall read the registry fresh on every call, so an op saved a moment ago is listed.
4. If `app` is not `basecamp` or `aftershock`, then the server shall return a structured error that names the two valid values.

## R4 `fuzz_op`

User story: as Kiro, I want to fuzz the op I just wrote, so I find a divergence before the stop-gate does.

1. When `fuzz_op` receives `{app, op, orderings, replicas, seed}`, the server shall run the engine's harness on that registered op for `orderings` runs over `replicas` replicas from `seed`.
2. The defaults shall be `orderings = 500` (the fast tier), `replicas = 3`, and `seed` = the harness default (`LIMBO_PROPS_SEED` or the recorded constant).
3. The result shall carry `pass`, `runs` (runs actually executed), `seed`, `vacuity: {concurrentShare}`, and, when a property fails, `counterexample`.
4. The harness for one op shall be the same set the property suite runs for it: the engine properties, the checks in the op's `<op>.props.ts` (`opts.gen`, `opts.checks`), and the manifest check.
5. The server shall load the op, its `props.ts`, and every module they import fresh for each call, so Kiro always fuzzes the code on disk.
6. If the same call is repeated with the same inputs and unchanged files, then the server shall return the same `pass`, `runs`, `seed` and counterexample.
7. If `concurrentShare` is under the vacuity bar (0.5, the bar of the kit's vacuity guard), then the result shall set `vacuity.vacuous = true` and carry a warning that a pass says little. The server shall not change `pass` for this.
8. The result shall name the failing property and give the engine's failure text for it (`reason`).

## R5 Counterexample

1. A counterexample shall hold `property`, `reason`, `seed` (the simulation seed), `steps`, `replicas`, `script`, and `deliveries`.
2. `script` shall list every op of the run in creation order, each with `id`, `op`, `target`, `payload`, `stamp` and `deps`.
3. `deliveries` shall give, per replica, the op ids in delivery order, duplicates included.
4. The counterexample shall be the shrunk one: fast-check shrinks `{seed, steps}`, and the server reports the smallest failing pair it finds.
5. The counterexample shall replay: running `simulate()` with its `seed`, `steps` and `replicas` on the same op code shall reproduce the same script and deliveries.

## R6 `explain_trace`

1. When `explain_trace` receives `{app, op, counterexample}`, the server shall replay the counterexample and return, per replica, the canonical state after each delivery.
2. The result shall name the first delivery step where two replicas holding the same applied ops have different states, or say that none exists.
3. When the counterexample's property is an intent property and replicas agree (a wrong answer everyone shares), the result shall say so and still give the failing property and its reason.
4. The result shall use the output of `explainTrace` from `simulate.ts` for the step and difference text.
5. If the replayed script or deliveries differ from the supplied counterexample (the op code changed), then the server shall return a structured error that says the counterexample is stale.
6. `explain_trace` shall take `op` as well as `app`, because replay needs the op's reducer. The brief's input `{app, counterexample}` is extended by that one field.

## R7 `check_lint`

1. When `check_lint` receives `{file}`, the server shall run `kit/hooks/op-lint.mjs` as a child process with the same stdin event the PostFileSave hook sends, and return its result.
2. The result shall carry `pass`, `result` (`pass` or `fail`), `exit`, `target`, `detail` (the rule ids), and `violations: [{rule, message}]` parsed from the hook's stderr lines.
3. The server shall not copy any lint rule. The hook script is the only implementation.
4. The server shall point the hook's ledger (`LIMBO_HOOKS_LOG`) at a temporary file, so a tool call does not add a row to `evidence/kiro/hooks.jsonl`.
5. If `file` resolves outside the workspace root or does not exist, then the server shall return a structured error and shall not run the hook.
6. If `file` is not an op file, then the server shall return the hook's own result (`pass`, `detail: "not an op file"`).

## R8 Limits and errors

1. The server shall clamp `orderings` to 5,000 per call and to at least 1, and shall report `requested` and `clamped: true` when it did.
2. `replicas` shall be an integer from 2 to 5. Any other value shall return a structured error.
3. A tool call shall return within 60 s. A `fuzz_op` job shall stop starting runs after 50 s and return `truncated: true` with the runs it did execute. The server shall kill a job that is still running at 58 s and return a structured `timeout` error.
4. Every failure shall be a tool result with `isError: true` and `{error: {code, message}}`. A thrown error, a bad argument, a missing file, a broken op module or a crashed job shall never crash the server.
5. If `app` or `op` is unknown, then the message shall name the value and list the valid choices.
6. If an op module fails to import, then the error shall carry the import message, so Kiro can fix the file.
7. The server shall never write to `skeleton/`, `apps/`, `kit/props/` or `.kiro/`. Its only write outside a temporary directory is the evidence line of R9.

## R9 Evidence

1. After every tool call, including a failed one, the server shall append exactly one JSON line to `evidence/kiro/mcp-calls.jsonl` with `ts`, `tool`, `app`, `op`, `pass`, `runs`, `ms`.
2. `app`, `op`, `pass` and `runs` shall be `null` when the tool does not have them.
3. Only the server shall write this file. The `mcp-log` hook shall keep writing its own rows to `evidence/kiro/hooks.jsonl`.
4. If appending fails, then the server shall write the reason to stderr and still return the tool result.
5. Tests and the smoke script shall write to a temporary ledger (`LIMBO_MCP_LOG`), never to the real one.

## R10 Wiring

1. `.kiro/settings/mcp.json` shall declare server `limbo-convergence` as `{"command":"node","args":["kit/mcp/server.mjs"]}` under `mcpServers`.
2. `.kiro/agents/limbo-builder.json` shall gain `mcpServers` with the same server and keep every other field and permission unchanged.
3. The agent shall allow only this server's four tools: `@limbo-convergence/list_ops`, `fuzz_op`, `explain_trace`, `check_lint`.
4. `.kiro/` shall not be gitignored.
5. After the changes, `evidence/kiro/gate-manifest.json` shall be rewritten, and `kit/props/engine.ts` shall be part of the gate set, so the new files are tamper-evident like `run.ts`.

## R11 Tests and smoke

1. `kit/mcp/server.test.ts` shall run in `pnpm test` (the `unit` project) and shall exercise the tools through the SDK's in-memory transport and through a spawned stdio server.
2. `fuzz_op` on a registered good op shall return `pass: true` with `runs` equal to the request.
3. `fuzz_op` on a deliberately wrong op, taken read-only from `kit/props/bad/`, shall return `pass: false` and a counterexample whose replay reproduces the failure. For a divergence fixture, the replayed replicas shall end in different states.
4. `explain_trace` on that counterexample shall name the first differing step.
5. `check_lint` on an op file that calls `Date.now` shall return `pass: false` with rule `no-nondeterminism`.
6. A server spawned from a different working directory shall list the four tools and answer `list_ops`.
7. Unknown app, unknown op, a stale counterexample, an out-of-range `replicas`, a clamped `orderings` and a timeout shall each have a test.
8. Every fixture in `kit/props/bad/` shall still fail at least one property or golden history. No property, test or hook shall be weakened.
9. `kit/scripts/mcp-smoke.mjs` shall start the server over stdio, list the tools, call `list_ops`, and exit 0. It shall exit non-zero when a step fails.
10. Each task shall end with `pnpm -s typecheck && pnpm -s test && pnpm -s props` green.
