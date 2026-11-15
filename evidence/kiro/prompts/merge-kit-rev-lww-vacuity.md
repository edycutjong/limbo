Revision request for the merge-kit vacuity guard (review finding).

Requirement: the vacuity classes "concurrent causal-lww writes of equal and of different values" apply to every op whose merge is
`causal-lww`. In `kit/props/vacuity.ts` the `lww-equal` / `lww-different` classes are only computed for `item.rename`, so in
`evidence/convergence/full-2026-11-15.json` they report `n/a` although `item.tick` (merge `causal-lww`) is registered.

Change the classifier to look at every pair of concurrent ops on the same target whose op definitions declare `merge: 'causal-lww'`
and write the same field (same op name), and the applicability check so the classes apply whenever any registered op is `causal-lww`.
Make the generators produce those pairs often enough (equal AND different values) that each class passes the 50% share; do not lower
the threshold. Keep the existing unit tests and add cases for `item.tick` pairs. Then run `pnpm typecheck && pnpm test && pnpm props`
and make them pass. Do not run git.
