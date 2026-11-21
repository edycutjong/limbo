import type { Op } from '../../../skeleton/src/core/types.ts';

/** Surveyor roster order. `rina` exists only in the seed. */
export const ROSTER = ['sari', 'budi', 'rina'] as const;

const REPLICA_MEMBER: Record<string, string> = { a: 'sari', b: 'budi' };
const NAMES: Record<string, string> = { sari: 'Sari', budi: 'Budi', rina: 'Rina' };

/** Author replica id of an op: `a#1` -> `a`, `seed` -> `seed`. */
export const authorOf = (op: Pick<Op, 'stamp'>): string => op.stamp.r.split('#')[0]!;

/** Replica `a` acts as sari, `b` as budi; any other replica id is its own member id. */
export const memberOfReplica = (replicaId: string): string => REPLICA_MEMBER[replicaId] ?? replicaId;

/** Display name of a member; an unknown member shows as its id. */
export const displayName = (member: string): string => NAMES[member] ?? member;
