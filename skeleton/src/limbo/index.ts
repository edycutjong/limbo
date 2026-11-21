// LIMBO layer entry (`@limbo/skeleton/limbo`). Components bound to the real sync state.
export { LimboShell, useLimbo } from './shell.tsx';
export { Fog, Wisps, FixedStamp, StatusChip } from './marks.tsx';
export { Twin } from './twin.tsx';
export { Inspector } from './inspector.tsx';
export { ReplicaPair } from './pair-view.tsx';
export { ShuffleTest } from './shuffle-test.tsx';
export { runShuffle } from './shuffle.ts';

export type { Id, Limbo, Motion, ConflictDescriptor } from './shell.tsx';
export type { FogMode } from './marks.tsx';
export type { ShuffleRunner, Golden } from './shuffle-test.tsx';
export type { ShuffleInput, ShuffleResult } from './shuffle.ts';
