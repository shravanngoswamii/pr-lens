import { execFileSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { mkdtempSync, writeFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

export function inventory(repo, base, head, scope = ['src/', 'ext/']) {
  if (![base, head].every(sha => /^[a-f0-9]{40}$/.test(sha))) throw new Error('Use full base and head commit SHAs');
  if (!Array.isArray(scope) || !scope.length || scope.some(path => typeof path !== 'string' || !path || path.startsWith('/') || path.split('/').includes('..') || /[\0\r\n]/.test(path))) throw new Error('Use relative scope paths, or . for all Julia files');
  const git = args => execFileSync('git', ['-C', repo, ...args], { encoding: 'utf8', maxBuffer: 64 * 1024 * 1024 });
  const lists = new Map([base, head].map(sha => [sha, new Set(git(['ls-tree', '-r', '--name-only', '-z', sha]).split('\0').filter(Boolean))]));
  const files = git(['diff', '--name-only', '--no-renames', '-z', base, head, '--', '*.jl']).split('\0').filter(path => path && scope.some(prefix => prefix === '.' || path === prefix || path.startsWith(prefix.endsWith('/') ? prefix : prefix + '/'))).sort();
  const dir = mkdtempSync(join(tmpdir(), 'review-docs-inventory-'));
  try {
    const entries = [];
    for (const sha of [base, head]) for (const path of files) {
      if (!lists.get(sha).has(path)) continue;
      const file = join(dir, `${entries.length}.jl`);
      writeFileSync(file, git(['show', `${sha}:${path}`]));
      entries.push({ key: `${sha}:${path}`, file, path });
    }
    const manifest = join(dir, 'files.toml');
    writeFileSync(manifest, entries.map(entry => `[[files]]\n${Object.entries(entry).map(([key, value]) => `${key} = ${JSON.stringify(value)}`).join('\n')}\n`).join('\n'));
    const output = JSON.parse(execFileSync('julia', ['--startup-file=no', new URL('./definitions.jl', import.meta.url).pathname, manifest], { encoding: 'utf8', maxBuffer: 64 * 1024 * 1024 }));
    const parsed = output.files;
    const maps = [base, head].map(sha => {
      const result = new Map();
      for (const file of parsed.filter(file => file.key.startsWith(sha + ':'))) for (const definition of file.definitions) {
        const key = JSON.stringify([definition.path, definition.scope, definition.kind, definition.kind === 'type' ? definition.name : definition.signature]);
        const list = result.get(key) ?? []; list.push(definition); result.set(key, list);
      }
      return result;
    });
    const location = definitions => definitions && ({ signature: definitions[0].signature, fingerprint: createHash('sha256').update(definitions.map(d => d.fingerprint).sort().join('\n')).digest('hex'), locations: definitions.map(d => ({ path: d.path, line: d.line })) });
    const items = [];
    for (const key of [...new Set(maps.flatMap(map => [...map.keys()]))].sort()) {
      const before = location(maps[0].get(key)); const after = location(maps[1].get(key));
      if (before?.fingerprint === after?.fingerprint) continue;
      const definition = (maps[1].get(key) ?? maps[0].get(key))[0];
      items.push({ id: 'def-' + createHash('sha256').update(key).digest('hex').slice(0, 20), kind: definition.kind, name: definition.name, signature: definition.signature,
        change: !before ? 'added' : !after ? 'removed' : 'changed', ...(before ? { before } : {}), ...(after ? { after } : {}) });
    }
    const notes = parsed.flatMap(file => file.notes.map(note => ({ ...note, revision: file.key.slice(0, 40) })));
    return { version: 1, language: 'Julia', parser: `Julia ${output.julia_version} Meta.parseall`, base, head, scope, files, items, notes };
  } finally { rmSync(dir, { recursive: true, force: true }); }
}
