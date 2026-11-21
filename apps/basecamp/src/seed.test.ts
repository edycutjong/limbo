import { createHash } from 'node:crypto';
import { describe, expect, it } from 'vitest';
import { canonical } from '../../../skeleton/src/core/causal.ts';
import { materialize } from './model.ts';
import { buildSeedOps, seedOps, SEED_ITEMS } from './seed.ts';

const SEED_SHA256 = '111c0139702181ebaaa5b23393b06b98dd66289fe99f41a12be69efb7d9d26bd';

describe('seed', () => {
  it('materializes the R2.5 values', () => {
    const s = materialize(seedOps);
    expect(s.order).toEqual(SEED_ITEMS.map((i) => i.id));
    expect(s.expenses.campsite!.shares).toEqual({ budi: 1200, citra: 1200, dewi: 1200, sari: 1200 });
    expect(s.expenses['gas-snacks']!.shares).toEqual({ budi: 834, citra: 833, sari: 833 });
    expect(s.items.coffee!.ticked).toBe(true);
    expect(s.items.gas!.winners).toEqual(['citra']);
    expect(s.items.gas!.units).toBe(2);
    expect(s.items.filter!.winners).toEqual(['dewi']);
    for (const it of Object.values(s.items)) {
      expect(it.life).toBe('alive');
      expect(it.twins.fields).toEqual([]);
      expect(it.losers).toEqual([]);
    }
  });

  it('is byte-identical on two builds', () => {
    expect(canonical(buildSeedOps())).toBe(canonical(buildSeedOps()));
  });

  it('is authored by seed with counters 1..n', () => {
    seedOps.forEach((o, i) => {
      expect(o.stamp.r).toBe('seed');
      expect(o.stamp.n).toBe(i + 1);
      expect(o.id).toBe(`seed:${i + 1}`);
    });
    expect(seedOps.length).toBe(15);
  });

  it('sha256 of the canonical JSON equals the recorded constant', () => {
    const sha = createHash('sha256').update(canonical(seedOps)).digest('hex');
    console.log(`seed sha256: ${sha}`);
    expect(sha).toBe(SEED_SHA256);
  });
});
