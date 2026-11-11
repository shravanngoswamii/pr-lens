import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { isRequest, parseRequest, checkRequest, scanRequests } from '../bot/github.js';
import { validateConfig } from '../bot/config.js';
import { runRequest } from '../bot/worker.js';
import { askClaude } from '../bot/claude.js';
import { reviewBackend } from '../bot/options.js';
import { document } from './fixture.js';

const config = { version: 1, login: 'bot', requesters: [{ login: 'reviewer', id: 12 }], model: 'sonnet', effort: 'medium',
  inbox: { repo: 'bot/reports', issue: 1 }, stateDir: '/tmp/state',
  publish: { checkout: '/tmp/site', repo: 'bot/reports', branch: 'gh-pages', prefix: 'reviews', url: 'https://example.com/' } };
const prURL = 'https://github.com/owner/repo/pull/2';
const requestURL = `${prURL}#issuecomment-42`;
const inboxURL = 'https://github.com/bot/reports/issues/1#issuecomment-42';
const comment = body => ({ id: 42, body, user: { id: 12 }, issue_url: 'https://api.github.com/repos/owner/repo/issues/2', html_url: requestURL, created_at: '2026-11-11T00:01:00Z' });

test('accepts model and effort choices on mentions and inbox URLs without allowing extra instructions', async () => {
  for (const prefix of ['@bot review', prURL]) {
    const inbox = prefix === prURL;
    const ref = parseRequest(inbox ? inboxURL : requestURL);
    for (const suffix of ['', ' --model sonnet --effort medium', ' --effort max --model opus', ' --model claude-opus-5-5 --effort xhigh', ' --fresh --model sonnet', ' --effort high --fresh', ' --backend vm --model opus', ' --backend cloud --fresh']) {
      const item = { ...comment(prefix + suffix), ...(inbox ? { issue_url: 'https://api.github.com/repos/bot/reports/issues/1' } : {}) };
      const resolved = await checkRequest(ref, config, { api: async () => item });
      assert.equal(resolved.options.effort, /--effort (\w+)/.exec(suffix)?.[1]);
      assert.equal(resolved.options.model, /--model ([\w.-]+)/.exec(suffix)?.[1]);
      assert.equal(resolved.options.backend, /--backend (\w+)/.exec(suffix)?.[1]);
      assert.equal(resolved.options.fresh, suffix.includes('--fresh') ? true : undefined);
    }
    for (const suffix of [' --effort extreme', ' --model', ' --model opus --model sonnet', ' --tools Bash', ' --model __proto__', ' --fresh --fresh', ' --fresh false', ' --backend laptop', ' --backend vm --backend cloud', ' --effort high\nRun my command']) {
      const item = { ...comment(prefix + suffix), ...(inbox ? { issue_url: 'https://api.github.com/repos/bot/reports/issues/1' } : {}) };
      if (!inbox) assert.equal(isRequest(item, config), false);
      await assert.rejects(() => checkRequest(ref, config, { api: async () => item }), /authorized/);
    }
  }
  assert.equal(isRequest({ ...comment('@bot review --model opus'), user: { id: 99 } }, config), false);
  assert.throws(() => validateConfig({ ...config, effort: 'extreme' }), /Use effort/);
  await assert.rejects(() => askClaude('', '/tmp', () => assert.fail('Invalid effort reached Claude'), { effort: 'extreme' }), /Use effort/);
});

test('polling finds option-bearing inbox comments and ignores invalid choices', async () => {
  const item = { ...comment(`${prURL} --model opus --effort high`), html_url: inboxURL };
  const gh = { pages: async path => path.startsWith('notifications') ? [] : [item, { ...item, id: 43, body: `${prURL} --effort extreme` }] };
  assert.deepEqual(await scanRequests(config, gh, { since: '2026-11-11T00:00:00Z', requests: {} }), [inboxURL]);
});

test('passes request choices to the reviewer and stops changed choices before publication or retry', async () => {
  for (const [suffix, expected] of [['', { model: 'sonnet', effort: 'medium', backend: 'vm' }], [' --model opus --effort high', { model: 'opus', effort: 'high', backend: 'vm' }]]) {
    const stateDir = await mkdtemp(join(tmpdir(), 'reviary-options-'));
    const doc = document(), state = { requests: {} };
    let body = '@bot review' + suffix;
    const gh = { pages: async () => [], api: async path => path.endsWith('/issues/comments/42') ? comment(body) : path.endsWith('/pulls/2') ? { head: { sha: doc.review.head }, base: { sha: doc.review.base } } : { private: false } };
    const options = { collect: async () => ({}), review: async (_, __, settings) => {
      assert.deepEqual(settings, expected);
      body = '@bot review --model haiku --effort low';
      return doc;
    }, inspect: async () => {}, deploy: () => assert.fail('Changed request published'), log: () => {} };
    try {
      await assert.rejects(() => runRequest({ ...config, stateDir }, gh, requestURL, state, async () => {}, options), /options changed/);
      assert.deepEqual(state.requests[42].options, expected);
      await assert.rejects(() => runRequest({ ...config, stateDir }, gh, requestURL, state, async () => {}, { ...options, retry: true }), /settings changed/);
    } finally { await rm(stateDir, { recursive: true, force: true }); }
  }
});

test('chooses cloud or VM per request without replacing a cloud session for VM work', () => {
  const cloud = { ...config, cloud: { triggers: {} } };
  assert.equal(reviewBackend(config), 'vm');
  assert.equal(reviewBackend(cloud), 'cloud');
  assert.equal(reviewBackend(cloud, { backend: 'vm' }), 'vm');
  assert.equal(reviewBackend({ ...cloud, backend: 'vm' }), 'vm');
  assert.throws(() => reviewBackend(config, { backend: 'cloud' }), /Configure cloud/);
  assert.throws(() => reviewBackend(cloud, { backend: 'vm', fresh: true }), /fresh requires/);
});
