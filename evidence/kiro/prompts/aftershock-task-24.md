Run task 24 of the aftershock spec only, with these two changes to its text:
1. Do NOT run `pnpm props:full` yourself (it takes about 16 minutes and your previous attempt was killed by the 560 s session watchdog). The
   orchestrator already ran it twice and saved the evidence: `evidence/aftershock/props-full-run1-vitest-rpc-timeout.log` (all tests passed, but
   vitest reported one unhandled "Timeout calling onTaskUpdate" worker-RPC error, exit 1) and `evidence/aftershock/props-full-run2.log` +
   `evidence/convergence/full-2026-11-21-aftershock.json` (exit 0, 22 files, 320 passed, 9 skipped, 10,000 orderings, 3 replicas, seed 20251031,
   0 failures). Record both runs in the Adoption log section honestly, as run by the orchestrator, including the run-1 RPC timeout.
2. Delete `evidence/aftershock/props-full.txt` (the partial output of your killed run) and do not recreate it.
Also note: the live deploys exist (BASECAMP, AFTERSHOCK, landing under `site/`); mention only that `site/` is a new top-level folder outside `apps/aftershock/` that is not part of this task's adoption count.
