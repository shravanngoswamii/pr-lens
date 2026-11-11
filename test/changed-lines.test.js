import { test } from 'node:test';
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { mkdtempSync, writeFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { changedLines } from '../scripts/changed-lines.js';

test('reports additions, deletions and zero-length hunk sides from exact revisions', () => {
  const dir = mkdtempSync(join(tmpdir(), 'reviary-diff-'));
  const git = args => execFileSync('git', ['-C', dir, ...args], { encoding: 'utf8' }).trim();
  const commit = () => { git(['add', '.']); git(['-c', 'user.name=Test', '-c', 'user.email=test@example.com', 'commit', '-qm', 'Change the fixture']); return git(['rev-parse', 'HEAD']); };
  try {
    git(['init', '-q']);
    writeFileSync(join(dir, 'old.jl'), 'old(x) = x\n');
    writeFileSync(join(dir, 'both.jl'), 'same(x) = x\n');
    const base = commit();
    rmSync(join(dir, 'old.jl'));
    writeFileSync(join(dir, 'new file.jl'), 'new(x) = x + 1\n');
    writeFileSync(join(dir, 'both.jl'), 'same(x) = x + 2\n');
    const head = commit();
    const result = changedLines(dir, base, head);
    assert.equal(result.files.length, 3);
    assert.deepEqual(result.files.find(f => f.path === 'new file.jl').hunks[0].added, ['new(x) = x + 1']);
    assert.equal(result.files.find(f => f.path === 'old.jl').hunks[0].newCount, 0);
    assert.deepEqual(result.files.find(f => f.path === 'both.jl').hunks[0].removed, ['same(x) = x']);
    assert.throws(() => changedLines(dir, 'main', head), /full base/);
  } finally { rmSync(dir, { recursive: true, force: true }); }
});
