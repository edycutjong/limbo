# Tasks: convergence-mcp

Each task ends with `pnpm -s typecheck && pnpm -s test && pnpm -s props` green. Properties, tests and hooks are never weakened, skipped, or run fewer times to pass. Do not run git. Do not edit `kit/props/bad/`, `kit/props/intent/`, `kit/props/golden/`, `skeleton/` or `apps/`.

- [ ] 1. Extract the vitest-free engine
  - Create `kit/props/engine.ts` with the harness moved verbatim from `run.ts` (`MANIFEST_PATH`, `RunCheck`, `RunOptions`, `Failure`, `loadManifest`, `checkManifest`, `PROPS`, `PROPERTY_NAMES`, `formatFailure`, `checkRun`, `failingProperties`). Add `runOnce(def, simSeed, steps, opts)` returning `{res, failures}`; `checkRun` returns `runOnce(...).failures`.
  - `run.ts` keeps `runOpProperties`, `export * from './engine.ts'`, and its vitest and fast-check imports.
  - Test (`kit/props/engine.test.ts`, new): `import('./engine.ts')` under plain node-compatible imports succeeds without vitest globals (assert the module source has no `vitest` import); `run.ts` and `engine.ts` export the same names for the harness (list compared to the pre-change list recorded in the test); `checkRun` and `runOnce(...).failures` agree on a good def and on one fixture def.
  - Confirm `node -e "import('./kit/props/engine.ts')"` from the repo root prints no error.
  - Add `kit/props/engine.ts` to `GATE_FILES` in `kit/scripts/gate-list.mjs`. Rewrite the manifest with `node kit/scripts/gate-integrity.mjs --write` only after the suite is green.
  - _Requirements: R2.1, R2.2, R2.5, R10.5_

- [x] 2. `fuzz()` in the engine
  - Add `FuzzParams`, `FuzzResult`, `Counterexample`, `fuzz(def, opts, params)` to `engine.ts` as designed: manifest check, `fc.check` over `{seed, steps}` with `numRuns`, `seed`, `interruptAfterTimeLimit`, concurrent-share counter, shrunk counterexample rebuilt by one `runOnce`.
  - Tests (`engine.test.ts`): a good registered op (`item.tick`, 100 orderings) gives `pass: true`, `runs: 100`, `concurrentShare` in (0, 1]; fixtures `tick-toggle` (`intent:set`) and `lww-wallclock` (`convergence` or `intent:set`) give `pass: false` with a counterexample; the same inputs give an equal result; `deadlineMs: 1` gives `truncated: true` with fewer runs; the counterexample replayed through `simulate()` reproduces its `script` and `deliveries`; with the wall-clock fixture the replayed final states differ between replicas.
  - Confirm `runOpProperties` still registers the same property names (existing `run.test.ts` unchanged and green).
  - _Requirements: R4.1, R4.3, R4.4, R4.6, R4.7, R4.8, R5.1 to R5.5_

- [ ] 3. SDK dependency and wiring files
  - Add `@modelcontextprotocol/sdk` and `zod` to `kit/package.json` at the exact versions `pnpm add` resolves; run `pnpm install`; confirm the lockfile changes only for these packages.
  - Add `kit/mcp/**/*.ts` to `tsconfig.json` `include`.
  - Create `.kiro/settings/mcp.json` with server `limbo-convergence`.
  - Update `.kiro/agents/limbo-builder.json`: add `mcpServers`, `"@limbo-convergence"` in `tools`, and `allowedTools` with the four tool names. Keep every other field and every permission rule byte-identical (verify by diffing the parsed JSON minus the new keys).
  - Confirm `.gitignore` does not match `.kiro/`.
  - Test (`kit/mcp/wiring.test.ts`, new): `mcp.json` has the server with the exact command and args; the agent has the same server, allows exactly four `@limbo-convergence/*` tools, and its `permissions` and `includeMcpJson: false` are unchanged; `.gitignore` has no rule that matches `.kiro/settings/mcp.json`.
  - _Requirements: R1.6, R10.1 to R10.4_

- [ ] 4. Job layer
  - Create `kit/mcp/job.ts`: `loadApp`, `listOps`, `fuzzJob`, `explainJob`, `runJobInProcess` (accepts a `defs` override for fixtures), and `kit/mcp/job-main.mjs` (JSON spec on stdin, one JSON line on stdout, stderr relayed).
  - `explainJob` replays with `simulate()`, checks `script` and `deliveries` against the replay (`stale-counterexample`), builds per-replica states, calls `explainTrace`, and returns `firstDifference` parsed from its text plus `agree`.
  - Tests (`kit/mcp/job.test.ts`, new, in-process): `listOps` returns sorted `{name, merge, intent, propsFile}` for both apps and `propsFile` is `null` when absent; `fuzzJob` on `item.tick` passes; `fuzzJob` unknown op lists valid names; `explainJob` on the wall-clock fixture counterexample names a first differing step with two replicas and different states; on the toggle fixture it returns `agree: true` and the failing property; an edited `script` returns `stale-counterexample`; a broken op module (temp registry) returns `import-failed` with the message.
  - Run `node kit/mcp/job-main.mjs` by hand with a `list_ops` spec from `/tmp` and confirm one JSON line.
  - _Requirements: R3.1 to R3.3, R3.4 (job side), R4.5, R6.1 to R6.5, R8.5, R8.6_

