import { test } from 'node:test';
import assert from 'node:assert/strict';
import { sendCloud, checkCloud } from '../bot/cloud.js';

const session = 'session_01BBBBBBBBBBBBBBBBBBBBBB';

test('sends a follow-up to exactly one existing cloud session without creating or replacing it', async () => {
  let calls = 0;
  const execute = async (command, args, options) => {
    calls++;
    assert.equal(command, 'claude');
    assert.deepEqual(args, ['-p', '--cloud', session, '--output-format', 'json']);
    assert.equal(options.input, 'Review the new head.');
    assert.equal(options.env.GH_TOKEN, undefined);
    return { stdout: JSON.stringify({ ok: true, session_id: session }) };
  };
  assert.deepEqual(await sendCloud(session, 'Review the new head.', execute), { id: session, url: `https://claude.ai/code/${session}` });
  assert.equal(calls, 1);
  await assert.rejects(() => sendCloud('Create a new session', '', () => assert.fail('Invalid ID reached Claude')), /Invalid/);
});

test('stops on expired access, an unavailable session or a mismatched delivery receipt', async () => {
  for (const result of [{ ok: false, session_id: session, error: 'Archived' }, { ok: true, session_id: 'another-session' }]) {
    await assert.rejects(() => sendCloud(session, '', async () => ({ stdout: JSON.stringify(result) })), /did not accept|invalid cloud response/);
  }
  await assert.rejects(() => sendCloud(session, '', async () => { throw new Error('No login'); }), /Sign in/);
});

test('checks cloud access with a nonexistent session and never sends a review', async () => {
  await checkCloud(async (_, args, options) => {
    assert.equal(options.input, 'Connection check only. No work requested.');
    const id = args[args.indexOf('--cloud') + 1];
    throw Object.assign(new Error('Not found'), { stdout: JSON.stringify({ ok: false, session_id: id, error: `Session not found: ${id}` }) });
  });
  await assert.rejects(() => checkCloud(async (_, args) => ({ stdout: JSON.stringify({ ok: true, session_id: args[args.indexOf('--cloud') + 1] }) })), /could not be verified/);
  await assert.rejects(() => checkCloud(async (_, args) => ({ stdout: JSON.stringify({ ok: false, session_id: args[args.indexOf('--cloud') + 1], error: 'Missing scope. sk-ant-example-token' }) })), error => /Missing scope/.test(error.message) && !error.message.includes('sk-ant-'));
});

test('cloud delivery uses its cloud login even when a VM inference token is available', async () => {
  const previous = process.env.CLAUDE_CODE_OAUTH_TOKEN;
  process.env.CLAUDE_CODE_OAUTH_TOKEN = 'inference-only';
  try {
    await sendCloud(session, 'Review.', async (_, __, options) => {
      assert.equal(options.env.CLAUDE_CODE_OAUTH_TOKEN, undefined);
      return { stdout: JSON.stringify({ ok: true, session_id: session }) };
    });
  } finally {
    if (previous === undefined) delete process.env.CLAUDE_CODE_OAUTH_TOKEN;
    else process.env.CLAUDE_CODE_OAUTH_TOKEN = previous;
  }
});
