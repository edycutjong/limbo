# A/B pilot — pre-registration

This file is committed **before run 1**; its commit time is the pre-registration. Results go to `results.json` and
`summary.md` in this folder and are published whatever they show. This is a **pilot**: 20 sessions, too few to call a
small difference.

## Question
Does the LIMBO Kiro kit (steering, hooks incl. the Agent Stop property gate, custom agents, the property harness in `kit/`)
change how often Kiro's merge ops fail a held-out convergence + intent suite?

## Frozen state
- Frozen commit: `5dd6e7a159f1af20c06985e779eb01936054b8e2` (the commit before this file's commit). Every run copies the repo at this commit.
- Kit freeze at that commit: `.kiro/` git tree `04f984058d15563ee906603da107ed0cbe9b8145`, `kit/` git tree `35849113b14d7a4c272ac30e34b2be354b7bf218`;
  sha256 of `git ls-files -s <dir> | awk '{print $2, $4}'` (blob id + path): `.kiro/` `ad07277b25f5d7769ee72445586776d40a9c1003c00175c0a3ef59a20a8b684b`, `kit/` `b3c08a38c741fb16c75a095ab5570d2541313107d671652f13cd53996ae08c33`.
- Kiro CLI `kiro-cli 3.3.0`, auto-update disabled for the window (`app.disableAutoupdates`, restored after the last run).
  Model setting `auto` in both arms (the CLI does not pin one); the model as reported is recorded per run.

## Stimulus (identical in both arms)
- Fixture `fixture/` (copied into each run's workspace): `apps/_ab/` (stub model: `Item.qty`, `Severity`, `SEVERITIES`) and
  the spec `.kiro/specs/ab/{requirements,design,tasks}.md`. The stimulus spec is hand-written by the orchestrator, not by
  Kiro, so both arms get the same text; it states each op's intent in plain words and the module contract (exports).
  sha256: requirements.md `234104d8…8c04`, design.md `d2ee30ee…8e6c` (full hashes in `stimulus.sha256`).
- Two ops: **Q** `item.adjustQty` (task 1: concurrent +1/−1 adjustments are never lost) and **S** `sector.report`
  (task 2: a concurrent report never lowers a sector's severity; a re-inspection that has seen a report may).
  Reason for these ops instead of the runbook's "claim item" + "split expense": the frozen skeleton already ships
  `claim-one`, and `sum-split` is a named skeleton rule, so those would measure combinator reuse.
- Prompt, verbatim: `Run task 1 of the ab spec only.` (Q) / `Run task 2 of the ab spec only.` (S).

## Arms
- Both arms: a fresh copy of the frozen commit per run (`/tmp/limbo-ab/<run>/`, its own throwaway git baseline), with
  `evidence/`, `.kiro/specs/merge-kit/` and this runner (`kit/scripts/ab-run.mjs`, it describes the scoring) removed
  and the fixture added. Surface: headless `kiro-cli chat --v3`,
  **built-in `--agent spec`** in both arms (the surface that builds the product; it loads workspace steering — confirmed by
  `steering_inclusion` events in P1a). Run through `kit/scripts/kiro-run.mjs` (started from the main repo with
  `LIMBO_RUN_ROOT`), **without `--verify` / `--relaunch`** in both arms: one session per run; the only repair loop is the
  kit's own Agent Stop hook in arm B.
- **B (kit):** the copy as frozen: `.kiro/steering`, `.kiro/hooks`, `.kiro/agents`, `.kiro/settings`, `kit/`.
- **A (no kit):** the same copy minus the treatment: `.kiro/steering`, `.kiro/hooks`, `.kiro/agents`, `.kiro/settings`,
  `kit/`, and the BASECAMP property bindings (`apps/basecamp/src/ops/*.props.ts`, `*.props.test.ts`) that import `kit/`.
- Every Kiro read of a `kit/` or `.kiro/` path (outside `.kiro/specs/ab/`) is counted from the raw stream and reported.

## Order and N
- **N = 5 runs per op per arm = 20 sessions**, order fixed in `order.json`: Q runs A B B A A B B A A B, S runs
  B A A B B A A B B A, interleaved Q S Q S …. (Measured spec-task cost 1.5–5.8 credits ⇒ 20 × ≤ 5.8 < 300, and more than
  6 h of the P1a window remain, so N stays 5.)
- Budget: ≤ 80 credits for the A/B. The runner stops before a run once the A/B total exceeds 80; runs not done are
  reported as not run (never imputed).

## Isolation (K9)
For the whole window, identically for both arms: `~/.kiro/settings/mcp.json` backed up and every server disabled;
`~/.kiro/skills` moved aside; restored right after the last run (and at the next phase start after a crash). Kiro Memory
is Off (the default; no setting stored), verified per run from the stream (`memory.tokens`).

## Scoring (held-out, written before run 1, kept outside both workspaces during the runs)
- Suite: `engine.ts`, `golden.ts`, `heldout.test.ts`, `vitest.heldout.config.mjs` (sha256 in `heldout.sha256`; committed
  to `heldout/` after the last run). It is copied into a run's workspace only after the Kiro session ends.
- It imports the op module **by path** (`apps/_ab/src/ops/<op>.op.ts`), so registration is not scored ("registered" is
  reported separately).
- Independent script engine: 3 replicas, skewed clocks (±1–6 h), random partial syncs; each new op's payload is built by
  the module's payload function from the creating replica's **current** state (as a UI would); every replica replays
  every op in its own random causal order with duplicates, and after **every** delivery each target's selector must equal
  an oracle computed from the applied op set: Q = sum of all applied adjustments; S = highest severity among applied
  reports not superseded by a report that saw them (`covers`). It reuses only the skeleton's `createOp`, `causalBuffer`,
  `covers` and `withSkew` — not the kit's simulator, arbitraries, intents or seeds.
- 10,000 scripts per op; seeds `90000001…` (Q) and `91000001…` (S), disjoint from the kit's (`20251031 + i`).
- Golden histories (hand-written, two replicas): Q — concurrent +1/+1 → 2; +3 seen then −1 → 2, untouched item 0;
  synced 5 then concurrent −1/+2 → 6. S — concurrent major/minor → major; critical seen then minor → minor, unreported
  `none`; synced major then concurrent none/critical → critical.
- Oracle validated before this commit (2,000 scripts): a reference implementation and a plain `qty += by` pass;
  read-modify-write qty, Lamport-LWW severity, max-ever severity and wall-clock-LWW severity each fail.
- **A run fails** if the op file is missing, `pnpm typecheck` fails in the run's workspace, or any golden history or
  any of the 10,000 scripts fails.

## Report (`results.json`, `summary.md`)
- Fail counts per arm per op (k / n) and pooled per arm, 95% Wilson intervals, two-sided Fisher exact p (pooled arms).
- Arm B: Agent Stop blocks, the stop-gate's first verdict beside the final held-out result (B's number includes repair
  turns: the question is the whole-kit intervention, repair included); hooks fired by type.
- Credits and wall time per session per arm; model as reported; kit/.kiro reads per arm; registration per arm.
- **Classes** (a = arm A fail rate, b = arm B fail rate; first match wins): **NEGATIVE** if b > a · **NONE** if a = 0 or
  a = b · **STRONG** if a ≥ 30% and b ≤ 10% · **WEAK** otherwise. Class names are internal bins; judge-facing copy gives
  the counts, the interval and p, never "strong" or "significant". NONE/NEGATIVE → no page may claim the kit improves
  Kiro's correctness.

## Threats to validity
Small N (pilot); arm B gets extra turns from the Agent Stop hook (credits reported per arm); `auto` model routing may vary
run to run; the held-out engine shares the skeleton's op creation and causal buffer with the kit (mitigated: own engine,
own oracles, disjoint seeds, state-derived payloads, per-delivery checks); stating the intent in plain words in both arms
helps arm A and biases toward NONE — kept deliberately, because a real builder states intent too; the stimulus spec is
hand-written (not Kiro-authored) so both arms get identical text; arm A also loses the BASECAMP property bindings (they
import `kit/` and would break typecheck).

## Mechanics checks before this commit (not runs, not scored)
- Runner dry runs with no Kiro session (reference op dropped in; LWW mutant dropped in) to check copy, typecheck and
  scoring in both arms.
- One Kiro smoke session in a throwaway copy with a neutral prompt (`Reply with the single word ok. Do not use any
  tools.`), 0.34 credits, to check that headless Kiro runs outside the main repo.
