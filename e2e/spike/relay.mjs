// G1 spike relay: store and forward only. No merge logic, no dedupe beyond op id.
//   POST /ops    body: a JSON array of ops  -> appends those whose id is new
//   GET  /ops?since=n -> { ops, cursor }     (ops after position n; cursor = log length)
//   POST /reset  -> empties the log (test isolation)
import { createServer } from 'node:http';

const port = Number(process.env.RELAY_PORT ?? 5175);
let log = [];
let ids = new Set();

const cors = {
  'access-control-allow-origin': '*',
  'access-control-allow-methods': 'GET, POST, OPTIONS',
  'access-control-allow-headers': 'content-type',
  'cache-control': 'no-store',
};

function send(res, status, body) {
  res.writeHead(status, { ...cors, 'content-type': 'application/json' });
  res.end(JSON.stringify(body));
}

const server = createServer((req, res) => {
  const url = new URL(req.url ?? '/', 'http://localhost');
  if (req.method === 'OPTIONS') return send(res, 204, {});
  if (req.method === 'GET' && url.pathname === '/ops') {
    const since = Math.max(0, Number(url.searchParams.get('since') ?? 0) || 0);
    return send(res, 200, { ops: log.slice(since), cursor: log.length });
  }
  if (req.method === 'POST' && url.pathname === '/reset') {
    log = [];
    ids = new Set();
    return send(res, 200, { cursor: 0 });
  }
  if (req.method === 'POST' && url.pathname === '/ops') {
    let raw = '';
    req.on('data', (c) => (raw += c));
    req.on('end', () => {
      try {
        const ops = JSON.parse(raw);
        if (!Array.isArray(ops)) return send(res, 400, { error: 'expected an array' });
        for (const op of ops) {
          if (typeof op?.id !== 'string' || ids.has(op.id)) continue;
          ids.add(op.id);
          log.push(op);
        }
        send(res, 200, { cursor: log.length });
      } catch {
        send(res, 400, { error: 'bad json' });
      }
    });
    return;
  }
  send(res, 404, { error: 'not found' });
});

server.listen(port, () => console.log(`relay listening on ${port}`));
