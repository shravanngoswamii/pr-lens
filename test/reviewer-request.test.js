import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, writeFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { parseRequest, scanRequests, checkRequest } from '../bot/github.js';
import { runRequest } from '../bot/worker.js';
import { document } from './fixture.js';

const config = { login: 'bot', requesters: [{ login: 'reviewer', id: 12 }], publish: {} };
const url = 'https://github.com/owner/repo/pull/1#event-42';
const event = { id: 42, event: 'review_requested', actor: { login: 'reviewer', id: 12 }, requested_reviewer: { login: 'bot' }, created_at: '2026-11-11T00:01:00Z' };
const pr = { requested_reviewers: [{ login: 'bot' }], head: { sha: 'b'.repeat(40) }, base: { sha: 'a'.repeat(40) } };
const notification = { subject: { type: 'PullRequest', url: 'https://api.github.com/repos/owner/repo/pulls/1' } };
const state = () => ({ since: '2026-11-11T00:00:00Z', requests: {} });
const api = (events, current = pr) => ({
  pages: async path => path.startsWith('notifications') ? [notification] : path.endsWith('/timeline') ? events : [],
  api: async path => path.endsWith('/pulls/1') ? current : { private: false },
});

test('finds reviewer requests by account id and ignores removed or replaced requests', async () => {
  assert.deepEqual(parseRequest(url), { repo: 'owner/repo', number: 1, id: 'review-42', eventId: 42 });
  assert.deepEqual(await scanRequests(config, api([event]), state()), [url]);
  for (const events of [
    [{ ...event, actor: { login: 'reviewer', id: 99 } }],
    [event, { ...event, id: 43, event: 'review_request_removed' }],
    [event, { ...event, id: 43, actor: { id: 99 } }],
    [{ ...event, requested_reviewer: { login: 'another-bot' } }],
    [{ ...event, created_at: '2026-11-10T00:00:00Z' }],
  ]) assert.deepEqual(await scanRequests(config, api(events), state()), []);
  const done = state(); done.requests['review-42'] = { status: 'posted' };
  assert.deepEqual(await scanRequests(config, api([event]), done), []);
});

test('requires an active request from an allowed actor before spending model allowance', async () => {
  const request = parseRequest(url);
  await checkRequest(request, config, api([event]));
  for (const gh of [api([event], { ...pr, requested_reviewers: [] }), api([{ ...event, actor: { id: 99 } }]), api([event, { ...event, id: 43 }])]) {
    await assert.rejects(() => checkRequest(request, config, gh), /active or authorized/);
    await assert.rejects(() => runRequest(config, gh, url, state(), async () => {}, { collect: () => assert.fail('Unauthorized collection') }), /active or authorized/);
  }
});

test('submits a comment review at the checked commit and recovers a lost response', async () => {
  const stateDir = await mkdtemp(join(tmpdir(), 'reviary-reviewer-'));
  const doc = document(); doc.review.base = pr.base.sha; doc.review.head = pr.head.sha;
  const reviews = [], steps = [], checkpoint = state();
  const gh = api([event]);
  const pages = gh.pages;
  gh.pages = path => path.endsWith('/reviews') ? reviews : pages(path);
  gh.api = async (path, options) => {
    if (path.endsWith('/pulls/1')) return pr;
    if (path.endsWith('/reviews') && options?.method === 'POST') {
      assert.equal(options.body.event, 'COMMENT');
      assert.equal(options.body.commit_id, doc.review.head);
      reviews.push({ body: options.body.body, user: { login: 'bot' }, html_url: 'https://github.com/owner/repo/pull/1#pullrequestreview-7' });
      throw new Error('Response lost');
    }
    assert.ok(!path.includes('/reactions'));
    return { private: false };
  };
  const options = {
    collect: async () => ({}), review: async (_, dir) => { steps.push('review'); await writeFile(join(dir, 'review.json'), JSON.stringify(doc)); return doc; },
    inspect: async () => { steps.push('inspect'); }, deploy: async () => { steps.push('publish'); return { url: 'https://example.com/' }; }, wait: async () => { steps.push('wait'); }, log: () => {},
  };
  try {
    await assert.rejects(() => runRequest({ ...config, stateDir }, gh, url, checkpoint, async () => {}, options), /Response lost/);
    assert.deepEqual(steps, ['review', 'inspect', 'publish', 'wait']);
    pr.requested_reviewers = [];
    await runRequest({ ...config, stateDir }, gh, url, checkpoint, async () => {}, { ...options, retry: true });
    assert.equal(checkpoint.requests['review-42'].status, 'posted');
    assert.equal(reviews.length, 1);
  } finally { pr.requested_reviewers = [{ login: 'bot' }]; await rm(stateDir, { recursive: true, force: true }); }
});

test('stops a cancelled request before publishing', async () => {
  const stateDir = await mkdtemp(join(tmpdir(), 'reviary-cancel-'));
  const events = [event], gh = api(events);
  try {
    await assert.rejects(() => runRequest({ ...config, stateDir }, gh, url, state(), async () => {}, {
      collect: async () => ({}), review: async () => { events.push({ ...event, id: 43, event: 'review_request_removed' }); return document(); },
      inspect: async () => {}, deploy: () => assert.fail('Cancelled publication'), log: () => {},
    }), /active or authorized/);
  } finally { await rm(stateDir, { recursive: true, force: true }); }
});
