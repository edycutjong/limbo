// Properties for sector.report: generator and the kit `max` intent oracle.
// Every report counts as an observing clear of the reports it covers, so the oracle checks the causal frontier.
import { conflictGen } from '../../../../kit/props/arbitraries/index.ts';
import { maxIntent } from '../../../../kit/props/intent/index.ts';
import type { RunOptions } from '../../../../kit/props/run.ts';
import { SEVERITIES } from '../model.ts';
import { severityOf, type ReportPayload } from './sector.report.op.ts';

export const opts: RunOptions = {
  gen: conflictGen({
    payloads: { 'sector.report': (r) => ({ severity: r.pick(SEVERITIES) }) satisfies ReportPayload },
  }),
  checks: [
    maxIntent({
      order: SEVERITIES,
      report: (o) => (o.op === 'sector.report' ? (o.payload as ReportPayload).severity : undefined),
      isClear: (o) => o.op === 'sector.report',
      read: (s, target) => (Object.keys(s.reports?.[target] ?? {}).length === 0 ? undefined : severityOf(s, target)),
    }),
  ],
};
