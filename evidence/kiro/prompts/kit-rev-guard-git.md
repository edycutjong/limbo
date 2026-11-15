Revision request for the kit's shell guard (finding from the G2 session).

In the merge-kit task 12 session the agent ran `git stash` and `git stash pop` to check whether failures pre-existed. The
`guard-shell` PreToolUse hook (`kit/hooks/guard-shell.mjs`) only denies commit, push, deploy and publish, so it allowed both.
In this repo Kiro sessions must never change git state: the orchestrator reviews the diff and commits.

Change `guard-shell` so that every `git` subcommand is denied except read-only ones: `status`, `diff`, `log`, `show`,
`ls-files`, `rev-parse`, `blame`, `grep`. That includes `stash`, `checkout`, `switch`, `restore`, `reset`, `clean`, `add`,
`rm`, `mv`, `merge`, `rebase`, `cherry-pick`, `revert`, `tag`, `branch` with arguments, `config`, `apply`, `am`, `fetch`,
`pull`, `clone`, `worktree`, `submodule`, `init`. Keep the existing denials. The deny message should tell the agent to
compare against `git diff` / `git show HEAD:<path>` instead. Avoid the known false positive: a heredoc or quoted string
whose TEXT mentions "git push" must not be denied (only real command positions count, including after `&&`, `||`, `;`, `|`,
`$(`, and `env`/`sudo`-style prefixes). Add selftests in `kit/hooks/tests/` for each denied subcommand, the read-only
allowlist, and the heredoc case. Then run `pnpm typecheck && pnpm test` and make them pass. Do not run git.
