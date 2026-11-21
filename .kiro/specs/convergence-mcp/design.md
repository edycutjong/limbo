# Design: convergence-mcp

## Findings that shape the design

- `kit/props/run.ts` imports `vitest` (`describe`, `it`). Importing it from plain `node` throws, so the server cannot import it. The harness (`PROPS`, `checkRun`, `failingProperties`, `formatFailure`, `loadManifest`, `checkManifest`) has no vitest dependency of its own. Fix: move it to `kit/props/engine.ts` and have `run.ts` re-export it (R2). Only `run.ts` and `setup.ts` under `kit/props` import vitest today.
- Node 22.22 runs `.ts` files with type stripping, and the repo already imports with `.ts` extensions, so `server.mjs` can import TypeScript with no build step. Code that is stripped must avoid enums and parameter properties.
- ESM caches modules for the life of a process. Kiro edits an op and fuzzes it again in the same session, and the op's transitive imports (`model.ts`, `item.life.ts`) would stay stale in a long-lived server. So each call that loads app code runs in a fresh child process (a job). The parent stays small and cannot be broken by a bad op module.
- `.mjs` files have no types under the repo's strict `tsc`. The logic lives in `.ts` files that `tsc` checks. `server.mjs` is a few lines.
- `kit/mcp/` is already in the gate set (`GATE_ROOTS`) and denied to the builder agent for writes. `kit/props/engine.ts` is new and must be added to `GATE_FILES`.
- The `mcp-log` hook (matcher `@limbo-convergence`) reads a top-level `pass` from the tool response JSON. Tool text therefore carries `pass` for `fuzz_op` and `check_lint`.

## Layout

```
kit/props/engine.ts        harness without vitest (moved from run.ts); also fuzz()
kit/props/run.ts           re-exports engine; runOpProperties (vitest only)
kit/mcp/server.mjs         entry: stdio transport, createServer({root})
kit/mcp/tools.ts           createServer(opts): registers 4 tools, clamps, logs, spawns jobs
kit/mcp/job.ts             pure job functions: listOps, fuzzJob, explainJob (importable in-process)
kit/mcp/job-main.mjs       child entry: JSON on stdin -> job.ts -> JSON on stdout
kit/mcp/server.test.ts     tests (unit project)
kit/scripts/mcp-smoke.mjs  stdio smoke
.kiro/settings/mcp.json    server wiring
```

`tsconfig.json` `include` gains `kit/mcp/**/*.ts`. `kit/scripts/gate-list.mjs` gains `kit/props/engine.ts` in `GATE_FILES`.

## Call flow

```
Kiro --stdio--> server.mjs (root from import.meta.url)
   tools.ts: validate input (zod) -> clamp -> runJob(spec)
        runJob = spawn `node kit/mcp/job-main.mjs` (cwd = root, 58 s kill)
                 job.ts -> import registry.gen.ts, <op>.props.ts (fresh process)
                        -> engine.fuzz(def, opts, params) -> simulate() -> PROPS
   <- {content:[{type:'text', text: JSON}], structuredContent, isError?}
   tools.ts appends one line to evidence/kiro/mcp-calls.jsonl
```

`createServer({root, runJob?, logPath?})` takes `runJob` as an injection point. The default spawns the child. Tests inject an in-process `runJob` that calls `job.ts` directly with a fixture def, because the bad fixtures are not in any registry. The same `job.ts` code runs in both paths.

## Engine (`kit/props/engine.ts`)

Moved verbatim from `run.ts`: `MANIFEST_PATH`, `RunCheck`, `RunOptions`, `Failure`, `loadManifest`, `checkManifest`, `PROPS`, `PROPERTY_NAMES`, `formatFailure`, `checkRun`, `failingProperties`. `run.ts` becomes `export * from './engine.ts'` plus `runOpProperties` and its imports of `vitest` and `fast-check`. No property body changes, so R2.5 is checked by running the existing suite and diffing the `run.ts` export list.

One addition, `runOnce(def, simSeed, steps, opts)`: it calls `simulate()` once and returns `{res, failures}`. `checkRun` becomes `runOnce(...).failures`, same result as before. This lets `fuzz` see the `SimResult` (for the concurrent share and the counterexample) without simulating twice.

```ts
export interface FuzzParams { orderings: number; replicas: number; seed: number; deadlineMs?: number }
export interface FuzzResult {
  pass: boolean; runs: number; seed: number; truncated: boolean;
  vacuity: { concurrentShare: number; minShare: number; vacuous: boolean };
  counterexample?: Counterexample;
}
export function fuzz(def: OpDef, opts: RunOptions, p: FuzzParams): FuzzResult
```

`fuzz` does:

