// Properties for sector.clear: generator and the kit `max` intent oracle.
// Alone, a clear has no reports to remove, so this check is nearly trivial. The real check is the companion
// `sector.severity.props.test.ts`, which runs reports and clears together.
import { conflictGen } from '../../../../kit/props/arbitraries/index.ts';
import { maxIntent } from '../../../../kit/props/intent/index.ts';
import type { RunOptions } from '../../../../kit/props/run.ts';
import type { ReportPayload, SeverityState } from './sector.state.ts';

const ORDER = ['safe', 'damaged', 'unsafe'] as const;

export const opts: RunOptions = {
  gen: conflictGen({
    payloads: {
      'sector.clear': () => ({}),
    },
  }),
  checks: [
    maxIntent({
      order: ORDER,
      report: (o) => (o.op === 'sector.report' ? (o.payload as ReportPayload).severity : undefined),
      isClear: (o) => o.op === 'sector.clear',
      read: (s: SeverityState, target) => s.severity?.[target],
    }),
  ],
};
