// LIMBO skeleton entry point. Nine merge-kit values, six sync values. Types are type-only.
import { causalLww, resurrect, claimOne, orderedMove } from './core/merges.ts';

export { createOp, causalBuffer, compareStamp, covers, concurrent, canonical } from './core/causal.ts';
export { simulate, explainTrace } from './core/simulate.ts';
export const merges = { causalLww, resurrect, claimOne, orderedMove };

export { createReplica } from './sync/replica.ts';
export { createPair } from './sync/pair.ts';
export { createInPageLink } from './sync/inpage-link.ts';
export { attachLink } from './sync/link.ts';
export { deriveSync } from './sync/status.ts';
export { acquireIdentity } from './sync/identity.ts';

export type { Op, OpDef, Intent, Merge, Stamp, VV, ReplicaId } from './core/types.ts';
export type { Replica, ReplicaConfig } from './sync/replica.ts';
export type { Pair, PairConfig, PairView } from './sync/pair.ts';
export type { Link, Msg, Session } from './sync/link.ts';
export type { InPageLink, InPageLinkOptions } from './sync/inpage-link.ts';
export type { SyncInput, SyncView } from './sync/status.ts';
export type { Identity, AcquireOpts } from './sync/identity.ts';
