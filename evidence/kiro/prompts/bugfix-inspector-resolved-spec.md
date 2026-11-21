Create a Kiro **bugfix spec** named `bugfix-inspector-resolved` under `.kiro/specs/bugfix-inspector-resolved/`: `bugfix.md` (Current
Behavior / Expected Behavior / Unchanged Behavior, with "WHEN … THEN the system SHALL CONTINUE TO …" clauses for the unchanged part),
`design.md` (root cause, fix approach, the tests that show the bug exists, that the fix works, and that unchanged behaviour still
holds) and `tasks.md`. Write only those three files. Do not implement anything yet. Do not run git.

## The defect (found by the BASECAMP e2e during review; not staged)
Requirement R10.8 of `.kiro/specs/basecamp/requirements.md` (and the limbo-layer Inspector requirement): after the lake scene, replica
A's Inspector **Conflicts** section must list **both** resolved twins and the rule that decided each — the tent (`resurrect`, resolved
by A's own Keep) and the stove claim (`claim-one`, resolved by B's OK, which reaches A through the link). Resolved conflicts stay
listed "until the next exchange".

Actual: A lists only the tent twin it resolved itself. `useLimbo` in `skeleton/src/limbo/shell.tsx` (the `seen` map, roughly lines
117-175) marks conflicts resolved when they leave the materialized set and **purges every resolved entry on each crossing event**,
before the crossing's own ops are reflected — so a conflict that an *incoming* op resolves is dropped in the same crossing that
resolved it and is never shown as resolved. `apps/basecamp/src/views/lake-scene.test.tsx` and `e2e/basecamp-offline.spec.ts`
(lines ~199-201, comment "KNOWN GAP (R10.8)") currently assert the defective behaviour.

## Expected
A conflict resolved by an op that arrives in crossing N stays listed as resolved (with its rule) until crossing N+1 completes; a
conflict resolved locally behaves as today. Both test files assert the specified behaviour (both resolved twins on A), and the
"KNOWN GAP" comments are removed.

## Unchanged (examples; add any others the code shows)
Twins still appear only from materialized conflicts; the FIXED stamp, fog, wisps, crossing counts and chip strings are unchanged;
Recent exchanges still lists the last 3 completed exchanges; a re-twinned conflict (concurrent different resolves, Keep ‖ Delete)
still shows as an open twin, not as resolved; no timer drives any of this.

Keep tasks small (a failing test first, then the fix, then the e2e update), numbered, each ending with
`pnpm typecheck && pnpm test && pnpm props` green and the e2e task also `pnpm e2e`.
