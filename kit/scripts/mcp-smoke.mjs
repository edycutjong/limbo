// Stdio smoke for the limbo-convergence MCP server. Exit 0 on success, 1 on any failed step.
// Writes to a temporary ledger (LIMBO_MCP_LOG), never to evidence/kiro/mcp-calls.jsonl.
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { StdioClientTransport } from '@modelcontextprotocol/sdk/client/stdio.js';

const root = join(dirname(fileURLToPath(import.meta.url)), '..', '..');
const EXPECTED = ['check_lint', 'explain_trace', 'fuzz_op', 'list_ops'];
const dir = mkdtempSync(join(tmpdir(), 'limbo-mcp-smoke-'));
let client;

const fail = (reason) => {
  console.error(`mcp-smoke: FAIL ${reason}`);
  return 1;
};

async function run() {
  const env = {};
  for (const [k, v] of Object.entries(process.env)) if (v !== undefined) env[k] = v;
  env.LIMBO_MCP_LOG = join(dir, 'mcp-calls.jsonl');
  const transport = new StdioClientTransport({
    command: process.execPath,
    args: [join(root, 'kit', 'mcp', 'server.mjs')],
    env,
    stderr: 'ignore',
  });
  client = new Client({ name: 'mcp-smoke', version: '1.0.0' });
  await client.connect(transport);

  const names = (await client.listTools()).tools.map((t) => t.name).sort();
  if (JSON.stringify(names) !== JSON.stringify(EXPECTED)) {
    return fail(`tools ${JSON.stringify(names)} != ${JSON.stringify(EXPECTED)}`);
  }
  const res = await client.callTool({ name: 'list_ops', arguments: { app: 'basecamp' } });
  if (res.isError) return fail(`list_ops returned an error: ${JSON.stringify(res.structuredContent)}`);
  const ops = res.structuredContent?.ops;
  if (!Array.isArray(ops) || ops.length < 1) return fail('list_ops returned no ops for basecamp');
  console.log(`mcp-smoke: ok tools=${names.length} basecamp_ops=${ops.length}`);
  return 0;
}

let code = 1;
try {
  code = await run();
} catch (e) {
  code = fail(e instanceof Error ? e.message : String(e));
} finally {
  try {
    await client?.close();
  } catch {
    /* ignore */
  }
  rmSync(dir, { recursive: true, force: true });
}
process.exit(code);
