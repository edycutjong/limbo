Kit revision: the guard hooks must fail closed, and the MCP server must bound its jobs. Found in an architecture review; each item was
checked against the code.

`kit/hooks/guard-shell.mjs` and `kit/hooks/lib.mjs`:
1. Malformed or empty event JSON, or a missing / non-string `tool_input.command`, currently becomes an empty command that is allowed
   (`readEvent` returns `{}`; `String(ev.tool_input?.command ?? '')`). Deny instead (exit 2, a clear reason). An exception inside the
   guard body currently exits 0 through `runHook`'s catch; for guard-shell it must deny. Logging-only hooks keep today's behaviour.
2. A heredoc that feeds a shell (`sh`, `bash`, `zsh`, `dash`, `ksh`, also behind `env`, `command`, `exec`) or `eval` / `source` / `.`
   is executed, but its body is skipped by the parser (`sh <<'EOF'` + `git commit` + `EOF` is allowed today). Parse such bodies as commands.
   In an unquoted heredoc (delimiter not quoted), parse `$(...)` and backtick substitutions in the body as nested commands.
3. A command word built by substitution or expansion (`$(echo git) push`, `` `echo git` push ``, `$G push`, `${G} push`) is checked as the
   placeholder `x`, so it passes. Deny a command whose command word is not a literal.
4. Nested `sh -c` / `eval` inspection stops at depth 4 and then allows; deny past the limit instead.
5. Keep every current allow: a quoted-delimiter heredoc whose text merely mentions "git push" and is written to a file with `cat > f <<'EOF'`
   stays allowed (that false positive was fixed once already); ordinary `pnpm`, `node`, `npx vitest` commands stay allowed. Policy
   (what is denied: git writes, gh, vercel, publish, rm -rf of / or ~) is unchanged.

`kit/hooks/stop-gate.mjs`:
6. When the fast tier fails, the block decision must reach stdout even if the per-session state file cannot be read or written
   (today a write error is caught by `runHook` and the hook exits 0 without blocking). Write the decision with a synchronous write
   (`fs.writeSync(1, …)`) before exiting; a state error is recorded in the row's detail and still blocks.

`kit/mcp/tools.ts`:
7. `check_lint` on a path that is not an op file (does not match the op-file pattern) or does not exist returns an error result with
   `pass: false`, not the hook's "not an op file" pass; pass the resolved real path to the child.
8. `explain_trace` counterexample inputs get the same bounds as `fuzz_op` (integer `steps` within the harness range, integer `replicas`
   2..5, integer seeds), rejected before any job is spawned.
9. The job deadline aborts with SIGTERM only; escalate to SIGKILL after a short grace, and cap captured stdout and stderr (for example
   1 MB each; exceeding it fails the job with a clear error).

Tests for every item (including the allowed cases in 5). Add any new file to the protected list in `kit/scripts/gate-list.mjs`. Run
`pnpm typecheck && pnpm test && pnpm props` until green, then `node kit/scripts/gate-integrity.mjs --write` and `pnpm gate`. Report the
measured counts. Do not run git. Do not run `pnpm e2e` or `pnpm props:full`.
