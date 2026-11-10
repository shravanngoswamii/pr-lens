import { mkdir, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { run } from './process.js';
import { collectLinkedWork } from '../scripts/linked-work.js';

const SHA = /^[a-f0-9]{40}$/;
const safePath = path => typeof path === 'string' && path.length < 500 && !path.startsWith('/') && !path.split('/').some(part => ['..', '.', ''].includes(part)) && !/[\0\r\n:]/.test(path);

export async function collectContext(gh, request, dir, { execute = run } = {}) {
  const endpoint = `repos/${request.repo}`;
  const pr = await gh.api(`${endpoint}/pulls/${request.number}`);
  const repo = await gh.api(endpoint);
  if (repo.private || pr.base.repo.private || pr.head.repo?.private) throw new Error('This publisher accepts public PRs only');
  if (![pr.base.sha, pr.head.sha].every(sha => SHA.test(sha))) throw new Error('PR revisions are missing');
  const comparison = await gh.api(`${endpoint}/compare/${pr.base.sha}...${pr.head.sha}`);
  const diffBase = comparison.merge_base_commit.sha;
  if (!SHA.test(diffBase)) throw new Error('PR merge base is missing');
  const repository = join(dir, 'source.git');
  await mkdir(repository);
  const git = async args => (await execute('git', ['-c', 'credential.helper=', '-c', 'core.hooksPath=/dev/null', '-C', repository, ...args], { timeout: 120000 })).stdout;
  await git(['init', '--bare', '--quiet']);
  await git(['fetch', '--quiet', '--depth=1', `https://github.com/${request.repo}.git`, ...new Set([pr.base.sha, diffBase, pr.head.sha])]);
  const tree = {};
  for (const [side, sha] of [['base', diffBase], ['head', pr.head.sha]]) {
    tree[side] = new Map((await git(['ls-tree', '-r', '-z', sha])).split('\0').filter(Boolean).map(line => {
      const [meta, path] = line.split('\t');
      return [path, meta.split(' ')];
    }).filter(([path, meta]) => safePath(path) && /^100(644|755)$/.test(meta[0]) && meta[1] === 'blob'));
  }
  const files = (await git(['diff', '--name-only', '--no-renames', '-z', diffBase, pr.head.sha])).split('\0').filter(Boolean);
  if (files.length > 100) throw new Error('More than 100 changed files. Review this PR interactively');
  const diff = await git(['diff', '--no-ext-diff', '--no-textconv', '--no-renames', '--unified=5', diffBase, pr.head.sha]);
  if (Buffer.byteLength(diff) > 500000) throw new Error('Diff exceeds 500 KB. Review this PR interactively');
  const publicRepos = new Map([[request.repo.toLowerCase(), true]]);
  const publicRead = async (path, paginate) => {
    const name = path.match(/^repos\/([^/]+\/[^/]+)/)?.[1];
    if (!name) throw new Error('Expected a repository API path');
    const key = name.toLowerCase();
    if (!publicRepos.has(key)) publicRepos.set(key, !(await gh.api(`repos/${name}`)).private);
    if (!publicRepos.get(key)) throw new Error('Private linked work is excluded');
    return gh.read(path, paginate);
  };
  const linked = await collectLinkedWork(pr.html_url, { read: publicRead, maxDepth: 2, maxItems: 15 });
  const context = { review: { url: pr.html_url, title: pr.title, base: pr.base.sha, head: pr.head.sha, ...(diffBase !== pr.base.sha ? { diffBase } : {}), checkedAt: new Date().toISOString() },
    body: pr.body ?? '', draft: pr.draft, files, trees: Object.fromEntries(Object.entries(tree).map(([side, paths]) => [side, [...paths.keys()]])), diff, linked, source: [], limits: ['Source review only. PR code, package setup and runtime tests were not executed.', 'Linked work: public repositories only, depth 2, at most 15 items. Read status describes collection, not semantic review.'] };
  let bytes = Buffer.byteLength(JSON.stringify(context));
  async function readFiles(requests) {
    if (!Array.isArray(requests) || requests.length > 40) throw new Error('Invalid source request count');
    for (const item of requests) {
      if (!item || !['base', 'head'].includes(item.revision) || !safePath(item.path)) throw new Error('Invalid source request');
      if (context.source.some(source => source.path === item.path && source.revision === item.revision)) continue;
      const meta = tree[item.revision].get(item.path);
      if (!meta) { context.limits.push(`${item.revision}:${item.path} is absent or not a regular file.`); continue; }
      const size = Number((await git(['cat-file', '-s', meta[2]])).trim());
      if (size > 100000) { context.limits.push(`${item.revision}:${item.path} exceeds 100 KB and was not read.`); continue; }
      if (bytes + size > 1500000) throw new Error('Source context exceeds 1.5 MB. Review this PR interactively');
      const text = await git(['cat-file', 'blob', meta[2]]);
      if (text.includes('\0')) { context.limits.push(`${item.path} is binary and was not read.`); continue; }
      bytes += size;
      const sha = item.revision === 'head' ? pr.head.sha : diffBase;
      const lines = text.split('\n');
      if (lines.at(-1) === '') lines.pop();
      context.source.push({ ...item, sha, lines: lines.length, text: lines.map((line, i) => `${i + 1}: ${line}`).join('\n') });
    }
  }
  const instructions = [...tree.head.keys()].filter(path => /(^|\/)(AGENTS|CLAUDE)\.md$/.test(path) && (!path.includes('/') || files.some(file => file.startsWith(path.slice(0, path.lastIndexOf('/') + 1)))));
  await readFiles([...new Set(['README.md', 'Project.toml', 'package.json', ...instructions, ...files.slice(0, 25)])].filter(path => tree.head.has(path)).map(path => ({ path, revision: 'head' })).slice(0, 40));
  await readFiles(files.slice(0, 25).filter(path => tree.base.has(path)).map(path => ({ path, revision: 'base' })));
  if (files.some(path => path.endsWith('.jl'))) {
    try {
      const output = join(dir, 'inventory.json');
      await run(process.execPath, [new URL('../bin/review-docs.js', import.meta.url).pathname, 'inventory', repository, '--base', diffBase, '--head', pr.head.sha, '--scope', '.', '--out', output], { timeout: 120000 });
      const { readFile } = await import('node:fs/promises');
      context.inventory = JSON.parse(await readFile(output, 'utf8'));
    } catch { context.limits.push('Julia declaration inventory could not be collected. Definition coverage is unverified.'); }
  }
  await writeFile(join(dir, 'context.json'), JSON.stringify(context));
  return { context, readFiles };
}
