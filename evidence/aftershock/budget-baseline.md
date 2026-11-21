# AFTERSHOCK skeleton baseline (before the aftershock spec edits)

Measured at task 1, before any change to `skeleton/` by this spec. Scope: `skeleton/src/**/*.ts` and `*.tsx`, excluding `*.test.ts`, `*.test.tsx` and `skeleton/src/limbo/test/`. CSS and tokens are not counted. Lines counted are non-blank and not comment-only.

| Measure | Value |
| --- | --- |
| Files | 21 |
| Non-blank, non-comment lines | 2142 |

Budget (`.kiro/steering/tech.md`): at most 30 files and 2,400 lines. Headroom: 9 files, 258 lines.

Command (run from the repo root; the same as in `evidence/budget-basecamp-baseline.md`):

```sh
find skeleton/src \( -name '*.ts' -o -name '*.tsx' \) ! -name '*.test.ts' ! -name '*.test.tsx' ! -path 'skeleton/src/limbo/test/*' | sort > /tmp/files.txt
wc -l < /tmp/files.txt
xargs cat < /tmp/files.txt | awk 'BEGIN{b=0} { l=$0; sub(/^[ \t]+/,"",l); if(b){ if(l ~ /\*\//) b=0; next } if(l=="") next; if(l ~ /^\/\//) next; if(l ~ /^\/\*/){ if(l !~ /\*\//) b=1; next } n++ } END{print n}'
```
