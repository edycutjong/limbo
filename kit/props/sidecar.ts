// Evidence sidecar: when LIMBO_PROPS_SIDECAR names a file, each app's sweep adds its vacuity report
// (keyed by app name) and the run config there, for `kit/scripts/props-full.mjs`. Suites may run in
// separate workers and finish in any order, so a write merges with what the file already holds.
// `kit/scripts/props-full.mjs` starts the run with an empty file. Not a reducer file.
import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import { config } from './config.ts';
import type { VacuityReport } from './vacuity.ts';

export interface RunConfig {
  tier: string;
  replicas: number;
  orderings: number;
  seed: number;
}

export interface Sidecar {
  config: RunConfig;
  apps: Record<string, VacuityReport>;
}

/** Pure merge: `existing` is the current file text (may be empty or unreadable); `app` null adds no report. */
export function mergeSidecar(existing: string, runConfig: RunConfig, app: string | null, report: VacuityReport | null): Sidecar {
  let apps: Record<string, VacuityReport> = {};
  if (existing.trim() !== '') {
    try {
      const prev = JSON.parse(existing) as Partial<Sidecar>;
      if (prev.apps !== undefined && typeof prev.apps === 'object') apps = { ...prev.apps };
    } catch {
      apps = {};
    }
  }
  if (app !== null && report !== null) apps[app] = report;
  return { config: runConfig, apps };
}

export function writeSidecar(app: string | null, report: VacuityReport | null): void {
  const path = process.env.LIMBO_PROPS_SIDECAR;
  if (path === undefined || path === '') return;
  const { tier, replicas, orderings, seed } = config;
  const existing = existsSync(path) ? readFileSync(path, 'utf8') : '';
  writeFileSync(path, JSON.stringify(mergeSidecar(existing, { tier, replicas, orderings, seed }, app, report)));
}
