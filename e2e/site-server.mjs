// Static server for site/ that mirrors Vercel's cleanUrls: /judge serves judge.html with a 200 and no redirect, /deck/ serves
// deck/index.html. Port 5179.
import { createServer } from 'node:http';
import { readFileSync, existsSync } from 'node:fs';
import { join, normalize } from 'node:path';

const root = join(process.cwd(), 'site');
createServer((req, res) => {
  const p = normalize(new URL(req.url ?? '/', 'http://x').pathname).replace(/^(\.\.[/\\])+/, '');
  const candidates = p.endsWith('/') ? [`${p.slice(1)}index.html`] : [p.slice(1), `${p.slice(1)}.html`];
  const file = candidates.map((c) => join(root, c)).find((f) => f.startsWith(root) && existsSync(f) && !f.endsWith('/'));
  if (!file) {
    res.writeHead(404).end('not found');
    return;
  }
  const types = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript', '.css': 'text/css', '.svg': 'image/svg+xml', '.webp': 'image/webp', '.png': 'image/png', '.woff2': 'font/woff2' };
  const ext = file.slice(file.lastIndexOf('.'));
  res.writeHead(200, { 'content-type': types[ext] ?? 'application/octet-stream' }).end(readFileSync(file));
}).listen(5179, () => console.log('site on 5179'));
