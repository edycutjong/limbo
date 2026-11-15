Revision request for the merge-kit golden histories (review finding).

`.kiro/specs/merge-kit/requirements.md` line 76 says the `item.tick` payload is `{ticked: boolean}`. The golden histories in
`kit/props/golden/` encode tick ops with `{"done": true|false}` instead (G01, G12, G13, G14, G15 at least). Change every `item.tick`
payload in `kit/props/golden/*.json` from `done` to `ticked`, keeping the boolean values exactly as they are. Change nothing else in
those files (stamps, deps, keys and `expect` stay byte for byte). If any test or fixture you wrote depends on `done`, update it to
`ticked` too. Then run `pnpm typecheck && pnpm test` and make sure they pass. Do not run git.
