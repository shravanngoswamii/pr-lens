import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, mkdir, writeFile, readFile, access, rm, stat } from 'node:fs/promises';
import { join, dirname } from 'node:path';
import { tmpdir } from 'node:os';
import { hostedConfig, checkHostedActor, scanHosted, setupHosted, compactState } from '../bot/hosted.js';
import { validateConfig } from '../bot/config.js';
import { github, isRequest } from '../bot/github.js';
import { claudeEnvironment } from '../bot/claude.js';
import { configureBot } from '../scripts/configure-bot.js';

const input = { version: 1, login: 'review-bot', requesters: [{ login: 'reviewer', id: 12 }, { login: 'mentor', id: 34 }], stateDir: 'state',
  publish: { checkout: 'site', repo: 'owner/site', branch: 'gh-pages', prefix: 'reviews', url: 'https://example.com/site' } };

test('creates a portable configuration with resolved requester identities', async () => {
  const execute = async (command, args) => {
    assert.equal(command, 'gh');
    assert.deepEqual(args, ['api', 'users/reviewer']);
    return { stdout: '{"login":"reviewer","id":12}' };
  };
  const result = await configureBot('my-bot', 'my-bot/reports', ['reviewer'], execute);
  assert.deepEqual(result.requesters, [{ login: 'reviewer', id: 12 }]);
  assert.equal(result.publish.url, 'https://my-bot.github.io/reports');
  await assert.rejects(() => configureBot('my-bot', 'my-bot/reports', ['../user'], execute), /Usage/);
  await assert.rejects(() => configureBot('my-bot', 'my-bot/reports', ['reviewer', 'reviewer'], execute), /Duplicate/);
});

test('pins requester identities and restricts manual hosted dispatches', () => {
  const config = hostedConfig(input, '/tmp/hosted');
  assert.equal(config.stateDir, '/tmp/hosted/state');
  for (const id of [12, 34]) assert.equal(isRequest({ user: { id, login: 'renamed-account' }, body: '@review-bot review' }, config), true);
  assert.equal(isRequest({ user: { id: 99, login: 'reviewer' }, body: '@review-bot review' }, config), false);
  assert.throws(() => checkHostedActor(config, { GITHUB_EVENT_NAME: 'workflow_dispatch', GITHUB_ACTOR_ID: '99' }), /cannot dispatch/);
  checkHostedActor(config, { GITHUB_EVENT_NAME: 'workflow_dispatch', GITHUB_ACTOR_ID: '12' });
  assert.throws(() => validateConfig({ ...config, requesters: [{ login: 'reviewer', id: '12' }] }), /numeric account/);
  assert.throws(() => validateConfig({ ...config, requesters: [config.requesters[0], config.requesters[0]] }), /Duplicate/);
});

test('passes subscription tokens to Claude while keeping GitHub credentials out', () => {
  assert.deepEqual(claudeEnvironment({ CLAUDE_CODE_OAUTH_TOKEN: 'subscription', GH_TOKEN: 'github', GITHUB_TOKEN: 'actions', ANTHROPIC_API_KEY: 'api' }), { CLAUDE_CODE_OAUTH_TOKEN: 'subscription' });
});

test('uses the runner GitHub identity without changing local gh-sandbox behavior', async () => {
  const calls = [];
  const gh = github(hostedConfig(input, '/tmp'), async (command, args) => { calls.push([command, args]); return { stdout: 'HTTP/2 200 OK\n\n{"login":"review-bot"}' }; });
  await gh.api('user');
  assert.equal(calls[0][0], 'gh');
  assert.equal(calls[0][1][0], 'api');
});

test('checks requests before starting Claude and advances idle checkpoints', async () => {
  const dir = await mkdtemp(join(tmpdir(), 'review-docs-hosted-scan-'));
  const config = hostedConfig(input, dir);
  const paths = [];
  const gh = { api: async () => ({ login: 'review-bot' }), pages: async path => { paths.push(path); return []; } };
  try {
    assert.equal(await scanHosted(config, gh), false);
    assert.match(paths[0], /^notifications\?all=true/);
    const state = JSON.parse(await readFile(join(config.stateDir, 'state.json')));
    assert.ok(Date.parse(state.since) > Date.parse(config.since));
    const url = 'https://github.com/owner/repo/pull/1#issuecomment-2';
    const forged = { ...gh, api: async path => path === 'user' ? { login: 'review-bot' } : { user: { login: 'reviewer', id: 99 }, body: '@review-bot review', issue_url: 'https://api.github.com/repos/owner/repo/issues/1' } };
    await assert.rejects(() => scanHosted(config, forged, url), /not an authorized/);
  } finally { await rm(dir, { recursive: true, force: true }); }
});

