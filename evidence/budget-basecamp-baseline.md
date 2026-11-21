# BASECAMP skeleton baseline (before the basecamp spec edits)

Measured at task 1, before any change to `skeleton/`. Scope: `skeleton/src/**/*.ts` and `*.tsx`, excluding `*.test.ts`, `*.test.tsx` and `skeleton/src/limbo/test/`. CSS and tokens are not counted. Lines counted are non-blank and not comment-only (`//` lines and `/* ... */` blocks).

| Measure | Value |
| --- | --- |
| Files | 20 |
| Non-blank, non-comment lines | 2020 |

Command (run from the repo root):

```sh
find skeleton/src \( -name '*.ts' -o -name '*.tsx' \) ! -name '*.test.ts' ! -name '*.test.tsx' ! -path 'skeleton/src/limbo/test/*' | sort > /tmp/files.txt
wc -l < /tmp/files.txt
xargs cat < /tmp/files.txt | awk 'BEGIN{b=0} { l=$0; sub(/^[ \t]+/,"",l); if(b){ if(l ~ /\*\//) b=0; next } if(l=="") next; if(l ~ /^\/\//) next; if(l ~ /^\/\*/){ if(l !~ /\*\//) b=1; next } n++ } END{print n}'
```

Note: the provisional budget in `.kiro/steering/tech.md` is 1,800 lines; this baseline is above it. Later tasks report their delta against this file.

## Final measurement (task 22, 2026-11-21)

Same command, same scope.

| Measure | Baseline | Final |
| --- | --- | --- |
| Files | 20 | 21 |
| Non-blank, non-comment lines | 2020 | 2137 |

The delta (+1 file, +117 lines) comes from `sumSplit` in `merges.ts` and `sync/dev-relay-link.ts`. Both the baseline and the final figure exceed the provisional 1,800-line budget in `.kiro/steering/tech.md`.

## Owner decision 2026-11-21

Measured after the basecamp spec: 21 files, 2,137 non-blank, non-comment TS/TSX lines (command above). The provisional budget of
1,800 lines was exceeded at 2,020 (before the basecamp spec) and at 2,137 (after it). The owner raised the budget to 30 files and
2,400 lines (`.kiro/steering/tech.md`) instead of trimming working code. (Appended by the orchestrator; the Kiro kitsmith session
that applied the steering change cannot write under `evidence/`.)

## After bugfix-inspector-resolved task 2

Same command, same scope: 21 files, 2,142 non-blank, non-comment lines (+5 in `skeleton/src/limbo/shell.tsx`). No new file or export. Within the 30-file, 2,400-line budget.
