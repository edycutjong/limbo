import { describe, expect, it } from 'vitest';
// @ts-expect-error plain .mjs script without types
import { composeEvidence, evidenceFileName } from './props-full.mjs';

const report = {
  success: true,
  testResults: [
    {
      assertionResults: [
        { title: 'convergence', ancestorTitles: ['op item.tick'], status: 'passed' },
        { title: 'convergence', ancestorTitles: ['op item.claim'], status: 'passed' },
        { title: 'idempotence', ancestorTitles: ['op item.tick'], status: 'failed' },
        { title: 'claim-claim occurs in at least 50% of 10000 runs', ancestorTitles: ['vacuity guard'], status: 'passed' },
      ],
    },
  ],
};
const sidecar = {
  config: { tier: 'full', replicas: 3, orderings: 10000, seed: 7 },
  vacuity: { runs: 10000, share: { 'claim-claim': 0.9 }, applicable: ['claim-claim'], na: ['move-move'] },
};

describe('props-full evidence composer', () => {
  const ev = composeEvidence({ report, sidecar, yjsVersion: '13.6.33', nodeVersion: '22.1.0', durationMs: 1234, date: new Date(2025, 9, 31) });

  it('carries the required fields', () => {
    expect(ev).toMatchObject({ replicas: 3, orderings: 10000, seed: 7, yjsVersion: '13.6.33', nodeVersion: '22.1.0', durationMs: 1234 });
  });
  it('counts passes per property and shares per class', () => {
    expect(ev.passesPerProperty).toEqual({ convergence: 2, idempotence: 0 });
    expect(ev.failuresPerProperty.idempotence).toBe(1);
    expect(ev.vacuity.share).toEqual({ 'claim-claim': 0.9 });
    expect(ev.vacuity.na).toEqual(['move-move']);
  });
  it('puts the date in the file name', () => {
    expect(evidenceFileName(new Date(2025, 9, 31))).toBe('full-2025-10-31.json');
    expect(ev.date).toBe('2025-10-31');
  });
});
