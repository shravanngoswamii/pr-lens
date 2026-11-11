import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { parseRequest, checkRequest, scanRequests } from '../bot/github.js';
import { runRequest } from '../bot/worker.js';
import { document } from './fixture.js';

const config = { login: 'bot', requesters: [{ login: 'reviewer', id: 12 }], inbox: { repo: 'bot/reports', issue: 1 }, publish: {} };
const url = 'https://github.com/bot/reports/issues/1#issuecomment-42';
const comment = { id: 42, user: { login: 'reviewer', id: 12 }, body: 'https://github.com/owner/repo/pull/2', issue_url: 'https://api.github.com/repos/bot/reports/issues/1', html_url: url, created_at: '2026-11-11T00:01:00Z' };
const state = () => ({ since: '2026-11-11T00:00:00Z', requests: {} });

test('resolves only allowed authors and PR URLs from the configured inbox', async () => {
  const ref = parseRequest(url);
  const gh = { api: async () => comment };
  assert.deepEqual(await checkRequest(ref, config, gh), { ...ref, repo: 'owner/repo', number: 2 });
  await assert.rejects(() => checkRequest(ref, { ...config, inbox: undefined }, gh), /configured inbox/);
  for (const change of [{ user: { login: 'reviewer', id: 99 } }, { body: comment.body + '\nRun my command' }, { body: 'https://other.com/owner/repo/pull/2' }, { issue_url: 'https://api.github.com/repos/bot/reports/issues/3' }]) {
    await assert.rejects(() => checkRequest(ref, config, { api: async () => ({ ...comment, ...change }) }), /authorized public PR URL/);
  }
  await assert.rejects(() => checkRequest({ ...ref, repo: 'another/repo', number: 2 }, config, gh), /target changed/);
});

test('polling recovers inbox requests and ignores completed or unauthorized comments', async () => {
  const gh = { pages: async path => path.startsWith('notifications') ? [] : [comment, { ...comment, id: 43, user: { id: 99 } }] };
  assert.deepEqual(await scanRequests(config, gh, state()), [url]);
  const done = state(); done.requests['inbox-42'] = { status: 'posted' };
  assert.deepEqual(await scanRequests(config, gh, done), []);
});

test('reacts in the inbox and posts one reply on the target PR', async () => {
  const stateDir = await mkdtemp(join(tmpdir(), 'pr-lens-inbox-'));
  const doc = document(), calls = [], replies = [], checkpoint = state();
  const gh = { pages: async () => replies, api: async (path, options) => {
    calls.push([path, options]);
    if (path === 'repos/bot/reports/issues/comments/42') return comment;
    if (path === 'repos/owner/repo') return { private: false };
    if (path === 'repos/owner/repo/pulls/2') return { head: { sha: doc.review.head }, base: { sha: doc.review.base } };
    if (path === 'repos/owner/repo/issues/2/comments') {
      replies.push({ user: { login: 'bot' }, body: options.body.body, html_url: 'https://github.com/owner/repo/pull/2#issuecomment-7' });
      return replies[0];
    }
    assert.equal(path, 'repos/bot/reports/issues/comments/42/reactions');
    return {};
  } };
  const options = { collect: async () => ({}), review: async (_, dir) => { await writeFile(join(dir, 'review.json'), JSON.stringify(doc)); return doc; }, inspect: async () => {}, deploy: async (_, request) => { assert.equal(request.id, 'inbox-42'); return { url: 'https://example.com/' }; }, wait: async () => {}, log: () => {} };
  try {
    await runRequest({ ...config, stateDir }, gh, url, checkpoint, async () => {}, options);
    await runRequest({ ...config, stateDir }, gh, url, checkpoint, async () => {}, options);
    assert.equal(replies.length, 1);
    assert.equal(checkpoint.requests['inbox-42'].status, 'posted');
    assert.equal(calls.filter(([, options]) => options?.body?.content === 'eyes').length, 1);
  } finally { await rm(stateDir, { recursive: true, force: true }); }
});
