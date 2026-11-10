import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, mkdir, writeFile, readFile, rm } from 'node:fs/promises';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { run } from '../bot/process.js';
import { publish, waitForPublication } from '../bot/publish.js';

test('publishes only reviewed artifacts to a clean dedicated checkout without force pushing', async () => {
  const dir = await mkdtemp(join(tmpdir(), 'review-docs-bot-publish-'));
  const remote = join(dir, 'remote.git'), checkout = join(dir, 'site'), artifact = join(dir, 'artifact');
  const git = async args => (await run('git', ['-c', 'user.name=Test', '-c', 'user.email=test@example.com', '-c', 'commit.gpgsign=false', ...args])).stdout.trim();
  try {
    await git(['init', '--bare', '--quiet', remote]);
    await git(['clone', '--quiet', remote, checkout]);
    await writeFile(join(checkout, '.nojekyll'), '');
    await git(['-C', checkout, 'add', '.']); await git(['-C', checkout, 'commit', '--quiet', '-m', 'Initial site']);
    await git(['-C', checkout, 'push', '--quiet', 'origin', 'HEAD:gh-pages']);
    await git(['-C', checkout, 'remote', 'set-url', 'origin', 'https://github.com/owner/site.git']);
    await mkdir(artifact);
    await writeFile(join(artifact, 'index.html'), '<!doctype html><title>Review</title>');
    await writeFile(join(artifact, 'review.json'), '{"version":1}');
    await writeFile(join(artifact, 'context.json'), 'Must remain local.');
    const calls = [];
    const execute = (command, args, options) => {
      calls.push(args);
      const rewrite = args.includes('fetch') || args.includes('push') ? ['-c', `url.${remote}.insteadOf=https://github.com/owner/site.git`] : [];
      return run(command, ['-c', 'user.name=Test', '-c', 'user.email=test@example.com', '-c', 'commit.gpgsign=false', ...rewrite, ...args], options);
    };
    const config = { checkout, repo: 'owner/site', branch: 'gh-pages', prefix: 'reviews', url: 'https://example.com/site' };
    const result = await publish(config, { repo: 'owner/repo', number: 1, id: 12 }, 'a'.repeat(40), artifact, execute);
    assert.match(result.url, /reviews\/owner\/repo\/1\/a{40}\/12\/$/);
    const files = await git(['--git-dir', remote, 'ls-tree', '-r', '--name-only', 'gh-pages']);
    assert.match(files, /index.html/);
    assert.ok(!files.includes('context.json'));
    assert.ok(calls.every(args => !args.some(arg => arg.includes('--force'))));
    const message = await git(['--git-dir', remote, 'log', '-1', '--format=%B', 'gh-pages']);
    assert.equal(message, 'Add review for owner/repo #1');
    await writeFile(join(checkout, 'unrelated.txt'), 'Keep me.');
    await assert.rejects(() => publish(config, { repo: 'owner/repo', number: 1, id: 12 }, 'a'.repeat(40), artifact, execute), /local changes/);
    assert.equal(await readFile(join(checkout, 'unrelated.txt'), 'utf8'), 'Keep me.');
  } finally { await rm(dir, { recursive: true, force: true }); }
});

test('waits for successful CI and the matching live revision before allowing a reply', async () => {
  let calls = 0, fetches = 0;
  const options = {
    execute: async () => ({ stdout: JSON.stringify([{ status: ++calls === 1 ? 'in_progress' : 'completed', conclusion: calls === 1 ? '' : 'success' }]) }),
    delay: async () => {},
    fetchURL: async () => { fetches++; return { ok: true, json: async () => ({ review: { head: 'a'.repeat(40) } }) }; },
  };
  await waitForPublication({ repo: 'owner/site' }, { commit: 'b'.repeat(40), url: 'https://example.com/review/' }, 'a'.repeat(40), options);
  assert.equal(calls, 2); assert.equal(fetches, 1);
  await assert.rejects(() => waitForPublication({ repo: 'owner/site' }, {}, '', { ...options, execute: async () => ({ stdout: '[{"status":"completed","conclusion":"failure"}]' }) }), /CI failed/);
});
