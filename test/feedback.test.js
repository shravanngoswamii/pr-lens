import { test } from 'node:test';
import assert from 'node:assert/strict';
import { document } from './fixture.js';
import { emptyFeedback, validateFeedback, mergeFeedback, buildPrompt, describeTarget } from '../src/feedback.js';

const comment = (extra = {}) => ({ id: 'comment-one', target: { section: 'design', diagram: 'calls', node: 'f' }, kind: 'question',
  text: 'Explain this recursive call.\nCheck the Int overload.', author: 'Reviewer', status: 'open', base: 'a'.repeat(40), head: 'b'.repeat(40),
  createdAt: '2026-11-10T00:00:00Z', updatedAt: '2026-11-10T00:00:00Z', ...extra });
const feedback = (...comments) => ({ ...emptyFeedback(document()), comments });

test('prompt includes selected requests, exact revisions, signatures and pinned evidence', () => {
  const notes = feedback(comment(), comment({ id: 'other', text: 'Unselected request' }));
  const prompt = buildPrompt(document(), notes, { ids: ['comment-one'] });
  assert.ok(prompt.includes(document().review.head));
  assert.ok(prompt.includes(document().sources[0].url));
  assert.ok(prompt.includes('f(x::Int)'));
  assert.ok(prompt.includes('    Check the Int overload.'));
  assert.ok(!prompt.includes('Unselected request'));
  assert.match(buildPrompt(document(), notes, { purpose: 'code' }), /proposed fixes/);
  assert.throws(() => buildPrompt(document(), notes, { ids: [] }), /Select at least one/);
  assert.throws(() => buildPrompt(document(), notes, { ids: ['missing'] }), /Unknown comment/);
});

test('retains old or missing targets without presenting them as current source', () => {
  const notes = feedback(comment({ head: 'c'.repeat(40), target: { section: 'removed' } }));
  validateFeedback(notes, document());
  assert.equal(describeTarget(document(), notes.comments[0].target).missing, true);
  assert.match(buildPrompt(document(), notes), /target is absent/);
  assert.match(buildPrompt(document(), notes), /recorded context/);
});

test('merges additions and newer edits and rejects conflicting edits without mutating inputs', () => {
  const original = feedback(comment());
  const next = feedback(comment({ text: 'Updated request', updatedAt: '2026-11-10T00:01:00Z' }), comment({ id: 'second' }));
  const merged = mergeFeedback(original, next, document());
  assert.equal(merged.added, 1);
  assert.equal(merged.updated, 1);
  assert.equal(merged.feedback.comments[0].text, 'Updated request');
  assert.equal(original.comments[0].text, comment().text);
  assert.throws(() => mergeFeedback(original, feedback(comment({ text: 'Conflicting request' })), document()), /conflicting edits/);
});

test('rejects malformed feedback and files for a different review', () => {
  for (const edit of [
    f => { f.reviewUrl = 'https://github.com/other/repo/pull/1'; },
    f => { f.comments[0].text = ''; },
    f => { f.comments[0].target = { node: 'f' }; },
    f => { f.comments[0].status = 'unknown'; },
    f => { f.comments[0].head = 'main'; },
    f => { delete f.comments[0].id; },
    f => { f.comments[0].updatedAt = 'invalid'; },
    f => { f.comments.push(comment()); },
    f => { f.comments[0].html = '<b>not supported</b>'; },
  ]) {
    const notes = feedback(comment()); edit(notes); assert.throws(() => validateFeedback(notes, document()), /Feedback:/);
  }
});
