# Bugfix: Inspector drops a conflict that an incoming op resolved

## Introduction

`limbo-layer` R9.5 says a resolved conflict stays listed in the Inspector's Conflicts section, marked "resolved", until the next exchange. `basecamp` R10.8 applies this to the lake scene. Replica A's Inspector must list both resolved twins with the rule that decided each: the tent (`resurrect`, resolved by A's own **Keep**) and the stove claim (`claim-one`, resolved by B's **OK**, which reaches A through the link).

A lists only the tent. The stove twin is dropped in the same crossing that resolved it. The BASECAMP e2e found this during review. Two tests currently assert the defective result and carry a "KNOWN GAP (R10.8)" comment.

Wording: convergence stays "measured, property-tested". This fix changes presentation state only.

## Current Behavior (Defect)

1. WHEN a conflict is resolved by an op that arrives from the peer in crossing N THEN the system lists nothing for it: `useLimbo(id).resolved` does not contain it after crossing N, and the Inspector shows no "resolved" row for it.
2. WHEN replica A has resolved the tent twin itself and B's **OK** resolves the stove claim twin through the link THEN A's Inspector Conflicts section lists one row (the tent, `(rule: resurrect) resolved`) and not the stove row (`(rule: claim-one) resolved`).
3. WHEN a conflict is resolved by a local op THEN the system keeps it as resolved until the next crossing event. This part works.
4. `apps/basecamp/src/views/lake-scene.test.tsx` expects `items` to have length 1, and `e2e/basecamp-offline.spec.ts` expects only the tent row. Both comments say "KNOWN GAP (R10.8)". Both assert the defect.

## Expected Behavior (Correct)

1. WHEN a conflict is resolved by an op that arrives in crossing N THEN the system SHALL list it as resolved, with the rule that decided it, after crossing N completes, and SHALL remove it when crossing N+1 completes.
2. WHEN the lake scene has run to the resolved state THEN replica A's Inspector Conflicts section SHALL list both the tent (`resurrect`) and the stove claim (`claim-one`), each marked "resolved" with its rule.
3. WHEN a conflict is resolved by a local op THEN the system SHALL keep listing it as resolved until the next crossing event that follows, as it does today.
4. `lake-scene.test.tsx` and `e2e/basecamp-offline.spec.ts` SHALL assert both resolved twins on A (two rows, rules `resurrect` and `claim-one`), and the "KNOWN GAP" comments SHALL be removed.

## Unchanged Behavior (Regression Prevention)

1. WHEN the app's conflict descriptors list a conflict THEN the system SHALL CONTINUE TO show it as an open twin, and the twin set SHALL CONTINUE TO come only from the materialized conflicts (`describeConflicts(replica.state())`), never from the resolved list.
2. WHEN a conflict is resolved THEN the system SHALL CONTINUE TO leave `view.twins`, the chip strings (all five), the Wisps counter and crossing counts, the `FIXED` stamp and the fog states unchanged. The resolved list is presentation state and feeds no count, label or binding in limbo-layer R3 to R9.
3. WHEN exchanges complete THEN the system SHALL CONTINUE TO show the last 3 completed exchanges in Recent exchanges, newest first, with the same columns and `in`/`out` direction.
4. WHEN a conflict has been resolved and a concurrent different resolve brings it back (Keep ‖ Delete) THEN the system SHALL CONTINUE TO show it as an open twin and SHALL CONTINUE TO NOT list it as resolved.
5. WHEN a conflict has no resolved entry and no open twin THEN the Conflicts section SHALL CONTINUE TO read "No conflicts."
6. WHEN a crossing event occurs THEN the system SHALL CONTINUE TO bump `crossing = { seq + 1, k }` with `k` equal to the ops that crossing newly applied, and SHALL CONTINUE TO produce the same live-region announcements once each.
7. WHEN the Inspector or any view reads the store THEN the system SHALL CONTINUE TO return a referentially stable snapshot between changes, one `pair.view(id)` read per change, and SHALL CONTINUE TO remove every subscription on unmount.
8. WHEN time passes with no edit or crossing THEN the system SHALL CONTINUE TO leave the resolved list as it is. No timer drives it.
9. WHEN `skeleton/src/limbo/inspector.test.tsx` "keeps a resolved conflict until the next crossing, then drops it" runs THEN it SHALL CONTINUE TO pass unchanged.
10. WHEN the change is made THEN the skeleton SHALL CONTINUE TO stay within the budget in `tech.md` (30 files, 2,400 lines, 15 exports), and `index.ts` SHALL CONTINUE TO export the same names.
