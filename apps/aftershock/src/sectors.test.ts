import { expect, it } from 'vitest';
import { MAX_COUNT, MAX_NOTE, NEEDS, SECTOR_IDS, SEVERITIES } from './sectors.ts';

it('has 24 distinct sector ids in row-major order', () => {
  expect(SECTOR_IDS).toHaveLength(24);
  expect(new Set(SECTOR_IDS).size).toBe(24);
  expect(SECTOR_IDS.slice(0, 7)).toEqual(['A1', 'B1', 'C1', 'D1', 'E1', 'F1', 'A2']);
  expect(SECTOR_IDS[23]).toBe('F4');
  expect(SECTOR_IDS.every((id) => /^[A-F][1-4]$/.test(id))).toBe(true);
});

it('declares severities, needs and limits', () => {
  expect([...SEVERITIES]).toEqual(['safe', 'damaged', 'unsafe']);
  expect([...NEEDS]).toEqual(['water', 'medical', 'shelter', 'food', 'power']);
  expect(MAX_COUNT).toBe(100000);
  expect(MAX_NOTE).toBe(280);
});
