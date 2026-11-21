// Properties for sector.report: generator and the kit `max` intent oracle on `severity` (reports only; clears are in the companion).
import { conflictGen } from '../../../../kit/props/arbitraries/index.ts';
import { maxIntent } from '../../../../kit/props/intent/index.ts';
import type { RunOptions } from '../../../../kit/props/run.ts';
import type { ReportPayload, SeverityState } from './sector.state.ts';

const ORDER = ['safe', 'damaged', 'unsafe'] as const;

export const opts: RunOptions = {
  gen: conflictGen({
    payloads: {
      'sector.report': (_rand, ctx): ReportPayload => ({ severity: ctx.pick(['damaged', 'unsafe'], ORDER) }),
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