1. `checkManifest(def, opts.manifest ?? loadManifest())`. A failure is returned as `property: 'manifest'` with no script.
2. `fc.check(fc.property(arb, ({seed, steps}) => { ... }), {numRuns: orderings, seed, endOnFailure: false, interruptAfterTimeLimit: deadlineMs, markInterruptAsFailure: false})`. `arb` is the same `{seed: 0..0x7fffffff, steps: 2..14}` record `runOpProperties` uses, and `opts.steps` overrides the range the same way. The property calls `runOnce` with `config = {...defaultConfig, replicas, seed, orderings}`; a failure throws the first failing property's `reason`. fast-check shrinks `{seed, steps}` to the smallest failing pair.
3. Concurrent share: a counter in the property body. A run counts when `res.ops` has two ops with equal `target` and neither covers the other (`concurrent` from `causal.ts`). `concurrentShare = counted / runsExecuted`.
4. On failure, re-run `runOnce` on the shrunk `{seed, steps}` to build the counterexample (property name, `reason`, script, deliveries from `res.ops` and `res.orders`).
5. `runs` = `numRuns` reported by fast-check (runs executed, shrink attempts excluded). `truncated = result.interrupted`.

This is the same loop as `runOpProperties`, with `numRuns` and the seed as inputs, so a pass here means the same thing as a pass in `pnpm props` for that op and seed. The mixed-script properties (`kit/props/mixed.ts`) are not part of `fuzz_op`: they need every op of an app and run in the suite and the stop-gate.

Why `pass` ignores vacuity (R4.7): the kit's vacuity guard measures conflict classes over the mixed runs and fails the suite. A per-op share is a different, weaker number. Making `pass` depend on it would turn a small `orderings` request into a false failure. The result reports the number and a warning, and Kiro decides.

## `job.ts`

`loadApp(root, app)` imports `apps/<app>/src/ops/registry.gen.ts` and, per op, `<op>.props.ts` (`export const opts`), as `suite.props.test.ts` does. The child process is fresh each call, so no cache busting is needed. `job-main.mjs` reads one JSON spec from stdin, calls the matching function, writes one JSON line to stdout, and exits. Anything it prints that is not that line is ignored; its stderr is relayed to the server's stderr.

- `listOps({root, app})` returns `[{name, merge, intent: def.intent.kind, propsFile}]` sorted by name.
- `fuzzJob({root, app, op, orderings, replicas, seed, deadlineMs})` finds the def, calls `fuzz`.
- `explainJob({root, app, op, counterexample})` replays and explains (below).

`runJobInProcess(spec, overrides?)` is the exported function tests inject. `overrides.defs` replaces the registry lookup for a fixture def and its `opts`.

## Counterexample and `explain_trace`

```ts
interface Counterexample {
  property: string; reason: string;
  seed: number; steps: number; replicas: number;       // simulation seed, script length
  script: { id: string; op: string; target: string; payload: unknown; stamp: Stamp; deps: VV }[];
  deliveries: Record<string, string[]>;                 // replica -> op ids, duplicates included
}
```

`simulate()` is a pure function of `{defs, replicas, seed, steps, init, gen}`, and skew is drawn from the same seeded PRNG. So replay is: call `simulate` with the counterexample's `seed`, `steps`, `replicas`, the op's def and its `opts.gen`/`opts.init`. `explainJob` then:

1. Compares the replayed `ops` and `orders` with `script` and `deliveries` (canonical JSON). A mismatch returns error `stale-counterexample`: the op code or its generator changed since the counterexample was made.
2. Builds `states[replica][i]` from `res.trace` (`stateAfter` per delivery).
3. Returns `explainTrace(res)` text, and a structured `firstDifference: {step, replicas: [a, b], appliedOps, states} | null`. The structured form parses the `explainTrace` result; it does not recompute the rule.
4. Adds `agree: true` when the final states are equal. Then the failing property is an intent property, and the result repeats `property` and `reason`.

The `seed` stored is the simulation seed (`fc` seed for the run, `(cfg.seed + i)` is not used here), matching `formatFailure`'s "simulation seed".

## `check_lint`

`tools.ts` resolves `file` against root, rejects paths that escape it (`path.relative` starts with `..`) or do not exist, then runs:

```
node kit/hooks/op-lint.mjs
  stdin  {"file_path": <abs path>, "cwd": <root>}
  env    LIMBO_ROOT=<root>, LIMBO_HOOKS_LOG=<tmpdir>/hooks.jsonl
```

This is what the PostFileSave hook does. The server reads the one ledger row the hook wrote for `result`, `detail`, `target`, takes `exit` from the process, and parses stderr lines `op-lint <file>: [<rule>] <message>` into `violations`. The temp ledger keeps `evidence/kiro/hooks.jsonl` limited to rows from real hook events. `pass = (result === 'pass')`.

## Limits

| Limit | Value | Where |
|---|---|---|
| `orderings` | clamp 1..5,000, report `requested`, `clamped` | `tools.ts` |
| `replicas` | integer 2..5, else error `bad-argument` | `tools.ts` |
| job soft stop | 50 s, `interruptAfterTimeLimit`, `truncated: true` | `engine.fuzz` |
| job hard kill | 58 s, error `timeout` | `tools.ts` `runJob` |

The soft stop leaves 8 s for spawn, shrinking and reply. A truncated result is a pass over fewer runs, flagged, never presented as the requested count.

