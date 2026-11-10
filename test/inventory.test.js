import { test } from 'node:test';
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { mkdtempSync, mkdirSync, writeFileSync, rmSync, readFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { inventory } from '../scripts/inventory.js';

test('compares parsed declarations without evaluating code and keeps scope and unknown expansion visible', () => {
  const dir = mkdtempSync(join(tmpdir(), 'review-docs-definitions-'));
  const git = args => execFileSync('git', ['-C', dir, ...args], { encoding: 'utf8' }).trim();
  const commit = () => { git(['add', '.']); git(['-c', 'user.name=Test', '-c', 'user.email=test@example.com', 'commit', '-qm', 'Change declarations']); return git(['rev-parse', 'HEAD']); };
  try {
    git(['init', '-q']); mkdirSync(join(dir, 'src')); mkdirSync(join(dir, 'test'));
    const file = join(dir, 'src', 'names "α".jl');
    writeFileSync(file, 'error("Do not load this file")\nmodule M\n"old docs"\nf(x::Int) = x\nf(x::String) = x\nstruct Box{T}\n value::T\nend\nold(x) = x\nend\n');
    writeFileSync(join(dir, 'test', 'outside.jl'), 'outside(x)=x\n');
    const base = commit();
    writeFileSync(file, 'error("Do not load this file")\nmodule M\n\n"new docs"\nf(x::Int) = x\nf(x::String) = length(x)\nstruct Box{T,S}\n value::String\nend\n@inline added(x::T) where T = x\n@eval generated(x) = x\nquote\n quoted(x) = x\nend\nend\n');
    writeFileSync(join(dir, 'test', 'outside.jl'), 'outside(x)=x+1\n');
    const head = commit();
    const result = inventory(dir, base, head);
    assert.equal(result.files.length, 1);
    assert.deepEqual(result.items.map(item => [item.name, item.change]).sort(), [['M.Box', 'changed'], ['M.added', 'added'], ['M.f', 'changed'], ['M.old', 'removed']]);
    assert.ok(result.items.find(item => item.name === 'M.f').signature.includes('String'));
    assert.ok(result.notes.some(note => note.text.includes('@eval')));
    assert.ok(result.notes.some(note => note.text.includes('Quoted code')));
    assert.equal(result.items.filter(item => item.name.includes('generated') || item.name.includes('quoted')).length, 0);
    assert.equal(result.items.find(item => item.name === 'M.added').after.locations[0].line, 10);
    assert.equal(inventory(dir, base, head, ['.']).items.length, 5);
    assert.throws(() => inventory(dir, 'main', head), /full base/);
    assert.throws(() => inventory(dir, base, head, ['../']), /relative scope/);
    const output = join(dir, 'inventory.json');
    execFileSync(process.execPath, ['bin/review-docs.js', 'inventory', dir, '--base', base, '--head', head, '--out', output]);
    assert.deepEqual(JSON.parse(readFileSync(output, 'utf8')), result);
    writeFileSync(file, 'function broken(');
    const broken = commit();
    assert.throws(() => inventory(dir, head, broken), /review-docs:/);
  } finally { rmSync(dir, { recursive: true, force: true }); }
});
