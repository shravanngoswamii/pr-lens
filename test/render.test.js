import { test } from 'node:test';
import assert from 'node:assert/strict';
import { execFileSync, spawnSync } from 'node:child_process';
import { mkdtemp, writeFile, readFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { document } from './fixture.js';
import { emptyFeedback } from '../src/feedback.js';

test('CLI validates and renders a source file without overwriting it', async () => {
  const dir = await mkdtemp(join(tmpdir(), 'review-docs-cli-'));
  const input = join(dir, 'review.json');
  const output = join(dir, 'review.html');
  try {
    await writeFile(input, JSON.stringify(document()));
    execFileSync(process.execPath, ['bin/review-docs.js', 'validate', input]);
    execFileSync(process.execPath, ['bin/review-docs.js', 'render', input, '--out', output]);
    const html = await readFile(output, 'utf8');
    assert.ok(html.includes('<h1>A small review</h1>'));
    assert.ok(!/<script[^>]+src=/.test(html));
    assert.deepEqual(JSON.parse(await readFile(input, 'utf8')), document());
    const result = spawnSync(process.execPath, ['bin/review-docs.js', 'render', input, '--out', input], { encoding: 'utf8' });
    assert.equal(result.status, 1);
    assert.match(result.stderr, /Output must differ/);
    await writeFile(input, '{invalid');
    const bad = spawnSync(process.execPath, ['bin/review-docs.js', 'validate', input], { encoding: 'utf8' });
    assert.equal(bad.status, 1);
    assert.match(bad.stderr, /review-docs:/);
  } finally { await rm(dir, { recursive: true, force: true }); }
});

test('CLI carries feedback through rendering and generates a prompt without overwriting it', async () => {
  const dir = await mkdtemp(join(tmpdir(), 'review-docs-feedback-cli-'));
  const input = join(dir, 'review.json');
  const notesFile = join(dir, 'feedback.json');
  const output = join(dir, 'review.html');
  const prompt = join(dir, 'prompt.txt');
  const doc = document();
  const feedback = { ...emptyFeedback(doc), comments: [{ id: 'note', target: {}, kind: 'question', text: 'Explain the public API.', author: '',
    status: 'open', base: doc.review.base, head: doc.review.head, createdAt: '2026-11-10T00:00:00Z', updatedAt: '2026-11-10T00:00:00Z' }] };
  try {
    await writeFile(input, JSON.stringify(doc));
    await writeFile(notesFile, JSON.stringify(feedback));
    execFileSync(process.execPath, ['bin/review-docs.js', 'render', input, '--feedback', notesFile, '--out', output]);
    const html = await readFile(output, 'utf8');
    assert.deepEqual(JSON.parse(html.match(/<script id="feedback-data" type="application\/json">(.*?)<\/script>/s)[1]), feedback);
    const recovered = join(dir, 'recovered.json');
    const recoveredFeedback = join(dir, 'recovered-feedback.json');
    execFileSync(process.execPath, ['bin/review-docs.js', 'extract', output, '--out', recovered, '--feedback-out', recoveredFeedback]);
    assert.deepEqual(JSON.parse(await readFile(recovered, 'utf8')), doc);
    assert.deepEqual(JSON.parse(await readFile(recoveredFeedback, 'utf8')), feedback);
    execFileSync(process.execPath, ['bin/review-docs.js', 'prompt', input, '--feedback', notesFile, '--purpose', 'code', '--out', prompt]);
    assert.match(await readFile(prompt, 'utf8'), /Explain the public API\./);
    const result = spawnSync(process.execPath, ['bin/review-docs.js', 'render', input, '--feedback', notesFile, '--out', notesFile], { encoding: 'utf8' });
    assert.equal(result.status, 1);
    assert.deepEqual(JSON.parse(await readFile(notesFile, 'utf8')), feedback);
  } finally { await rm(dir, { recursive: true, force: true }); }
});
