Check the ops whose creation path changed in the `bugfix-arch-review` spec, using the `limbo-convergence` MCP tools (not shell commands).
Read-only session: do not edit any file and do not run git.

1. `list_ops` for `basecamp` and for `aftershock`.
2. `fuzz_op` with `orderings` 500 and `replicas` 3 for: `basecamp` `item.add`, `basecamp` `item.move`, `basecamp` `expense.add`,
   and `aftershock` `sector.count`.
3. `check_lint` on `apps/basecamp/src/ops/item.move.op.ts` and `apps/basecamp/src/ops/expense.add.op.ts`.
4. If any `fuzz_op` returns a counterexample, call `explain_trace` on it and report the trace; otherwise say that none was found.

Finish with a short table: tool, arguments, pass or fail, and the numbers each tool returned (runs, failures, vacuity share).
