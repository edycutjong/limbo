// Static server for site/ that mirrors Vercel's cleanUrls: /judge serves judge.html with a 200 and no redirect. Port 5179.
import { createServer } from 'node:http';
import { readFileSync, existsSync } from 'node:fs';
import { join, normalize } from 'node:path';

const root = join(process.cwd(), 'site');
createServer((req, res) => {
  const p = normalize(new URL(req.url ?? '/', 'http://x').pathname).replace(/^(\.\.[/\\])+/, '');
  const candidates = p === '/' ? ['index.html'] : [p.slice(1), `${p.slice(1)}.html`];
  const file = candidates.map((c) => join(root, c)).find((f) => f.startsWith(root) && existsSync(f) && !f.endsWith('/'));
  if (!file) {
    res.writeHead(404).end('not found');
    return;
  }
  res.writeHead(200, { 'content-type': file.endsWith('.html') ? 'text/html; charset=utf-8' : 'application/octet-stream' }).end(readFileSync(file));
}).listen(5179, () => console.log('site on 5179'));
