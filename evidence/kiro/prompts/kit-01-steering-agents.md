You are setting up the Kiro kit for LIMBO, a local-first skeleton in this repository (a pnpm workspace: `skeleton/`, `apps/basecamp/`,
`apps/aftershock/`, `kit/`, `evidence/`). Write the files listed below and nothing else. Do not run git. Do not install packages.

## What LIMBO is (for product.md)
"When the connection dies, your app crosses over, keeps working on the other side, and comes back without silently losing an edit."
A lean local-first skeleton where every operation (op) declares how it merges, plus offline UI states bound to the real sync state
(fog = this replica is partitioned or holds unsynced ops; wisps = queued op count; twins = surfaced conflicts; the Limbo inspector
lists queued ops and the merge rule each declares). Two distinct apps are built from the one skeleton, in two folders:
BASECAMP (a group trip list: items, claims "I'll bring it", ticks, reorder, shared expenses) and AFTERSHOCK (a field form whose
sector reports merge into a shared grid; demo data only, no field use claimed). Who benefits: the people whose shared list or form
breaks when the signal does, and the builders who need offline merges that do not diverge.
Wording rules for every page and comment: convergence is "measured, property-tested", never "proven" or "guaranteed"; offline
claims are provisional and the declared rule picks one claimant deterministically on reconnect (no CRDT prevents two offline
people claiming the same thing); every number comes from `evidence/`.

