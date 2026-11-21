Kit revision for the `aftershock` spec, task 6. The spec registers a second op `sector.unneed` (merge `commutes`, intent `add-remove` on `needs`),
so the kit's intent manifest must list it. Make exactly one change: in `kit/props/intents.json` add `"sector.unneed": { "kind": "add-remove" }`
next to `"sector.need"` (keep the JSON valid and the other entries untouched). `kit/props/manifest.test.ts` already expects 19 names including it.
Then run `pnpm -s typecheck && pnpm -s test && pnpm -s props` and report the result. Do not run git. Do not touch anything else.
