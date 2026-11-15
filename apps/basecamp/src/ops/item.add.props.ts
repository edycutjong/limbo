// Properties for item.add: generator and a create check (every add is present, with its payload, on every replica).
import { conflictGen } from '../../../../kit/props/arbitraries/index.ts';
import type { RunCheck, RunOptions } from '../../../../kit/props/run.ts';
import type { AddPayload, AddState } from './item.add.op.ts';

const createCheck: RunCheck = {
  name: 'intent:create',
  check(res) {
    for (const [replica, json] of Object.entries(res.states)) {
      const s = JSON.parse(json) as AddState;
      for (const o of res.ops) {
        if (o.op !== 'item.add') continue;
        const p = o.payload as AddPayload;
        const got = s.adds?.[o.id];
        if (got === undefined || got.target !== o.target || got.name !== p.name || got.units !== p.units || got.key !== p.key) {
          return `replica ${replica} lost or changed the add ${o.id}`;
        }
      }
    }
    return true;
  },
};

export const opts: RunOptions = {
  gen: conflictGen({
    payloads: {
      'item.add': (rand, ctx): AddPayload => ({
        name: ctx.pick(['Stove', 'Tent'], ['Stove', 'Tent', 'Gas', 'Rope', 'Lantern']),
        units: 1 + rand.int(3),
        key: ctx.pick(['a0', 'a1'], ['a0', 'a1', 'a2', 'a3']),
      }),
    },
  }),
  checks: [createCheck],
};
