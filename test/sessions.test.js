import { test } from 'node:test';
import assert from 'node:assert/strict';
import { openSessions, prSession } from '../bot/sessions.js';

const first = 'session_01CCCCCCCCCCCCCCCCCCCCCC', second = 'session_01DDDDDDDDDDDDDDDDDDDDDD';
const request = { repositoryId: 123, number: 4, id: 'inbox-42' };
const registry = () => {
  let value = JSON.stringify({ version: 1, sessions: {} });
  return { api: async (path, options) => {
    assert.equal(path, 'repos/bot/reports/actions/variables/REVIARY_SESSIONS');
    if (options) { assert.equal(options.method, 'PATCH'); value = options.body.value; }
    return { value };
  } };
};

test('reuses the PR session across requests and worker restarts until fresh is explicit', async () => {
  const gh = registry(), store = await openSessions(gh, 'bot/reports');
  let calls = 0;
  const create = async () => ({ id: ++calls === 1 ? first : second, model: 'sonnet', effort: 'medium' });
  const original = await prSession(store, request, {}, create);
  const restarted = await openSessions(gh, 'bot/reports');
  assert.deepEqual(await prSession(restarted, { ...request, id: '43' }, {}, create), original);
  const next = await prSession(restarted, { ...request, id: '44' }, { fresh: true }, create);
  assert.equal(next.id, second);
  assert.equal(original.id, first);
  assert.equal(calls, 2);
  assert.deepEqual(await prSession(restarted, { ...request, id: '44' }, { fresh: true }, create), next);
  assert.equal(calls, 2);
  next.id = 'mutated';
  assert.equal((await prSession(restarted, request, {}, create)).id, second);
});

test('preserves an uncertain creation and stops retries from creating a duplicate session', async () => {
  const gh = registry(), store = await openSessions(gh, 'bot/reports');
  await assert.rejects(() => prSession(store, request, {}, async () => { throw new Error('Response lost'); }), /Response lost/);
  const restarted = await openSessions(gh, 'bot/reports');
  for (const options of [{}, { fresh: true }]) await assert.rejects(() => prSession(restarted, request, options, () => assert.fail('Duplicate creation')), /needs recovery/);
});

test('rejects a superseded fresh request after another session replaces it', async () => {
  const gh = registry(), store = await openSessions(gh, 'bot/reports');
  await prSession(store, request, { fresh: true }, async () => ({ id: first }));
  await prSession(store, { ...request, id: 'newer' }, { fresh: true }, async () => ({ id: second }));
  const restarted = await openSessions(gh, 'bot/reports');
  await assert.rejects(() => prSession(restarted, request, { fresh: true }, async () => ({ id: first })), /superseded/);
  assert.equal(restarted.get('123/4').session.id, second);
});

test('stops before creation when registry data is missing or cannot be saved', async () => {
  await assert.rejects(() => openSessions({ api: async () => { throw new Error('Missing'); } }, 'bot/reports'), /Restore REVIARY_SESSIONS/);
  await assert.rejects(() => openSessions({ api: async () => ({ value: '{"version":1,"sessions":[]}' }) }, 'bot/reports'), /Restore REVIARY_SESSIONS/);
  const gh = registry(), read = gh.api;
  gh.api = (path, options) => { if (options) throw new Error('Save failed'); return read(path); };
  const store = await openSessions(gh, 'bot/reports');
  await assert.rejects(() => prSession(store, request, {}, () => assert.fail('Untracked creation')), /Save failed/);
});

test('permits a retry when the provider explicitly rejected creation', async () => {
  const store = await openSessions(registry(), 'bot/reports');
  await assert.rejects(() => prSession(store, request, {}, async () => { throw Object.assign(new Error('Rate limited'), { notCreated: true }); }), /Rate limited/);
  assert.equal(store.get('123/4'), undefined);
  assert.equal((await prSession(store, request, {}, async () => ({ id: first }))).id, first);
});
