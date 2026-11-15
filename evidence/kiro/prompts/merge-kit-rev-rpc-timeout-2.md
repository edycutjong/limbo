Revision request 2 for the merge-kit property harness (the first RPC-timeout fix was necessary but not sufficient).

After the async vacuity guard, `pnpm props:full` still passes all 143 tests and still exits 1 with
`[vitest-worker]: Timeout calling "onTaskUpdate"`. Remaining cause: `kit/props/suite.props.test.ts` runs 60 synchronous
property tests of ~6-8 s each back to back (437 s for the file at the full tier). Between tests Vitest only awaits promises
(microtasks), so the worker's event loop never reaches the timers/messages phase for the whole file; a worker->main RPC sent
early is answered but the answer is processed only after its 60 s timer has already fired.

Fix it without changing what is measured: make the props project yield one macrotask between tests, e.g. a setup file for the
`props` project in `vitest.config.ts` (`kit/props/setup.ts`) with `afterEach(() => new Promise((r) => setImmediate(r)))`, or an
equivalent yield at the start of every test that `runOpProperties` registers in `kit/props/run.ts`. Prefer the setup file (one
place, covers every *.props.test.ts). Do not change orderings, seeds, thresholds, step ranges or evidence files. Then run
`pnpm typecheck && pnpm test && pnpm props` and make them pass. Do not run git.