## Errors

```ts
{ isError: true, structuredContent: { error: { code, message, valid? } } }
```

Codes: `unknown-app`, `unknown-op`, `bad-argument`, `import-failed`, `stale-counterexample`, `file-outside-root`, `file-not-found`, `timeout`, `job-crashed`. Each handler body runs in `try/catch`; an exception becomes `job-crashed` (with the first stderr lines). The ledger line is appended in a `finally`.

## Evidence line

```json
{"ts":"...","tool":"fuzz_op","app":"basecamp","op":"item.tick","pass":true,"runs":500,"ms":812}
```

`ts` comes from `new Date().toISOString()` in `tools.ts`, which is not an op file and not a reducer. `pass` and `runs` are `null` for `list_ops`/`explain_trace` where they do not apply (`explain_trace` reports `pass: null`). Path: `LIMBO_MCP_LOG` if set, else `<root>/evidence/kiro/mcp-calls.jsonl`. `appendFileSync` after `mkdirSync`, wrapped so a write error only logs to stderr.

## Tool schemas (zod)

```
list_ops       { app: 'basecamp' | 'aftershock' }
fuzz_op        { app, op: string, orderings?: int, replicas?: int, seed?: int }
explain_trace  { app, op: string, counterexample: Counterexample }
check_lint     { file: string }
```

An enum or type mismatch is rejected by the SDK before the handler. The handler maps the remaining cases (range, unknown op) to structured errors. `app` as an enum yields an SDK-level validation message, so `tools.ts` declares `app` as `string` and validates itself, to give R3.4's message naming both values.

## Wiring

`.kiro/settings/mcp.json`:

```json
{ "mcpServers": { "limbo-convergence": { "command": "node", "args": ["kit/mcp/server.mjs"] } } }
```

`limbo-builder.json` adds `"mcpServers": { "limbo-convergence": { "command": "node", "args": ["kit/mcp/server.mjs"] } }`, appends `"@limbo-convergence"` to `tools`, and adds `"allowedTools": ["@limbo-convergence/list_ops", "@limbo-convergence/fuzz_op", "@limbo-convergence/explain_trace", "@limbo-convergence/check_lint"]`. `includeMcpJson` stays `false`, so the agent sees only this server. `description`, `prompt`, `resources`, `includePowers` and every `permissions.rules` entry are unchanged.

## Testing

`kit/mcp/server.test.ts` (unit project, so `pnpm test`):

| Test | Path |
|---|---|
| lists four tools; schemas present | in-memory transport |
| `list_ops` basecamp and aftershock; unknown app message | in-memory, real child |
| `fuzz_op` `item.tick`, 100 orderings, passes, `runs: 100` | stdio spawn, real child |
| `fuzz_op` on `tick-toggle` fixture fails with `intent:set` | in-memory, injected in-process job |
| `fuzz_op` on `lww-wallclock` fixture: counterexample; replay ends in different states per replica | in-memory, injected |
| same inputs twice give equal results | in-memory |
| `explain_trace` names a first differing step | in-memory, injected |
| `explain_trace` on edited counterexample gives `stale-counterexample` | in-memory |
| `check_lint` flags a temp op file with `Date.now`; `ledger` not touched | in-memory (temp root via `LIMBO_ROOT`-style `root` option) |
| `orderings: 99999` clamps to 5000 (checked with the injected job's received params, not by running 5,000) | in-memory |
| `replicas: 1` rejected | in-memory |
| timeout: injected `runJob` that never resolves, with a short test-only kill limit option | in-memory |
| ledger line per call, `LIMBO_MCP_LOG` temp file, fields present | in-memory |
| server starts with `cwd = os.tmpdir()` and answers `list_ops` | stdio spawn |
| gate: every `bad/` fixture still has `expectFails` and fails (existing `mutants.props.test.ts` stays green; not edited) | existing |

`createServer` takes `killMs` (default 58,000) for the timeout test. Fixtures are imported read-only from `kit/props/bad/index.ts`. Tests that spawn children set a 60 s timeout and keep orderings small.

`kit/scripts/mcp-smoke.mjs`: spawns `node kit/mcp/server.mjs` through the SDK's `StdioClientTransport` with `LIMBO_MCP_LOG` pointing at a temp file, calls `listTools` (expects the four names), calls `list_ops {app:'basecamp'}` (expects at least one op), prints a one-line summary, closes the client, exits 0. Any failed expectation prints the reason and exits 1.

## Risks

- A job costs one process start per call (a few hundred ms). That is accepted for fresh code. A long-lived worker with cache busting was rejected because transitive imports go stale.
- Type stripping prints an experimental warning on some Node 22 minors, on stderr only. R1.4 keeps stdout clean.
- `fast-check` is resolved from `kit/node_modules` (already present). If hoisting changes, add it to `kit/package.json` with the root's pinned `4.10.2`.
- Extracting the engine touches a gate file (`run.ts`). The gate manifest is rewritten only after the unchanged suite is green (task 1).
- The skeleton budget is unaffected: all new files are under `kit/`.
