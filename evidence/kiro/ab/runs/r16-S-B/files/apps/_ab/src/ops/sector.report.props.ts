// Properties for sector.report: generator and the kit `max` intent oracle.
// Every report observes the reports it covers, so the oracle treats each report as an observing clear.
import { maxIntent } from '../../../../kit/props/intent/index.ts';
import type { RunOptions } from '../../../../kit/props/run.ts';
import { SEVERITIES } from '../model.ts';
import { severityOf } from './sector.report.op.ts';

const payload = (o: { payload: unknown }): string => (o.payload as { severity: string }).severity;

export const opts: RunOptions = {
  gen: (_d, r) => ({ target: r.pick(['s1', 's2']), payload: { severity: r.pick([...SEVERITIES]) } }),
  checks: [
    maxIntent({
      order: SEVERITIES,
      report: (o) => (o.op === 'sector.report' ? payload(o) : undefined),
      isClear: (o) => o.op === 'sector.report',
      read: (s, target) => severityOf(s, target),
    }),
  ],
};
