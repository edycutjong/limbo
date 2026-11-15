// A/B pilot fixture (not a product app): the stub model both arms implement ops against.
export interface Item {
  id: string;
  name: string;
  /** How many of this item the group needs, e.g. 3 gas canisters. */
  qty: number;
}

/** Ordered from least to most severe. */
export const SEVERITIES = ['none', 'minor', 'major', 'critical'] as const;
export type Severity = (typeof SEVERITIES)[number];

export interface Sector {
  id: string;
  severity: Severity;
}
