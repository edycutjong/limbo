// AFTERSHOCK hook for the mixed-script properties: the app's fold, no extra roles.
// Not an op file. The suite finds this file by name (`apps/<app>/src/ops/app.props.ts`).
// `AppProps` has no `max` or `add-remove` slot (only `life`, `claim` and `move`), and AFTERSHOCK has none of those
// three kinds of op. The `max` and `add-remove` intents therefore run per op and in the companion
// (`sector.severity.props.test.ts`), not here. This file gives the mixed sweep convergence, replay equivalence and idempotence.
import type { AppProps } from '../../../../kit/props/mixed.ts';
import { materialize } from '../model.ts';

export const app: AppProps = { materialize };
