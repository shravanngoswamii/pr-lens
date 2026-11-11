import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, writeFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { saveCloudAuth } from '../bot/cloud-auth.js';

test('stores the refresh token through stdin and keeps scopes in a repository variable', async () => {
  const dir = await mkdtemp(join(tmpdir(), 'reviary-auth-test-'));
  const calls = [];
  try {
    await writeFile(join(dir, '.credentials.json'), JSON.stringify({ claudeAiOauth: { refreshToken: 'private-refresh', accessToken: 'private-access', scopes: ['user:profile', 'user:sessions:claude_code'] } }));
    await saveCloudAuth(dir, 'bot/reports', async (command, args, options) => { calls.push({ command, args, options }); });
    assert.equal(calls[0].command, 'gh');
    assert.deepEqual(calls[0].args, ['secret', 'set', 'CLAUDE_CODE_OAUTH_REFRESH_TOKEN', '--repo', 'bot/reports']);
    assert.equal(calls[0].options.input, 'private-refresh');
    assert.equal(calls[1].args.at(-1), 'user:profile user:sessions:claude_code');
    assert.ok(calls.every(call => !call.args.join(' ').includes('private-')));
  } finally { await rm(dir, { recursive: true, force: true }); }
});

test('rejects inference-only credentials before writing cloud secrets', async () => {
  const dir = await mkdtemp(join(tmpdir(), 'reviary-auth-scope-'));
  try {
    await writeFile(join(dir, '.credentials.json'), JSON.stringify({ claudeAiOauth: { refreshToken: 'private', scopes: ['user:inference'] } }));
    await assert.rejects(() => saveCloudAuth(dir, 'bot/reports', () => assert.fail('Inference token stored')), /dedicated cloud directory/);
  } finally { await rm(dir, { recursive: true, force: true }); }
});
