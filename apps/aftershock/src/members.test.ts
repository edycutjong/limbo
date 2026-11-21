import { expect, it } from 'vitest';
import { authorOf, displayName, memberOfReplica, ROSTER } from './members.ts';

const at = (r: string) => ({ stamp: { l: 1, r, n: 1 } });

it('authorOf strips the replica namespace suffix', () => {
  expect(authorOf(at('a#1'))).toBe('a');
  expect(authorOf(at('b#1'))).toBe('b');
  expect(authorOf(at('seed'))).toBe('seed');
});

it('maps replicas to members and keeps roster order', () => {
  expect(memberOfReplica('a')).toBe('sari');
  expect(memberOfReplica('b')).toBe('budi');
  expect(memberOfReplica('seed')).toBe('seed');
  expect([...ROSTER]).toEqual(['sari', 'budi', 'rina']);
});

it('displays known members by name and unknown members as their id', () => {
  expect(ROSTER.map(displayName)).toEqual(['Sari', 'Budi', 'Rina']);
  expect(displayName('seed')).toBe('seed');
});
