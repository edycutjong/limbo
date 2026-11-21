import { createHash } from 'node:crypto';
import { describe, expect, it } from 'vitest';
import { canonical } from '../../../skeleton/src/core/causal.ts';
import { describeConflicts } from './conflicts.ts';
import { materialize } from './model.ts';
import { makeSeed, seedOps, SURVEY_NAME } from './seed.ts';

const SEED_SHA256 = '0c47bc4386791df0d4f65768f2843621d0266a2668ff951b4220e6a4d414e036';

describe('seed', () => {
  it('materializes the R2.7 values', () => {
    const s = materialize(seedOps);
    const sectors = Object.values(s.sectors);
    expect(SURVEY_NAME).toBe('Block 7 survey');
    expect(sectors.filter((x) => x.severity !== undefined).length).toBe(10);
    expect(sectors.filter((x) => x.severity === 'safe').length).toBe(8);
    expect(s.sectors.B2!.severity).toBe('damaged');
    expect(s.sectors.E3!.severity).toBe('damaged');
    expect(s.sectors.A1).toMatchObject({ severity: 'safe', total: 2 });
    expect(s.sectors.B2!.total).toBe(4);
    expect(s.sectors.B2!.counts.map((c) => `${c.who} ${c.value}`)).toEqual(['sari 1', 'rina 3']);
    expect(s.sectors.B2!.needs).toEqual(['water']);
    expect(s.sectors.E3).toMatchObject({ total: 2, needs: ['medical'] });
    expect(s.sectors.A3).toMatchObject({ severity: 'safe', total: 1, needs: ['shelter'] });
    expect(s.sectors.C3).toBeUndefined();
    expect(describeConflicts(s)).toEqual([]);
  });

  it('is byte-identical on two builds', () => {
    expect(canonical(makeSeed())).toBe(canonical(makeSeed()));
  });

  it('is 18 ops authored by seed with counters 1..18', () => {
    expect(seedOps.length).toBe(18);
    seedOps.forEach((o, i) => {
      expect(o.stamp.r).toBe('seed');
      expect(o.stamp.n).toBe(i + 1);
      expect(o.id).toBe(`seed:${i + 1}`);
    });
  });

  it('sha256 of the canonical JSON equals the recorded constant', () => {
    const sha = createHash('sha256').update(canonical(seedOps)).digest('hex');
    console.log(`seed sha256: ${sha}`);
    expect(sha).toBe(SEED_SHA256);
  });
});
