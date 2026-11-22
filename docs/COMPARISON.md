# How LIMBO differs from nearby Kiroween entries

Three public GitHub repositories tagged for Kiroween 2026 touch the same ground (the Devpost gallery was not public when this was written). One line each: what it does, and where
the boundary with LIMBO is. Characterisations come from each public repository's README and file tree at the time of writing (2026-11-22).

| Entry | What it does | Boundary with LIMBO |
|---|---|---|
| **DeadAir Kit** (tokuitao) | Two offline field apps built from one skeleton; records are carried between devices by QR code. | Its README describes detecting overlapping loans when devices exchange histories and resolving them explicitly, and mentions no CRDT; LIMBO's skeleton makes every op declare a merge rule and measures convergence over random orderings. |
| **nullspec** (arifiarber-sYn) | A spec-driven skeleton for two local apps (service-sentinel, diary-index); a `nullspec` MCP server lets Kiro read specs and tasks. | Its README mentions no sync or merge; LIMBO merges two replicas inside one page over a simulated link (cross-device relay not built) and uses MCP only to let Kiro fuzz an op's merge rule. |
| **Stackyard** (chainwright) | A lesson file played offline; results come back with no server as typed short codes. | It returns results by short code rather than merging concurrent edits; in LIMBO every op declares a merge rule and convergence is measured (10,000 random orderings of 3 replicas, `evidence/convergence/`). |

Of the entries we looked at, LIMBO is the one that pairs an offline skeleton with declared per-op merge rules and a measured convergence run. We did not see every entry.
