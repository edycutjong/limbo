# BASECAMP

A group trip list built on the LIMBO skeleton: items, claims ("I will bring it"), ticks, reorder, shared expenses.
Built from the `basecamp` Kiro spec.

## Evidence and wording

Convergence of every op is measured, property-tested. The full tier ran 10,000 orderings over 3 replicas with all properties passing; see `evidence/convergence/full-2026-11-21.json` and `full-2026-11-21.log`. Two-context offline runs are recorded under `evidence/e2e/`.

Offline behaviour is provisional. When two people claim the same item offline, the declared rule (`claim-one`) picks one claimant deterministically on reconnect. No CRDT prevents two offline people claiming the same thing.

The app pages print no figures taken from this README. The only number on a page is the shuffle test's live count (1,000 orderings), computed in the browser when the test runs.
