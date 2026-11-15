// Evidence sidecar: when LIMBO_PROPS_SIDECAR names a file, the suite writes the run config and the
// measured vacuity report there for `kit/scripts/props-full.mjs`. Not a reducer file.
import { writeFileSync } from 'node:fs';
import { config } from './config.ts';
import type { VacuityReport } from './vacuity.ts';

export function writeSidecar(vacuity: VacuityReport | null): void {
  const path = process.env.LIMBO_PROPS_SIDECAR;
  if (path === undefined || path === '') return;
  const { tier, replicas, orderings, seed } = config;
  writeFileSync(path, JSON.stringify({ config: { tier, replicas, orderings, seed }, vacuity }));
}
