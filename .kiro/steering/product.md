---
inclusion: always
---
# LIMBO: product

"When the connection dies, your app crosses over, keeps working on the other side, and comes back without silently losing an edit."

LIMBO is a lean local-first skeleton. Every operation (op) declares how it merges. Offline UI states are bound to the real sync state:

- **Fog**: this replica is partitioned or holds unsynced ops.
- **Wisps**: the queued op count.
- **Twins**: conflicts surfaced to the user.
- **Limbo inspector**: lists queued ops and the merge rule each declares.

## Two apps, one skeleton (separate folders)

- **BASECAMP** (`apps/basecamp/`): a group trip list. Items, claims ("I'll bring it"), ticks, reorder, shared expenses.
- **AFTERSHOCK** (`apps/aftershock/`): a field form whose sector reports merge into a shared grid. Demo data only. No field use is claimed.

## Who benefits

People whose shared list or form breaks when the signal does, and builders who need offline merges that do not diverge.

## Wording rules (every page and comment)

- Convergence is "measured, property-tested". Never "proven" or "guaranteed".
- Offline claims are provisional. The declared rule picks one claimant deterministically on reconnect. No CRDT prevents two offline people claiming the same thing.
- Every number comes from `evidence/`. Do not write a number that has no evidence file behind it.
