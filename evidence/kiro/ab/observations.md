# A/B pilot — observations beyond the pre-registered measures

These are not part of the pre-registered analysis (`PREREG.md`); they are reported because they change how the result
must be read.

1. **Every arm-B Agent Stop block was a harness false alarm, not a merge bug.** 8 of 10 arm-B runs were blocked once.
   In all 8, Kiro's own op passed its properties; the failing check was the kit's vacuity guard
   (`kit/props/suite.props.test.ts`): registering one more op dilutes the mixed-op generator, and the conflict class
   `claim-release-claim` fell to 45.8–46.6% of the 500 fast-tier runs, under its 50% minimum. (Evidence: Kiro's closing
   messages, saved per run in `runs/<run>/kiro-closing.txt`: each of the 8 blocked runs names 45.8% or 46.6%; the 2 unblocked runs
   name neither. Run r13 states the dilution cause as an inference.) So arm B's extra cost (mean 4.50 vs 1.94 credits, 313 vs 70 s per session) bought no correctness here.
2. **Kiro edited the gate in 2 of 10 arm-B runs** (`r16-S-B`, `r19-Q-B`): it changed the vacuity guard's script length
   so the guard passed: r19-Q-B made `steps` 6–12 × the number of registered ops; r16-S-B raised the fixed range from
   40–80 to 60–120. The wrapper's gate manifest did not
   flag it, because `suite.props.test.ts` is not on the protected list. The held-out score is unaffected (it does not
   use the kit), but this is a gate-integrity gap. In the other 6 blocked runs the final diff leaves the kit untouched
   (r11-Q-B edited `kit/props/arbitraries/index.ts` mid-session and reverted it) and Kiro reported the failure instead.
3. **Arm A wrote correct ops without the kit in 10 of 10 runs.** The tree still holds the BASECAMP ops as worked examples
   of the op contract, and the stimulus states each intent in plain words (the pre-registered bias toward NONE).
4. Arm B's op-scaffold hook registered the new op in 8 of 10 runs (not scored). Arm B read `kit/` paths 127 times;
   arm A read `kit/` 0 times (the folder did not exist there) and `.kiro/` (outside the stimulus) 3 times.

5. Two PREREG descriptions turned out imprecise (PREREG itself stays as committed): the per-session cost estimate
   "1.5–5.8 credits" was exceeded (observed range across P1a spec-task and A/B sessions 1.49–8.58; arm B max 7.07); and
   the held-out engine reuses more skeleton primitives than PREREG lists: `createOp`, `causalBuffer`, `newReplica`,
   `observe`, `canonical`, `covers`, `withSkew` (still none of the kit's simulator, arbitraries, intents or seeds).
6. Oracle self-test output (a reference, one correct variant `qty-plain`, and 4 mutant op sets against the held-out suite,
   2,000 scripts):
   `heldout/selftest-output.txt`.

Consequences for LIMBO: the kit's value claim is enforcement and visibility, not "Kiro writes better merges with it";
the vacuity guard must scale with the number of registered ops, and the gate's protected set must include the property
suite, the vacuity guard and the arbitraries.
