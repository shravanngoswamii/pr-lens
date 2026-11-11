#!/usr/bin/env node
import { execFileSync } from 'node:child_process';

export function changedLines(repo, base, head) {
  if (![base, head].every(sha => /^[a-f0-9]{40}$/.test(sha))) throw new Error('Use full base and head commit SHAs');
  const git = args => execFileSync('git', ['-C', repo, ...args], { encoding: 'utf8', maxBuffer: 32 * 1024 * 1024 });
  for (const sha of [base, head]) git(['cat-file', '-e', `${sha}^{commit}`]);
  const paths = git(['diff', '--name-only', '-z', base, head, '--', '*.jl']).split('\0').filter(Boolean);
  const files = paths.map(path => {
    const diff = git(['diff', '--no-ext-diff', '--no-color', '--unified=0', base, head, '--', path]);
    const hunks = [];
    for (const line of diff.split('\n')) {
      const match = line.match(/^@@ -(\d+)(?:,(\d+))? \+(\d+)(?:,(\d+))? @@(.*)/);
      if (match) hunks.push({ oldStart: +match[1], oldCount: +(match[2] ?? 1), newStart: +match[3], newCount: +(match[4] ?? 1), context: match[5].trim(), added: [], removed: [] });
      else if (hunks.length && line.startsWith('+')) hunks.at(-1).added.push(line.slice(1));
      else if (hunks.length && line.startsWith('-')) hunks.at(-1).removed.push(line.slice(1));
    }
    return { path, hunks };
  });
  return { base, head, scope: 'Changed Julia lines and Git hunk context. Context is a text hint, not a parsed definition or call graph.', files };
}

if (process.argv[1] && import.meta.url === new URL(process.argv[1], 'file:').href) {
  try {
    const args = process.argv.slice(2);
    if (args.length !== 3) throw new Error('Usage: changed-lines.js REPO BASE_SHA HEAD_SHA');
    console.log(JSON.stringify(changedLines(...args), null, 2));
  } catch (err) { console.error(`reviary: ${err.message}`); process.exitCode = 1; }
}
