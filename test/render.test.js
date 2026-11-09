import { test } from 'node:test';
import assert from 'node:assert/strict';
import { execFileSync, spawnSync } from 'node:child_process';
import { mkdtemp, writeFile, readFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { document } from './fixture.js';

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
