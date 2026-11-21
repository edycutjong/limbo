// The 12 mutation fixtures (R15.1) plus apply-append. Each must fail at least one property or golden history.
import arrivalOrder from './arrival-order.ts';
import applyAppend from './apply-append.ts';
import claimBoth from './claim-both.ts';
import claimMax from './claim-max-stamp.ts';
import deleteWins from './delete-wins.ts';
import lww from './lww-wallclock.ts';
import moveReinsert from './move-reinsert.ts';
import qty from './qty-read-modify-write.ts';
import resolveNoop from './resolve-noop.ts';
import severity from './severity-lww.ts';
import splitFirst from './split-first-member.ts';
import splitFloat from './split-float.ts';
import tickToggle from './tick-toggle.ts';
import type { Fixture } from './types.ts';

export const fixtures: readonly Fixture[] = [
  tickToggle,
  lww,
  qty,
  splitFloat,
  deleteWins,
  claimBoth,
  claimMax,
  moveReinsert,
  severity,
  splitFirst,
  resolveNoop,
  arrivalOrder,
  applyAppend,
];
export type { Fixture } from './types.ts';
