// Properties for sector.report: generator and the kit `max` intent oracle.
// Every report also acts as a clear for the reports it has seen (a later-seen report may lower the severity).
import { conflictGen } from '../../../../kit/props/arbitraries/index.ts';
import { maxIntent } from '../../../../kit/props/intent/index.ts';
import type { RunOptions } from '../../../../kit/props/run.ts';
import { SEVERITIES } from '../model.ts';
import { severityOf, type ReportPayload } from './sector.report.op.ts';

export const opts: RunOptions = {
  gen: conflictGen({
    payloads: {
      'sector.report': (rand): ReportPayload => ({ severity: rand.pick(SEVERITIES) }),
    },
  }),
  checks: [
    maxIntent({
      order: SEVERITIES,
      report: (o) => (o.op === 'sector.report' ? (o.payload as ReportPayload).severity : undefined),
      isClear: (o) => o.op === 'sector.report',
      read: (s, target) => (s.reports?.[target] === undefined ? undefined : severityOf(s, target)),
    }),
  ],
};