## Stack and commands (for tech.md)
TypeScript strict, pnpm 10 workspace, Node 22, Vite + React static SPAs (later), Yjs 13.6.33 + y-indexeddb 9.0.12 as the replicated
op-log store behind one adapter (`skeleton/src/sync/store.ts`; the library only stores and moves the grow-only op log, every merge
rule is LIMBO's), fractional-indexing 4.0.0, fast-check 4.10.2, Vitest 3 (projects `unit` = `*.test.ts`, `props` = `*.props.test.ts`),
Playwright 1.59 (two browser contexts, `context.setOffline`). Commands: `pnpm typecheck`, `pnpm test`, `pnpm props`, `pnpm e2e`.

## Layout (for structure.md)
`.kiro/` (steering, hooks, agents, specs, settings — at the repo root, never gitignored) · `skeleton/src/core` (op types, named
merges, causal buffer, `simulate.ts`) · `skeleton/src/sync` (replica, links, store) · `skeleton/src/limbo` (Fog, Wisps, Twin,
Inspector, ReplicaPair, ShuffleTest) · `apps/<app>/src/ops` (`*.op.ts` one op per file, `*.props.ts`, `registry.gen.ts` generated) ·
`kit/hooks/*.mjs` (hook scripts) · `kit/props/` (`run.ts` runner, `config.ts`, `intents.json` intent manifest, `intent/` kit-owned
intent properties, `bad/` mutation fixtures, `golden/` golden histories, `arbitraries/` op generators) · `kit/mcp/server.mjs` ·
`kit/scripts/` (`kiro-run.mjs` wrapper) · `e2e/` · `evidence/` (measured runs; `evidence/kiro/{sessions,hooks}.jsonl` ledgers).
An app supplies five things to the skeleton: its model (entities), its ops (`*.op.ts`), its seed op script, its views, its config.
Skeleton budget (provisional): ≤ 30 files, ≤ 1,800 TS/TSX lines excluding tests, CSS and tokens, ≤ 15 exports.

## The op contract (for local-first.md — the heart of the kit)
```ts
type ReplicaId = string;                              // random at creation, never inside a reducer; the in-page pair uses fixed ids `a` / `b`
type Stamp = { l: number; r: ReplicaId; n: number };  // l = Lamport counter, n = per-replica counter; total order by (l, r, n)
type VV = Record<ReplicaId, number>;                  // version vector: highest contiguous n applied per replica
interface Op<P = unknown> { id: string /* `${r}:${n}` */; op: string; target: string; payload: P; stamp: Stamp; deps: VV }
type Intent =
  | { kind: 'set'; field: string }                    // field := value (ticks are this — never a toggle)
  | { kind: 'delta'; field: string }                  // field += n (counts, quantities)
  | { kind: 'add-remove'; field: string }             // set membership; an add concurrent with a remove survives
  | { kind: 'max'; field: string; order: string[] }   // monotone until an observing clear (severity)
  | { kind: 'claim' } | { kind: 'life' } | { kind: 'split' } | { kind: 'move' } | { kind: 'create' };
type Merge = 'commutes' | 'causal-lww' | 'resurrect' | 'claim-one' | 'sum-split' | 'ordered-move';
interface OpDef<S, P> { name: string; merge: Merge; intent: Intent; apply?: (s: S, op: Op<P>) => S; invariant?: (s: S) => true | string }
```
Creating an op (outside any reducer): `l = 1 + max(l seen)`, `n = ++counter`, `deps = current VV`. `covers(x, y)` ⇔
`x.deps[y.stamp.r] ≥ y.stamp.n`; x and y are concurrent iff neither covers the other. Stamps compare by `l`, then `r` (UTF-16
code-unit order, never `localeCompare`), then `n`. Among concurrent ops the stamp order is a deterministic tie-break, not "who was first".
Rules: (1) no wall clock, randomness, locale or replica-local state in a reducer (`Date.now`, `new Date`, `performance.now`,
`Math.random`, `crypto.randomUUID`, `toLocale*` are banned in op files) — causal context (`deps`, `stamp`) only; (2) every op either
`commutes` (and ships a property proving it) or names a rule, AND declares its `intent`; the intent must match the op's entry in
`kit/props/intents.json`; (3) LWW is a choice, not a default — write the intent in one sentence first ("two people adding a canister
offline must both count"); (4) never toggle — set an explicit value; (5) money in integer cents, splits by the `sum-split` rule;
(6) apply must be idempotent; (7) a conflict the user should see becomes a twin, never a silent drop. Use the live file reference
`#[[file:skeleton/src/core/merges.ts]]` (the file will exist after the merge-kit spec).

## Worked counterexamples (for ops-guide.md)
Four wrong ops and the property that catches each: toggle tick (`ticked = !ticked`; caught by the `set` intent property "concurrent
writes of the same value give that value"), read-modify-write quantity (`qty = seen + 1`; caught by `delta` "field = initial + Σ
deltas"), `Date.now()` tiebreak (caught by causal dominance under per-replica skewed clocks: a write that has seen another always beats
it), float split (`amount / k` in floats; caught by `split` "Σ shares = amount, integer cents"). For each: the wrong code, why it
converges on the wrong answer, the right code.

## Testing rules (for testing.md)
Convergence alone is not enough (a toggle converges on the wrong answer) — the kit-owned intent properties catch it. Write any
op-specific invariant from the requirement before the op. Run the fast-tier properties before finishing. Never weaken a property,
skip it, or lower `numRuns` to pass; a property change needs a spec change. The vacuity guard (each conflict class must actually occur
in the generated runs) and the mutation check (every fixture in `kit/props/bad/` must fail at least one property or golden history)
are not optional.

## Files to write
1. `.kiro/steering/product.md`, `.kiro/steering/tech.md`, `.kiro/steering/structure.md` — front matter `inclusion: always`.
2. `.kiro/steering/local-first.md` — front matter `inclusion: always`; the op contract and rules above, concise.
3. `.kiro/steering/ops-guide.md` — front matter `inclusion: fileMatch` with `fileMatchPattern: ["**/ops/**", "skeleton/src/core/**"]`.
4. `.kiro/steering/testing.md` — front matter `inclusion: fileMatch` with `fileMatchPattern: ["**/ops/**", "**/*.props.ts", "**/*.props.test.ts", "kit/props/**"]`.
5. `.kiro/agents/limbo-builder.json` and `.kiro/agents/limbo-kitsmith.json` (Kiro CLI v3 custom-agent schema), with prompts in
   `.kiro/agents/prompts/limbo-builder.md` and `.kiro/agents/prompts/limbo-kitsmith.md` referenced as `"prompt": "file://./prompts/<name>.md"`.
   Both: `"resources": ["file://.kiro/steering/**/*.md"]`, `"includeMcpJson": false`, `"includePowers": false`,
   `"tools": ["read", "write", "shell"]`, and `permissions.rules` that deny shell `git *`, `gh *`, `vercel *`, `npm publish*`,
   `pnpm publish*`, and allow shell `pnpm *`, `node *`, `npx vitest *`, `npx playwright *`, `npx tsc *`.
   - `limbo-builder` builds ops and views: fs_write allow `skeleton/**`, `apps/**`, `e2e/**`, `kit/props/arbitraries/**`; fs_write deny
     `.kiro/hooks/**`, `.kiro/agents/**`, `kit/hooks/**`, `kit/props/intent/**`, `kit/props/bad/**`, `kit/props/golden/**`,
     `kit/props/intents.json`, `kit/props/run.ts`, `kit/props/config.ts`, `skeleton/src/core/simulate.ts`, `kit/mcp/**`, `evidence/**`.
     Its prompt: follow `local-first.md`; declare merge + intent first; write the op's invariant before the op; never edit the gate files.
   - `limbo-kitsmith` authors the kit: fs_write allow `.kiro/**`, `kit/**`; fs_write deny `skeleton/**`, `apps/**`, `evidence/**`.
     Its prompt: it maintains steering, hooks, agents, the property harness, golden histories and mutation fixtures; it never writes
     product code.
   (Leave `mcpServers` out for now; the MCP server is added later.)

Keep every steering file short and concrete (each under ~80 lines). When done, list the files you wrote.
