// AFTERSHOCK constants (demo data only). Sector ids are column letter + row number, row-major.
export const COLUMNS = ['A', 'B', 'C', 'D', 'E', 'F'] as const;
export const ROWS = [1, 2, 3, 4] as const;

/** A1..F1, A2..F2, A3..F3, A4..F4: 24 ids, row-major. */
export const SECTOR_IDS: readonly string[] = ROWS.flatMap((r) => COLUMNS.map((c) => `${c}${r}`));

/** Ascending severity order: the max-lattice order. */
export const SEVERITIES = ['safe', 'damaged', 'unsafe'] as const;
export type Severity = (typeof SEVERITIES)[number];

export const NEEDS = ['water', 'medical', 'shelter', 'food', 'power'] as const;
export type Need = (typeof NEEDS)[number];

export const MAX_COUNT = 100000;
export const MAX_NOTE = 280;
