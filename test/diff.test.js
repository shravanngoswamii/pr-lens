import { test } from 'node:test';
import assert from 'node:assert/strict';
import { applyPatch } from 'diff';
import { suggestedDiff } from '../src/diff.js';
import { validate } from '../src/document.js';
import { document } from './fixture.js';
import { buildTaskPrompt } from '../src/feedback.js';

test('generates applicable patches and useful line numbers from a single pair of snippets', () => {
  for (const [before, after] of [['one\ntwo\n', 'one\nthree\n'], ['', 'new file\n'], ['delete\n', ''], ['a', 'b']]) {
    const diff = suggestedDiff({ path: 'src/file.jl', before, after });
    assert.equal(applyPatch(before, diff.patch), after);
  }
  const { rows } = suggestedDiff({ path: 'file', before: 'one\ntwo\n', after: 'one\nthree\n' });
  assert.deepEqual(rows.find(r => r.kind === 'removed'), { kind: 'removed', mark: '-', oldLine: 2, newLine: '', text: 'two' });
  assert.deepEqual(rows.find(r => r.kind === 'added'), { kind: 'added', mark: '+', oldLine: '', newLine: 2, text: 'three' });
});

test('requires scoped suggestions and copies tasks with exact source revisions', () => {
  const doc = document();
  const block = { type: 'diff', title: 'A change', text: 'Why it helps.', path: 'src/file.jl', before: '', after: 'hello', scope: 'suggestion', verification: 'unverified' };
  doc.sections[0].blocks.push(block, { type: 'proposal', title: 'A shorter title', text: 'Use the public name.', kind: 'title', current: 'Old title', suggested: 'New title' },
    { type: 'prompt', title: 'Inspect this', text: 'Resolve the open question.', instructions: 'Check the selected overload.' });
  validate(doc);
  block.path = '../secret'; assert.throws(() => validate(doc), /relative path/);
  block.path = 'file'; block.verification = 'proved'; assert.throws(() => validate(doc), /source-checked/);
  const prompt = buildTaskPrompt(doc, 'Check the selected overload.');
  assert.ok(prompt.includes(doc.review.head) && prompt.includes(doc.review.base));
  assert.match(prompt, /Check the selected overload\./);
});
