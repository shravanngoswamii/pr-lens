import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, mkdir, writeFile, symlink, rm, access } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { run } from '../bot/process.js';
import { collectContext } from '../bot/context.js';

test('collects exact source snapshots without executing repository hooks or following symlinks', async () => {
  const dir = await mkdtemp(join(tmpdir(), 'review-docs-bot-context-'));
  const repo = join(dir, 'repo'), job = join(dir, 'job'), marker = join(dir, 'executed');
  await mkdir(repo); await mkdir(job);
  const git = async args => (await run('git', ['-C', repo, '-c', 'user.name=Test', '-c', 'user.email=test@example.com', '-c', 'commit.gpgsign=false', ...args])).stdout.trim();
  try {
    await git(['init', '--quiet']);
    await writeFile(join(repo, 'README.md'), 'A package.\n');
    await writeFile(join(repo, 'caller.js'), 'export const call = () => 1;\n');
    await symlink(marker, join(repo, 'link'));
    await mkdir(join(repo, '.claude'));
    await writeFile(join(repo, '.claude/settings.json'), JSON.stringify({ hooks: { SessionStart: [{ hooks: [{ type: 'command', command: `touch ${marker}` }] }] } }));
    await git(['add', '.']); await git(['commit', '--quiet', '-m', 'Initial source']);
    const base = await git(['rev-parse', 'HEAD']);
    await writeFile(join(repo, 'README.md'), 'A package with a documented call.\n');
    await git(['add', '.']); await git(['commit', '--quiet', '-m', 'Describe the call']);
    const head = await git(['rev-parse', 'HEAD']);
    const pr = { html_url: 'https://github.com/owner/repo/pull/1', title: 'Describe the call', body: 'See private/repo#2', base: { sha: base, repo: { private: false } }, head: { sha: head, repo: { private: false } } };
    const privateReads = [];
    const gh = {
      api: async path => path.includes('/compare/') ? { merge_base_commit: { sha: base } } : path.endsWith('/pulls/1') ? pr : { private: path === 'repos/private/repo' },
      read: async (path, paginate) => {
        if (path.startsWith('repos/private/')) privateReads.push(path);
        if (paginate) return [];
        if (path.endsWith('/pulls/1')) return pr;
        return { ...pr, state: 'open', updated_at: new Date().toISOString(), pull_request: {} };
      },
    };
    const collected = await collectContext(gh, { repo: 'owner/repo', number: 1 }, job, { execute: (command, args, options) => run(command, args.map(arg => arg === 'https://github.com/owner/repo.git' ? repo : arg), options) });
    assert.equal(collected.context.review.head, head);
    assert.match(collected.context.diff, /documented call/);
    assert.equal(collected.context.source.find(file => file.path === 'README.md').lines, 1);
    await collected.readFiles([{ path: 'caller.js', revision: 'base' }, { path: 'link', revision: 'head' }]);
    assert.ok(collected.context.source.some(file => file.path === 'caller.js' && file.sha === base));
    assert.ok(collected.context.limits.some(text => text.includes('not a regular file')));
    await assert.rejects(() => collected.readFiles([{ path: '../outside', revision: 'head' }]), /Invalid source/);
    await assert.rejects(() => access(marker));
    assert.deepEqual(privateReads, []);
    assert.equal(collected.context.linked.block.nodes.find(node => node.url.includes('private/repo')).status, 'unreadable');
  } finally { await rm(dir, { recursive: true, force: true }); }
});
