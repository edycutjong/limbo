Add the Kiro-share metric script to the kit.

Write `kit/scripts/kiro-share.mjs` (plain Node, no dependencies) that reads `git log` of the current repository and writes
`evidence/kiro/share.json`:
- product commits = commits whose changed paths include anything under `skeleton/` or `apps/` (use `git log --format=... --name-only`
  or `git show --name-only` per commit; merges excluded);
- kiro commits = product commits whose message has a `Kiro-Session: sess_...` trailer;
- output `{ generated_from: "<HEAD sha>", product_commits, kiro_commits, share: kiro/product rounded to 4 places,
  claude_direct_commits: [ {sha, subject} ... the product commits without the trailer ] }`, keys in that order, pretty-printed.
- `--check` prints the same numbers to stdout and exits 0 without writing.
Add a root script `"share": "node kit/scripts/kiro-share.mjs"`, a unit test in `kit/hooks/tests/` or next to the script that builds a
throwaway git repo in a temp dir with three commits (one Kiro-trailered product commit, one plain product commit, one non-product
commit) and asserts product 2, kiro 1, share 0.5. The test may run git inside its temp dir only. Then run `pnpm typecheck && pnpm test`
and `node kit/scripts/kiro-share.mjs` once. Do not run git in the repository itself except read-only `git log` / `git show` /
`git rev-parse` from the script.
