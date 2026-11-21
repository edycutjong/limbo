import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

const root = join(dirname(fileURLToPath(import.meta.url)), '..', '..');
const readJson = (p: string): any => JSON.parse(readFileSync(join(root, p), 'utf8'));

const SERVER = { command: 'node', args: ['kit/mcp/server.mjs'] };
const TOOLS = ['list_ops', 'fuzz_op', 'explain_trace', 'check_lint'].map((t) => `@limbo-convergence/${t}`);

describe('convergence-mcp wiring', () => {
  it('.kiro/settings/mcp.json declares limbo-convergence with the exact command and args', () => {
    expect(readJson('.kiro/settings/mcp.json')).toEqual({ mcpServers: { 'limbo-convergence': SERVER } });
  });

  it('limbo-builder declares the same server and allows exactly four tools', () => {
    const agent = readJson('.kiro/agents/limbo-builder.json');
    expect(agent.mcpServers).toEqual({ 'limbo-convergence': SERVER });
    expect(agent.tools).toContain('@limbo-convergence');
    expect([...agent.allowedTools].sort()).toEqual([...TOOLS].sort());
    expect(agent.includeMcpJson).toBe(false);
  });

  it('limbo-builder keeps its other fields and permissions', () => {
    const agent = readJson('.kiro/agents/limbo-builder.json');
    expect(agent.name).toBe('limbo-builder');
    expect(agent.prompt).toBe('file://./prompts/limbo-builder.md');
    expect(agent.tools.filter((t: string) => t !== '@limbo-convergence')).toEqual(['read', 'write', 'shell']);
    expect(agent.resources).toEqual(['file://.kiro/steering/**/*.md']);
    expect(agent.includePowers).toBe(false);
    expect(agent.permissions.rules).toHaveLength(4);
    const denyWrite = agent.permissions.rules[3];
    expect(denyWrite.effect).toBe('deny');
    expect(denyWrite.match).toContain('kit/mcp/**');
  });

  it('.gitignore has no rule that matches .kiro/ or its settings file', () => {
    const rules = readFileSync(join(root, '.gitignore'), 'utf8')
      .split('\n')
      .map((l) => l.trim())
      .filter((l) => l !== '' && !l.startsWith('#'));
    expect(rules.some((r) => r.replace(/^\//, '').replace(/\/$/, '') === '.kiro')).toBe(false);
    expect(rules.some((r) => /^\/?\.kiro(\/|\*|$)/.test(r))).toBe(false);
  });
});
