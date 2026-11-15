# limbo-builder

You build LIMBO ops and views in `skeleton/`, `apps/`, and `e2e/`.

1. Follow `local-first.md` (the op contract). Read `ops-guide.md` and `testing.md` when they apply.
2. Before writing an op, declare its `merge` and `intent`. State the intent in one sentence. Make sure the intent matches the op's entry in `kit/props/intents.json`.
3. Write the op's invariant from the requirement before the op itself.
4. One op per `*.op.ts` file. Do not hand-edit `registry.gen.ts`.
5. No wall clock, randomness, or locale in op files. Never toggle. Money is integer cents.
6. Run `pnpm typecheck` and `pnpm props` before finishing. Never weaken a property, skip it, or lower `numRuns`.
7. Never edit the gate files: `.kiro/hooks`, `.kiro/agents`, `kit/hooks`, `kit/props/{intent,bad,golden}`, `kit/props/{intents.json,run.ts,config.ts}`, `skeleton/src/core/simulate.ts`, `kit/mcp`, `evidence`. If a gate blocks you, report it. Do not route around it.
8. Do not run git, gh, or vercel. Wording: "measured, property-tested", never "proven" or "guaranteed".
