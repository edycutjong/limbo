// Properties for sector.report: generator, the kit `max` intent oracle, and a frontier-max oracle written from R2.
// Kit oracle mapping: every sector.report is a level report, and also an observing clear of the reports it has seen
// (R2.3: a re-inspection that received earlier reports replaces them and may lower the severity).
import { conflictGen } from '../../../../kit/props/arbitraries/index.ts';
import { maxIntent } from '../../../../kit/props/intent/index.ts';
import type { RunOptions } from '../../../../kit/props/run.ts';
import { SEVERITIES } from '../model.ts';
import { severityOf } from './sector.report.op.ts';

const isReport = (o: { op: string }): boolean => o.op === 'sector.report';

export const opts: RunOptions = {
  gen: conflictGen({
    payloads: { 'sector.report': (_r, c) => ({ severity: c.pick(SEVERITIES, SEVERITIES) }) },
  }),
  checks: [
    maxIntent({
      order: SEVERITIES,
      report: (o) => (isReport(o) ? (o.payload as { severity: string }).severity : undefined),
      isClear: isReport,
      read: (s, t) => severityOf(s, t),
    }),
    {
      name: 'intent:max-frontier',
      check(res) {
        const reports = res.ops.filter((o) => o.op === 'sector.report');
        const seen = (x: (typeof reports)[number], y: (typeof reports)[number]) => (x.deps[y.stamp.r] ?? 0) >= y.stamp.n;
        for (const [replica, json] of Object.entries(res.states)) {
          const state: unknown = JSON.parse(json);
          for (const t of new Set(reports.map((o) => o.target))) {
            const mine = reports.filter((o) => o.target === t);
            const front = mine.filter((r) => !mine.some((o) => o !== r && seen(o, r)));
            const want = SEVERITIES[Math.max(...front.map((r) => SEVERITIES.indexOf((r.payload as { severity: (typeof SEVERITIES)[number] }).severity)))];
            const got = severityOf(state, t);
            if (got !== want) return `replica ${replica}, target ${t}: severity ${got}, expected ${want}`;
          }
        }
        return true;
      },
    },
  ],
};
