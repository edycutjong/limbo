import { execFileSync } from 'node:child_process';
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

const script = resolve(__dirname, '../../scripts/kiro-share.mjs');
let dir: string;

const git = (...args: string[]) => execFileSync('git', args, { cwd: dir, encoding: 'utf8' }).trim();
const commit = (file: string, message: string) => {
  const full = join(dir, file);
  mkdirSync(dirname(full), { recursive: true });
  writeFileSync(full, `${message}\n`);
  git('add', file);
  git('commit', '-q', '-m', message);
};

describe('kiro-share', () => {
  beforeAll(() => {
    dir = mkdtempSync(join(tmpdir(), 'kiro-share-'));
    git('init', '-q');
    git('config', 'user.email', 't@example.com');
    git('config', 'user.name', 'T');
    git('config', 'commit.gpgsign', 'false');
    commit('skeleton/src/a.ts', 'feat: kiro product\n\nKiro-Session: sess_abc123');
    commit('apps/basecamp/src/b.ts', 'feat: plain product');
    commit('docs/c.md', 'docs: not product\n\nKiro-Session: sess_zzz');
  });
  afterAll(() => rmSync(dir, { recursive: true, force: true }));

  it('--check reports product 2, kiro 1, share 0.5 without writing', () => {
    const out = JSON.parse(execFileSync('node', [script, '--check'], { cwd: dir, encoding: 'utf8' }));
    expect(Object.keys(out)).toEqual([
      'generated_from',
      'product_commits',
      'kiro_commits',
      'share',
      'claude_direct_commits',
    ]);
    expect(out.generated_from).toBe(git('rev-parse', 'HEAD'));
    expect(out.product_commits).toBe(2);
    expect(out.kiro_commits).toBe(1);
    expect(out.share).toBe(0.5);
    expect(out.claude_direct_commits).toHaveLength(1);
    expect(out.claude_direct_commits[0].subject).toBe('feat: plain product');
    expect(existsSync(join(dir, 'evidence/kiro/share.json'))).toBe(false);
  });

  it('writes evidence/kiro/share.json', () => {
    execFileSync('node', [script], { cwd: dir, encoding: 'utf8' });
    const written = JSON.parse(readFileSync(join(dir, 'evidence/kiro/share.json'), 'utf8'));
    expect(written.product_commits).toBe(2);
    expect(written.share).toBe(0.5);
  });
});
