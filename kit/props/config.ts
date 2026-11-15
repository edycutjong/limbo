// Property harness config: tiers, seed, env override.
// Not a reducer file: reads process.env once per call, no clock or randomness.

export type Tier = 'fast' | 'full';

export interface PropsConfig {
  tier: Tier;
  replicas: number;
  /** Number of delivery orderings (fast-check numRuns). */
  orderings: number;
  seed: number;
}

export const TIERS: Readonly<Record<Tier, number>> = { fast: 500, full: 10_000 };

export const REPLICAS = 3;

/** Recorded constant seed, used when LIMBO_PROPS_SEED is unset. */
export const DEFAULT_SEED = 20251031;

type Env = Readonly<Record<string, string | undefined>>;

export function resolveTier(env: Env): Tier {
  const t = env.LIMBO_PROPS_TIER;
  if (t === undefined || t === '') return 'fast';
  if (t === 'fast' || t === 'full') return t;
  throw new Error(`LIMBO_PROPS_TIER must be "fast" or "full", got "${t}"`);
}

export function resolveSeed(env: Env): number {
  const s = env.LIMBO_PROPS_SEED;
  if (s === undefined || s === '') return DEFAULT_SEED;
  if (!/^-?\d+$/.test(s.trim())) throw new Error(`LIMBO_PROPS_SEED must be an integer, got "${s}"`);
  const n = Number(s);
  if (!Number.isSafeInteger(n)) throw new Error(`LIMBO_PROPS_SEED is out of range: "${s}"`);
  return n;
}

export function loadConfig(env: Env = process.env): PropsConfig {
  const tier = resolveTier(env);
  return { tier, replicas: REPLICAS, orderings: TIERS[tier], seed: resolveSeed(env) };
}

export const config: PropsConfig = loadConfig();
