// Entry: LIMBO convergence MCP server over stdio. Root comes from this file's location, never from cwd.
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import { createServer } from './tools.ts';

const root = join(dirname(fileURLToPath(import.meta.url)), '..', '..');
await createServer({ root }).connect(new StdioServerTransport());
