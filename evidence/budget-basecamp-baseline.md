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
