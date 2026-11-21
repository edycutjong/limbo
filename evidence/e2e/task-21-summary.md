# Task 21: BASECAMP e2e test (b), two contexts through the dev relay

## Runs

| Run | Command | Result | Raw output |
| --- | --- | --- | --- |
| Full e2e | `CI=1 pnpm e2e --reporter=list` | 3 passed, 0 failed (spike, basecamp a, basecamp b) | `task-21-e2e.txt` |
| Ten repeats of (a) and (b) | `CI=1 pnpm exec playwright test --project=basecamp --repeat-each=10 --reporter=list` | (a) 10 / 10 passed, (b) 10 / 10 passed, 20 passed in total | `task-21-repeat10.txt` |

Playwright retries are 0 (the default), so any flaky run would show as a failure. `CI=1` makes Playwright start its own dev servers and relay instead of reusing running ones.

## Changes made while getting (b) green

1. **DevRelayLink bug (fixed in code, not in the test).** Test (b) first failed: after reconnect the two canonical states were equal, but A kept "Syncing 2… · 2 conflicts" forever. A's queue held B's two ops (`b#1:1`, `b#1:2`). The link emitted `ack` only after its own POST, so ops that A received from the relay's poll never entered A's peer-ack vector, although the relay holds every op it serves. Fix: `skeleton/src/sync/dev-relay-link.ts` now emits an `ack` with the relay's vector after a poll that returns ops. New unit test in `skeleton/src/sync/dev-relay-link.test.ts`: "ops received from the relay count as held by the relay (no stale unacked)". It fails without the fix and passes with it.
2. **Relay isolation.** The spike test and test (b) both `POST /reset` the one relay on 5175. With two workers they could overlap. `playwright.config.ts` now sets `workers: 1`. No assertion changed.

## Skeleton size after this task (R1.3)

Measured with the command in `../budget-basecamp-baseline.md`: 21 files, 2,137 non-blank, non-comment lines. This task added one code line to `skeleton/` (the `ack` emit). The added comment line is not counted.
