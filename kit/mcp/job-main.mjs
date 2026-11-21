// Child entry for one MCP job: one JSON spec on stdin, one JSON line on stdout.
// Anything an op module prints to stdout is moved to stderr, which the server relays.
import { readFileSync } from 'node:fs';

const reply = process.stdout.write.bind(process.stdout);
console.log = (...a) => console.error(...a);
process.stdout.write = (chunk, ...rest) => process.stderr.write(chunk, ...rest);

let out;
try {
  const spec = JSON.parse(readFileSync(0, 'utf8'));
  const { runJobInProcess } = await import('./job.ts');
  out = await runJobInProcess(spec);
} catch (e) {
  out = { ok: false, error: { code: 'job-crashed', message: e instanceof Error ? e.message : String(e) } };
}
reply(JSON.stringify(out) + '\n', () => process.exit(0));