- [x] 5. Server: `list_ops`, `fuzz_op`, `explain_trace`
  - Create `kit/mcp/tools.ts` (`createServer({root, runJob?, logPath?, killMs?})`) and `kit/mcp/server.mjs` (root from `import.meta.url`, `StdioServerTransport`).
  - `tools.ts`: zod input schemas (`app` as string, validated in the handler for the R3.4 message), `orderings` clamp with `requested` and `clamped`, `replicas` 2..5 check, default `runJob` spawning `node kit/mcp/job-main.mjs` with `cwd = root`, soft deadline 50,000 ms passed to the job, hard kill at `killMs` (58,000), structured errors, every handler in `try/catch`, results as `content` text plus `structuredContent` (`pass` at the top level for `fuzz_op`), stdout untouched.
  - Tests (`kit/mcp/server.test.ts`, in-memory transport with `createServer`): the four tools are listed; `list_ops` real child; unknown app message names both apps; `fuzz_op` with an injected in-process job on `tick-toggle` and `lww-wallclock` fixtures returns counterexamples; same call twice is equal; `explain_trace` on the returned counterexample names the first differing step; stale counterexample is a structured error; `orderings: 99999` reaches the job as 5000 with `clamped: true, requested: 99999`; `replicas: 1` and `replicas: 6` are `bad-argument`; an injected job that never resolves returns `timeout` with `killMs: 200`; an injected job that throws returns `job-crashed` and the server still answers the next call.
  - _Requirements: R1.1, R1.5, R3, R4, R5, R6, R8_

- [x] 6. Server: `check_lint`
  - Add `check_lint` to `tools.ts`: resolve and contain the path, build the hook's stdin event, spawn `node kit/hooks/op-lint.mjs` with `LIMBO_ROOT` and a temp `LIMBO_HOOKS_LOG`, read the ledger row, parse stderr into `violations`, return `pass`, `result`, `exit`, `target`, `detail`, `violations`.
  - Tests (`server.test.ts`): a temp root with an `ops/x.op.ts` that calls `Date.now` returns `pass: false` and a `no-nondeterminism` violation, and the result equals what `kit/hooks/op-lint.mjs` itself reports for the same event (run the hook directly in the test and compare `result`, `detail`, `exit`); a good op file passes; a non-op file returns the hook's `not an op file` pass; `../../etc/passwd` and a missing file are structured errors and the hook is not spawned; `evidence/kiro/hooks.jsonl` has the same line count before and after.
  - Existing `kit/hooks/tests` stay green and unedited.
  - _Requirements: R7.1 to R7.6_

- [ ] 7. Evidence ledger
  - Add the per-call append to `tools.ts` (`finally`): `ts`, `tool`, `app`, `op`, `pass`, `runs`, `ms` to `LIMBO_MCP_LOG` or `<root>/evidence/kiro/mcp-calls.jsonl`; `null` for fields a tool lacks; an append error goes to stderr only.
  - Tests (`server.test.ts`): after one call of each tool plus one failing call, the temp ledger has exactly five lines, each with the seven fields and valid types; `fuzz_op` line has `pass` and `runs`; `list_ops` line has `pass: null`; an unwritable ledger path does not change the tool result.
  - Confirm no test writes `evidence/kiro/mcp-calls.jsonl` (check the file is absent or unchanged after `pnpm test`).
  - _Requirements: R9.1 to R9.5, R8.7_

- [x] 8. Stdio and cwd tests
  - Tests (`server.test.ts`, spawn `node kit/mcp/server.mjs` with the SDK `StdioClientTransport`, `LIMBO_MCP_LOG` set to a temp file): from the repo root, `fuzz_op` on `item.tick` with `orderings: 100` returns `pass: true`, `runs: 100`; from `cwd = os.tmpdir()`, `listTools` returns the four tools and `list_ops` for both apps returns the same ops as from the repo root; the server's stdout carries only MCP frames (the client does not error on a bad frame).
  - Test (`kit/mcp/clean.test.ts`, new): grep `kit/mcp/*.ts` and `*.mjs` for `console.log` and `process.stdout.write`; none outside `job-main.mjs`'s single reply line.
  - _Requirements: R1.2 to R1.4, R4.2, R11.1, R11.2, R11.6_

- [ ] 9. Mutation and gate checks
  - Test (`server.test.ts`): loop over every fixture in `kit/props/bad/index.ts` that has a `def`; `fuzz_op` via the injected job returns `pass: false` and names a property in `expectFails` (fixtures with `golden` only are skipped and listed by name in the test output).
  - Run `node kit/scripts/gate-integrity.mjs --write`, then `node kit/scripts/gate-integrity.mjs` (exit 0). Confirm the manifest lists `kit/props/engine.ts`, `kit/mcp/*` and the agent file.
  - Existing `mutants.props.test.ts`, `golden.props.test.ts` and `suite.props.test.ts` run unchanged and green.
  - _Requirements: R2.5, R10.5, R11.7, R11.8_

- [ ] 10. Smoke script, final run, measured count
  - Create `kit/scripts/mcp-smoke.mjs` as designed (temp ledger, expects the four tool names and at least one op from `list_ops`, exit 0 or 1).
  - Run `node kit/scripts/mcp-smoke.mjs`; confirm exit 0.
  - Run `pnpm -s typecheck && pnpm -s test && pnpm -s props`; record the measured test counts (files and tests, per project) and the smoke result in `evidence/kiro/convergence-mcp.md` with the date. Numbers come from that run only. Wording: "measured, property-tested".
  - Run the smoke script once from `/tmp` (`node <repo>/kit/scripts/mcp-smoke.mjs`) and note the exit code.
  - _Requirements: R11.9, R11.10_
