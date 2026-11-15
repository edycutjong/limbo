# A/B pilot — results

Pre-registration: `PREREG.md` (committed before run 1). Runs: 20 of 20 planned. Frozen commit `5dd6e7a`.
This is a **pilot**; the numbers below are published whatever they show.

| | arm A (no kit) | arm B (kit) |
|---|---|---|
| held-out failures, both ops | 0/10 (95% CI 0–28%) | 0/10 (95% CI 0–28%) |
| `item.adjustQty` | 0/5 (95% CI 0–43%) | 0/5 (95% CI 0–43%) |
| `sector.report` | 0/5 (95% CI 0–43%) | 0/5 (95% CI 0–43%) |
| op file missing / typecheck fail / held-out fail | 0 / 0 / 0 | 0 / 0 / 0 |
| Agent Stop blocks (runs with a block) | — | 8 (8) |
| credits per session (mean) | 1.935 | 4.496 |
| wall time per session, s (mean) | 70.3 | 313 |
| op registered in a registry (not scored) | 0 | 8 |
| Kiro reads of kit/ · .kiro/ (outside the stimulus) | 0 · 3 | 127 · 1 |

Two-sided Fisher exact p (pooled arms): **1**. Model as reported: auto.
Pre-registered internal bin: NONE (internal only; judge-facing copy gives counts, intervals and p).

## Per run
| k | run | fail | op file | typecheck | held-out | Stop blocks | credits | first failure |
|---|---|---|---|---|---|---|---|---|
| 1 | r01-Q-A | pass | yes | ok | pass | 0 | 1.8953 |  |
| 2 | r02-S-B | pass | yes | ok | pass | 1 | 6.2273 |  |
| 3 | r03-Q-B | pass | yes | ok | pass | 1 | 5.3286 |  |
| 4 | r04-S-A | pass | yes | ok | pass | 0 | 2.1272 |  |
| 5 | r05-Q-B | pass | yes | ok | pass | 1 | 3.6377 |  |
| 6 | r06-S-A | pass | yes | ok | pass | 0 | 1.9209 |  |
| 7 | r07-Q-A | pass | yes | ok | pass | 0 | 1.9068 |  |
| 8 | r08-S-B | pass | yes | ok | pass | 0 | 2.6893 |  |
| 9 | r09-Q-A | pass | yes | ok | pass | 0 | 1.6133 |  |
| 10 | r10-S-B | pass | yes | ok | pass | 1 | 7.0688 |  |
| 11 | r11-Q-B | pass | yes | ok | pass | 1 | 4.057 |  |
| 12 | r12-S-A | pass | yes | ok | pass | 0 | 1.9185 |  |
| 13 | r13-Q-B | pass | yes | ok | pass | 1 | 3.1835 |  |
| 14 | r14-S-A | pass | yes | ok | pass | 0 | 2.1404 |  |
| 15 | r15-Q-A | pass | yes | ok | pass | 0 | 1.8677 |  |
| 16 | r16-S-B | pass | yes | ok | pass | 1 | 3.813 |  |
| 17 | r17-Q-A | pass | yes | ok | pass | 0 | 1.8893 |  |
| 18 | r18-S-B | pass | yes | ok | pass | 0 | 2.8945 |  |
| 19 | r19-Q-B | pass | yes | ok | pass | 1 | 6.0568 |  |
| 20 | r20-S-A | pass | yes | ok | pass | 0 | 2.0703 |  |

Observations beyond the pre-registered measures (read them before quoting arm B's Stop blocks): `observations.md`.

Raw: `runs.jsonl`, `runs/<run>/` (session row, hook rows, Kiro's files, diff, score), held-out suite in `heldout/`.
