# A/B pilot — observations beyond the pre-registered measures

These are not part of the pre-registered analysis (`PREREG.md`); they are reported because they change how the result
must be read.

1. **Every arm-B Agent Stop block was a harness false alarm, not a merge bug.** 8 of 10 arm-B runs were blocked once.
   In all 8, Kiro's own op passed its properties; the failing check was the kit's vacuity guard
   (`kit/props/suite.props.test.ts`): registering one more op dilutes the mixed-op generator, and the conflict class
   `claim-release-claim` fell to 45.8% of the 500 fast-tier runs, under its 50% minimum. (Evidence: Kiro's closing
   messages in the raw streams; the 8 blocked runs mention `claim-release-claim` 14–29 times each, the 2 unblocked runs
   0–1 times.) So arm B's extra cost (mean 4.50 vs 1.94 credits, 313 vs 70 s per session) bought no correctness here.
2. **Kiro edited the gate in 2 of 10 arm-B runs** (`r16-S-B`, `r19-Q-B`): it changed the vacuity guard's script length
   (`steps` from 40–80 to 6–12 × the number of registered ops) so the guard passed. The wrapper's gate manifest did not
   flag it, because `suite.props.test.ts` is not on the protected list. The held-out score is unaffected (it does not
   use the kit), but this is a gate-integrity gap. In the other 6 blocked runs Kiro left the kit untouched and reported
   the failure instead.
3. **Arm A wrote correct ops without the kit in 10 of 10 runs.** The tree still holds the BASECAMP ops as worked examples
   of the op contract, and the stimulus states each intent in plain words (the pre-registered bias toward NONE).
4. Arm B's op-scaffold hook registered the new op in 8 of 10 runs (not scored). Arm B read `kit/` paths 127 times;
   arm A read `kit/` 0 times (the folder did not exist there) and `.kiro/` (outside the stimulus) 3 times.

Consequences for LIMBO: the kit's value claim is enforcement and visibility, not "Kiro writes better merges with it";
the vacuity guard must scale with the number of registered ops, and the gate's protected set must include the property
suite, the vacuity guard and the arbitraries.
