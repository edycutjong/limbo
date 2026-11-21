import type { Op } from '../../../skeleton/src/core/types.ts';

export const MEMBERS = ['sari', 'budi', 'citra', 'dewi'] as const;
export type Member = (typeof MEMBERS)[number];

export const DISPLAY: Record<Member, string> = {
  sari: 'Sari',
  budi: 'Budi',
  citra: 'Citra',
  dewi: 'Dewi',
};

/** Replica `a` acts as `sari`, replica `b` as `budi`. Other replicas have no member. */
const REPLICA_MEMBER: Record<string, Member> = { a: 'sari', b: 'budi' };

/** Author replica id of an op: the namespace `${id}#${k}` without its suffix. */
export function authorOf(op: Pick<Op, 'stamp'>): string {
  return op.stamp.r.split('#')[0] ?? op.stamp.r;
}

export function memberOfReplica(replicaId: string): Member | undefined {
  return REPLICA_MEMBER[replicaId.split('#')[0] ?? replicaId];
}

export function displayName(member: string): string {
  return (DISPLAY as Record<string, string>)[member] ?? member;
}
