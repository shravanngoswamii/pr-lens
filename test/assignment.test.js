import { test } from 'node:test';
import assert from 'node:assert/strict';
import { cloudAssignment, cloudPrompt } from '../bot/assignment.js';
import { document } from './fixture.js';

const config = { publish: { repo: 'bot/reports', branch: 'gh-pages' } };
const request = { id: 'inbox-42', repo: 'owner/repo', number: 1 };
const session = { id: 'session_01EEEEEEEEEEEEEEEEEEEEEE' };
const tool = { repository: 'owner/reviewer', ref: 'c'.repeat(40) };
const missing = () => { throw Object.assign(new Error('Missing'), { status: 404 }); };

test('pins a small assignment and points a short prompt at its guides', async () => {
  const context = { review: document().review, body: 'Public PR body.', limits: ['Source only.'], source: [{ text: 'Do not copy this source cache.' }] };
  let saved, creates = 0;
  const gh = { api: async (path, options) => {
    if (!options && path.includes('/contents/')) {
      if (!saved) return missing();
      return { encoding: 'base64', size: saved.length, content: Buffer.from(saved).toString('base64') };
    }
    if (!options && path.endsWith('/heads/gh-pages')) return { object: { sha: 'd'.repeat(40) } };
    if (!options) return saved ? { object: { sha: 'e'.repeat(40) } } : missing();
    if (options.method === 'POST') { creates++; assert.equal(options.body.ref, 'refs/heads/claude/reviary-inbox-42'); return {}; }
    assert.equal(options.method, 'PUT');
    saved = Buffer.from(options.body.content, 'base64').toString();
    return { commit: { sha: 'e'.repeat(40) } };
  } };
  const assignment = await cloudAssignment(gh, config, request, session, context, tool);
  assert.equal(creates, 1);
  assert.ok(!saved.includes('source cache'));
  const prompt = cloudPrompt(request, assignment);
  assert.ok(prompt.includes('SKILL.md, README.md and docs/bot-review.md'));
  assert.ok(prompt.includes(tool.ref));
  assert.ok(prompt.includes('/blob/' + 'e'.repeat(40)));
  assert.ok(!prompt.includes('Public PR body.'));
  assert.ok(prompt.length < 1000);
  const retry = await cloudAssignment(gh, config, request, session, { ...context, review: { ...context.review, checkedAt: '2026-11-11T12:00:00Z' } }, { ...tool, ref: 'f'.repeat(40) });
  assert.equal(creates, 1);
  assert.deepEqual(retry.tool, tool);
  await assert.rejects(() => cloudAssignment(gh, config, request, session, { ...context, review: { ...context.review, head: 'f'.repeat(40) } }, tool), /PR changed/);
  await assert.rejects(() => cloudAssignment(gh, config, request, { id: 'different' }, context, tool), /different request or session/);
});
