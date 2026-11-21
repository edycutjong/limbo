Create a Kiro **feature spec** named `coverage-full` (requirements-first, EARS acceptance criteria) under `.kiro/specs/coverage-full/`:
`requirements.md`, `design.md`, `tasks.md`. Write only those three files. Do not implement anything yet. Do not run git.
Read `.kiro/steering/*.md`, `.kiro/specs/basecamp/` and `.kiro/specs/limbo-layer/` (for the style), `vitest.config.ts`, `kit/scripts/coverage-gaps.mjs`.

## Why
CI now runs `pnpm test:coverage`, which enforces **100% lines, statements, functions and branches** on the domain code: `skeleton/src/**` and each app's
non-view modules (`apps/*/src/**`, minus the exclusions listed with reasons in `vitest.config.ts`). Today lines and statements are at 99.96%, functions at
97.5% and **branches at 93.3%**: 103 gaps in 33 files. Run `pnpm test:coverage` then `pnpm coverage:gaps` to see every gap as `file: kind line N`.
The gaps are almost all small: a `?? default`, an `if` arm, an `onerror` handler, a destructuring default, a defensive throw.

## Rules (these are requirements)
1. Close each gap with a **test that exercises the behaviour** (a new or extended `*.test.ts` / `*.test.tsx` beside the module). Name each test after the
   behaviour it pins, not after the line it covers.
2. **Never** weaken, skip or delete an existing test, property, hook, vacuity check or the gate manifest. Never lower a threshold or add to the `exclude` list in
   `vitest.config.ts`. Do not touch `kit/` (kit-owned files are protected by the gate).
3. A branch that is genuinely unreachable (provably dead defensive code) is **removed** when behaviour is unchanged and a test or the types prove it dead; if it
   must stay (a guard against a corrupt store, an `onerror` handler), test it by injecting the failure. A `/* v8 ignore next */` comment is the last resort: it needs
   a one-line reason after it, and every one is listed in `design.md` under `## Ignored branches`. Target: zero.
4. Product behaviour does not change. If removing dead code is the only way, record the file and line delta in `design.md` under `## Production changes`.
5. Properties stay at their CI-sized tier; do not add slow tests (the whole `pnpm test:coverage` run must stay under 3 minutes).

## Tasks (each is one small, separately verifiable task; each ends with `pnpm typecheck && pnpm test && pnpm props` green and `pnpm coverage:gaps` showing zero
gaps for the files of that task)
1. Baseline: run `pnpm test:coverage`, record the gap counts per directory in `design.md`.
2. `skeleton/src/core/*` (causal, merges, simulate).
3. `skeleton/src/sync/*` (identity, inpage-link, link, replica, status, store, dev-relay-link).
4. `skeleton/src/limbo/*` (inspector, marks, pair-view, shell, shuffle-test, shuffle, twin).
5. `apps/basecamp/src/` non-op modules (actions, members, model, money).
6. `apps/basecamp/src/ops/*` (expense.add.op, expense.setAmount.op, expense.state, item.add.op, item.claims, item.life, item.move.op, item.rename.op, item.tick.op).
7. `apps/aftershock/src/` (model.ts, ops/sector.count.op, ops/sector.note.op, ops/sector.state).
8. Final: `pnpm test:coverage` exits 0 with every threshold at 100%, `pnpm coverage:gaps` prints "No coverage gaps.", record the final summary numbers in `design.md`.
