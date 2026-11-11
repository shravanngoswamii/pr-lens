import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, rm, readFile } from 'node:fs/promises';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { reviewCloud, cloudCreator, cloudResult } from '../bot/cloud-review.js';
import { document } from './fixture.js';

const id = 'session_01EEEEEEEEEEEEEEEEEEEEEE';
const tool = { repository: 'owner/tool', ref: 'c'.repeat(40) };
const request = { repo: 'owner/repo', number: 1, id: '42', options: {} };
const config = { cloud: { triggers: {} }, publish: { repo: 'bot/reports', branch: 'gh-pages' } };
const fixture = () => {
  const doc = document();
  doc.sections[0].group = 'design';
  doc.sections.unshift({ id: 'overview', title: 'Overview', group: 'overview', blocks: [{ type: 'text', text: 'The change.' }] });
  doc.sections.push({ id: 'review', title: 'Review', group: 'review', blocks: [{ type: 'text', text: 'The result.' }] });
  const collected = { context: { review: structuredClone(doc.review), source: [{ path: 'src/code.jl', sha: doc.review.head, lines: 1 }], limits: ['Source review only.'] }, readFiles: async files => assert.deepEqual(files, [{ path: 'src/code.jl', revision: 'head' }]) };
  let registry = { version: 1, sessions: { '123/1': { status: 'ready', request: 'bootstrap', session: { id, model: 'sonnet', effort: 'medium' } } } }, ready = false;
  const gh = { api: async (path, options) => {
    if (path === 'repos/owner/repo') return { id: 123 };
    if (path.includes('/actions/variables/')) {
      if (options) registry = JSON.parse(options.body.value);
      return { value: JSON.stringify(registry) };
    }
    if (path.includes('reviary-request.json')) {
      if (!options) throw Object.assign(new Error('Missing'), { status: 404 });
      return { commit: { sha: 'd'.repeat(40) } };
    }
    if (path.includes('/git/ref/')) return { object: { sha: 'e'.repeat(40) } };
    assert.equal(path, 'repos/bot/reports/contents/reviary-result.json?ref=claude%2Freviary-42');
    if (!ready) throw Object.assign(new Error('Missing'), { status: 404 });
    return { encoding: 'base64', size: 1000, content: Buffer.from(JSON.stringify({ request: '42', session: id, document: doc })).toString('base64') };
  } };
  return { doc, collected, gh, ready: () => { ready = true; } };
};

test('reuses a cloud session, validates its output and renders a source-linked report', async () => {
  const dir = await mkdtemp(join(tmpdir(), 'reviary-cloud-review-'));
  const value = fixture();
  value.doc.review.checkedAt = '2026-11-11T16:00:00Z';
  let sends = 0;
  try {
    const result = await reviewCloud(config, value.gh, request, value.collected, dir, {}, { tool, send: async (session, prompt) => {
      sends++;
      assert.equal(session, id);
      assert.ok(prompt.includes('claude/reviary-42'));
      assert.ok(prompt.includes('docs/bot-review.md'));
      assert.ok(prompt.length < 1000);
      value.ready();
    }, delay: async () => {} });
    assert.equal(sends, 1);
    assert.equal(result.review.agent.session, `https://claude.ai/code/${id}`);
    assert.equal(result.review.agent.requestedModel, 'sonnet');
    assert.equal(result.review.checkedAt, value.collected.context.review.checkedAt);
    assert.equal(value.doc.review.checkedAt, '2026-11-11T16:00:00Z');
    assert.ok((await readFile(join(dir, 'index.html'), 'utf8')).includes('Open in Claude'));
  } finally { await rm(dir, { recursive: true, force: true }); }
});

test('a pending review survives retries without queuing the same message twice', async () => {
  const dir = await mkdtemp(join(tmpdir(), 'reviary-cloud-pending-'));
  const value = fixture();
  let sends = 0;
  const options = { tool, send: async () => { sends++; }, timeout: 0 };
  try {
    for (let i = 0; i < 2; i++) await assert.rejects(() => reviewCloud(config, value.gh, request, value.collected, dir, {}, options), /still pending/);
    assert.equal(sends, 1);
    value.ready();
    value.collected.context.review.checkedAt = '2026-11-11T16:05:00Z';
    const result = await reviewCloud(config, value.gh, request, value.collected, dir, {}, options);
    assert.equal(result.review.checkedAt, value.collected.context.review.checkedAt);
    assert.equal(sends, 1);
    await assert.rejects(() => reviewCloud(config, value.gh, { ...request, options: { model: 'opus' } }, value.collected, dir, {}, options), /needs --fresh/);
    value.doc.review.head = 'f'.repeat(40);
    await assert.rejects(() => reviewCloud(config, value.gh, request, value.collected, dir, {}, options), /review.head does not match/);
  } finally { await rm(dir, { recursive: true, force: true }); }
});

test('cloud creation uses only the selected subscription task and excludes GitHub credentials', async () => {
  const url = 'https://api.anthropic.com/v1/claude_code/routines/trig_test/fire';
  const create = cloudCreator({ cloud: { triggers: { 'opus/high': url } } }, 'opus', 'high', request, { tokens: '{"opus/high":"task-token"}', fetchURL: async (target, options) => {
    assert.equal(target, url);
    assert.equal(options.headers.Authorization, 'Bearer task-token');
    assert.ok(!options.body.includes('task-token'));
    assert.ok(JSON.parse(options.body).text.includes('Await a follow-up'));
    return { ok: true, json: async () => ({ claude_code_session_id: id }) };
  } });
  assert.deepEqual(await create(), { id, model: 'opus', effort: 'high' });
  assert.throws(() => cloudCreator(config, 'opus', 'high', request, { tokens: '{}' }), /Configure/);
  await assert.rejects(() => cloudResult({ api: async () => ({ encoding: 'base64', size: 10, content: Buffer.from('{"request":"other"}').toString('base64') }) }, 'bot/reports', request, { id }), /different request or session/);
});