test('caches completed metadata while retaining failed review artifacts for retry', async () => {
  const dir = await mkdtemp(join(tmpdir(), 'review-docs-hosted-state-'));
  const config = hostedConfig(input, dir);
  try {
    for (const name of ['12', '34', 'review-56', 'lock']) await mkdir(join(config.stateDir, name), { recursive: true });
    await writeFile(join(config.stateDir, '12', 'index.html'), 'Completed report');
    await writeFile(join(config.stateDir, '34', 'index.html'), 'Failed report');
    const file = join(config.stateDir, 'state.json');
    await writeFile(file, JSON.stringify({ version: 1, since: config.since, requests: {
      12: { status: 'posted', comment: 'https://github.com/owner/repo/pull/1#issuecomment-12', document: '/old/report.json', directory: '/old/dir' },
      34: { status: 'failed', document: 'Keep for retry' },
      'review-56': { status: 'posted', comment: 'Review reply', directory: '/old/dir' },
    } }));
    await compactState(config);
    const state = JSON.parse(await readFile(file));
    assert.equal(state.requests[12].document, undefined);
    assert.equal(state.requests[34].document, 'Keep for retry');
    assert.equal(state.requests['review-56'].directory, undefined);
    await assert.rejects(() => access(join(config.stateDir, '12')));
    await assert.rejects(() => access(join(config.stateDir, 'review-56')));
    await assert.rejects(() => access(join(config.stateDir, 'lock')));
    await access(join(config.stateDir, '34', 'index.html'));
  } finally { await rm(dir, { recursive: true, force: true }); }
});

test('scopes the publishing key to its checkout and verifies GitHub SSH hosts', async () => {
  const dir = await mkdtemp(join(tmpdir(), 'review-docs-hosted-key-'));
  let keyDir;
  try {
    const config = hostedConfig(input, dir), calls = [];
    await setupHosted(config, { deployKey: '-----BEGIN OPENSSH PRIVATE KEY-----\nfixture\n-----END OPENSSH PRIVATE KEY-----', execute: async (command, args) => {
      calls.push([command, args]);
      return { stdout: args[0] === 'api' ? JSON.stringify(args[1] === 'user' ? { login: 'review-bot', id: 55 } : { ssh_keys: ['ssh-ed25519 public-host-key'] }) : '' };
    } });
    const ssh = calls.find(([, args]) => args.includes('core.sshCommand'))[1].at(-1);
    const key = ssh.match(/-i '([^']+)'/)[1]; keyDir = dirname(key);
    assert.equal((await stat(key)).mode & 0o777, 0o600);
    assert.match(ssh, /StrictHostKeyChecking=yes/);
    assert.match(await readFile(join(keyDir, 'known_hosts'), 'utf8'), /github.com ssh-ed25519/);
    assert.ok(calls.some(([, args]) => args.includes('--push') && args.at(-1) === 'git@github.com:owner/site.git'));
    assert.ok(!calls.some(([, args]) => args.includes('--global')));
    assert.ok(!JSON.stringify(config).includes('PRIVATE KEY'));
  } finally { await rm(dir, { recursive: true, force: true }); if (keyDir) await rm(keyDir, { recursive: true, force: true }); }
});

test('publishes with the bot token when it can push to the report repository', async () => {
  const calls = [], config = hostedConfig(input, '/tmp/hosted');
  const execute = async (command, args) => {
    calls.push([command, args]);
    return { stdout: command === 'gh' ? JSON.stringify(args[1] === 'user' ? { login: 'review-bot', id: 55 } : { permissions: { push: true } }) : '' };
  };
  await setupHosted(config, { deployKey: '', execute });
  assert.ok(calls.some(([, args]) => args.includes('!gh auth git-credential')));
  assert.ok(calls.every(([, args]) => !args.includes('--global') && !args.includes('core.sshCommand')));
  await assert.rejects(() => setupHosted(config, { deployKey: '', execute: async () => ({ stdout: '{"login":"review-bot","permissions":{"push":false}}' }) }), /push access/);
});
