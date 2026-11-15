// Properties for sector.report: generator and the severity oracle.
// The kit `maxIntent` oracle only lowers a level through a clear op. Here a later report that has seen earlier ones
// is the observing re-inspection (R2.3), so the oracle is: highest level among reports no other report has seen.
import { conflictGen } from '../../../../kit/props/arbitraries/index.ts';
import { intentCheck, sees, eachTarget, same, show } from '../../../../kit/props/intent/common.ts';
import type { RunOptions } from '../../../../kit/props/run.ts';
import type { Op } from '../../../../skeleton/src/core/types.ts';
import { SEVERITIES } from '../model.ts';
import { severityOf, type ReportPayload } from './sector.report.op.ts';

const isReport = (o: Op): boolean => o.op === 'sector.report';

export const opts: RunOptions = {
  gen: conflictGen({
    payloads: {
      'sector.report': (rand, ctx): ReportPayload => ({ severity: ctx.pick(['minor', 'critical'], SEVERITIES) }),
    },
  }),
  checks: [
    intentCheck('intent:max', (res) =>
      eachTarget(res, isReport, ({ state, target, ops }) => {
        let best = 0;
        for (const r of ops) {
          if (ops.some((o) => o !== r && sees(o, r))) continue;
          best = Math.max(best, SEVERITIES.indexOf((r.payload as ReportPayload).severity));
        }
        const got = severityOf(state, target);
        return same(got, SEVERITIES[best]) ? true : `severity ${show(got)}, expected ${show(SEVERITIES[best])}`;
      }),
    ),
  ],
};
