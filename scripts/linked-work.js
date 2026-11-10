#!/usr/bin/env node
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { createHash } from 'node:crypto';
import { writeFile } from 'node:fs/promises';
import { pathToFileURL } from 'node:url';
import { validateLinkedWork } from '../src/linked-work.js';

const exec = promisify(execFile);
const hash = text => createHash('sha256').update(text).digest('hex');
const key = item => `${item.repo.toLowerCase()}#${item.number}`;
const itemId = item => `gh-${hash(key(item))}`;
const repoPattern = /^[a-zA-Z0-9-]+\/[a-zA-Z0-9_.-]+$/;

export function parseItem(url) {
  let parsed;
  try { parsed = new URL(url); } catch { throw new Error('Use a GitHub issue or PR URL'); }
  const match = parsed.pathname.match(/^\/([^/]+\/[^/]+)\/(issues|pull)\/([1-9]\d*)(?:\/.*)?$/);
  if (parsed.protocol !== 'https:' || parsed.hostname !== 'github.com' || parsed.username || parsed.password || !match || !repoPattern.test(match[1])) throw new Error('Use a GitHub issue or PR URL');
  if (!Number.isSafeInteger(Number(match[3]))) throw new Error('Invalid issue number');
  return { repo: match[1], number: Number(match[3]), kind: match[2] === 'pull' ? 'pr' : 'issue' };
}

export function references(text, repo) {
  const found = new Map();
  const notes = [];
  const add = item => found.set(key(item), item);
  const rest = text.replace(/https?:\/\/[^\s<>"']+/gi, raw => {
    try { add(parseItem(raw.replace(/[).,;\]]+$/, ''))); } catch { /* Other URLs are outside this collector's scope. */ }
    return ' ';
  }).replace(/(?:([a-zA-Z0-9-]+\/[a-zA-Z0-9_.-]+))?#([1-9]\d*)\s*(?:-|–|—|\.\.)\s*#([1-9]\d*)\b/g, (raw, otherRepo, start, end) => {
    start = Number(start); end = Number(end);
    if (!Number.isSafeInteger(start) || !Number.isSafeInteger(end) || end < start || end - start > 1000) notes.push(`Reference range ${raw} was not expanded. Inspect it manually.`);
    else for (let number = start; number <= end; number++) add({ repo: otherRepo ?? repo, number, kind: 'unknown' });
    return ' ';
  });
  for (const match of rest.matchAll(/(?<![\w/])(?:([a-zA-Z0-9-]+\/[a-zA-Z0-9_.-]+))?#([1-9]\d*)\b/g)) {
    const number = Number(match[2]);
    if (Number.isSafeInteger(number)) add({ repo: match[1] ?? repo, number, kind: 'unknown' });
  }
  return { items: [...found.values()], notes };
}

export async function ghRead(endpoint, paginate = false) {
  try {
    const { stdout } = await exec('gh', ['api', '--method', 'GET', '-H', 'Accept: application/vnd.github+json',
      ...(paginate ? ['--paginate', '--slurp'] : []), endpoint], { encoding: 'utf8', maxBuffer: 32 * 1024 * 1024, timeout: 60000 });
    const data = JSON.parse(stdout);
    return paginate ? data.flat() : data;
  } catch (cause) {
    const rateLimited = /rate limit/i.test(cause.stderr ?? '');
    const status = cause.stderr?.match(/HTTP (\d+)/)?.[1];
    const error = new Error(rateLimited ? 'GitHub rate limit reached' : `GitHub item could not be read${status ? ` (HTTP ${status})` : ''}`);
    error.rateLimited = rateLimited;
    throw error;
  }
}

export async function collectLinkedWork(url, { maxDepth = 3, maxItems = 60, read = ghRead, onProgress = () => {} } = {}) {
  for (const [name, value, min] of [['maxDepth', maxDepth, 0], ['maxItems', maxItems, 1]]) if (value !== null && (!Number.isSafeInteger(value) || value < min)) throw new Error(`Invalid ${name}`);
  const root = parseItem(url);
  const nodes = new Map();
  const edges = new Map();
  const records = [];
  const queue = [];
  const notes = new Set();
  let attempted = 0;
  let stopped = false;
  function discover(item, depth) {
    const id = itemId(item);
    if (!nodes.has(id)) {
      nodes.set(id, { id, url: `https://github.com/${item.repo}/${item.kind === 'pr' ? 'pull' : 'issues'}/${item.number}`,
        title: `${item.repo}#${item.number}`, kind: item.kind, state: 'unknown', summary: 'Not read. Its role still needs review.', status: 'unread' });
      queue.push({ ...item, depth });
    }
    return id;
  }
  function connect(parent, item, label, evidence) {
    const from = itemId(parent);
    const to = discover(item, parent.depth + 1);
    const id = `edge-${hash(`${from}:${to}:${label}`)}`;
    if (!edges.has(id)) edges.set(id, { id, from, to, label, text: 'A collected reference. Explain its design role after reading the linked work.', evidence: [] });
    const edge = edges.get(id);
    if (!edge.evidence.some(entry => entry.url === evidence.url && entry.text === evidence.text)) edge.evidence.push(evidence);
  }
  discover(root, 0);
  for (let i = 0; i < queue.length; i++) {
    const item = queue[i];
    const node = nodes.get(itemId(item));
    if (stopped || maxItems !== null && attempted >= maxItems || maxDepth !== null && item.depth > maxDepth) {
      node.detail = stopped ? 'Collection stopped after a GitHub rate limit.' : item.depth > maxDepth && maxDepth !== null ? 'Depth limit. This item was discovered but not read.' : 'Item budget. This item was discovered but not read.';
      continue;
    }
    attempted++;
    const endpoint = `repos/${item.repo}/issues/${item.number}`;
    let issue;
    try { issue = await read(endpoint); }
    catch (error) { node.status = 'unreadable'; node.detail = error.message; stopped ||= Boolean(error.rateLimited); continue; }
    node.kind = issue.pull_request ? 'pr' : 'issue';
    node.url = issue.html_url;
    node.title = issue.title;
    node.state = issue.state;
    node.status = 'read';
    node.summary = 'Read the collected body and discussion, then explain this item in your own words.';
    const jobs = [
      ['comments', `${endpoint}/comments?per_page=100`, true],
      ['timeline', `${endpoint}/timeline?per_page=100`, true],
      ...(node.kind === 'pr' ? [
        ['pr', `repos/${item.repo}/pulls/${item.number}`, false],
        ['reviews', `repos/${item.repo}/pulls/${item.number}/reviews?per_page=100`, true],
        ['inline', `repos/${item.repo}/pulls/${item.number}/comments?per_page=100`, true],
      ] : []),
    ];
    const results = await Promise.allSettled(jobs.map(([, path, paginate]) => read(path, paginate)));
    const data = {};
    results.forEach((result, index) => {
      if (result.status === 'fulfilled') data[jobs[index][0]] = result.value;
      else {
        node.status = 'partial';
        node.detail = 'Some discussion or metadata could not be read.';
        notes.add(`${node.url}: ${jobs[index][0]} could not be read.`);
        stopped ||= Boolean(result.reason.rateLimited);
      }
    });
    if (data.pr?.merged_at) node.state = 'merged';
    const texts = [{ body: issue.body ?? '', url: node.url, location: 'body' },
      ...['comments', 'reviews', 'inline'].flatMap(name => (data[name] ?? []).map(entry => ({ body: entry.body ?? '', url: entry.html_url ?? node.url, location: name })))];
    for (const text of texts) {
      const refs = references(text.body, item.repo);
      refs.notes.forEach(note => notes.add(`${text.url}: ${note}`));
      for (const reference of refs.items) connect(item, reference, 'mentions', { url: text.url, text: `Reference in ${text.location}.` });
    }
    for (const event of data.timeline ?? []) if (event.event === 'cross-referenced' && event.source?.issue?.html_url) {
      try { connect(item, parseItem(event.source.issue.html_url), 'referenced by', { url: node.url, text: 'Cross-reference listed in this item’s GitHub timeline.' }); }
      catch { notes.add(`${node.url}: a timeline reference could not be parsed.`); }
    }
    records.push({ id: node.id, updatedAt: issue.updated_at, body: issue.body ?? '', discussion: texts.slice(1),
      ...(data.pr ? { base: data.pr.base.sha, head: data.pr.head.sha } : {}) });
    onProgress({ attempted, discovered: nodes.size });
  }
  const block = { type: 'linked-work', id: 'linked-work', title: 'Linked issues and pull requests',
    text: 'Discovery paths, not a dependency order. Descriptions and relationship meanings still need an agent review.',
    root: itemId(root), checkedAt: new Date().toISOString(), scope: 'GitHub issue/PR references in bodies, paginated comments, review submissions and inline comments, plus incoming cross-references exposed by issue timelines. Text references can include examples or quoted text and need interpretation.',
    analysis: 'draft', complete: [...nodes.values()].every(node => node.status === 'read') && !notes.size,
    limits: { maxDepth, maxItems }, notes: [...notes], nodes: [...nodes.values()], edges: [...edges.values()] };
  validateLinkedWork(block);
  return { version: 1, block, records };
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  try {
    const [url, ...args] = process.argv.slice(2);
    const options = {};
    if (!url || args.length % 2) throw new Error('Usage: linked-work.js PR_URL --out facts.json [--max-depth 3|all] [--max-items 60|all]');
    for (let i = 0; i < args.length; i += 2) {
      if (!['--out', '--max-depth', '--max-items'].includes(args[i]) || Object.hasOwn(options, args[i])) throw new Error('Unknown or repeated option');
      options[args[i]] = args[i + 1];
    }
    if (!options['--out']) throw new Error('--out is required');
    const limit = (name, fallback) => options[name] === undefined ? fallback : options[name] === 'all' ? null : Number(options[name]);
    const result = await collectLinkedWork(url, { maxDepth: limit('--max-depth', 3), maxItems: limit('--max-items', 60),
      onProgress: ({ attempted, discovered }) => { if (attempted % 5 === 0) console.error(`Read ${attempted} items. Discovered ${discovered}.`); } });
    await writeFile(options['--out'], JSON.stringify(result, null, 2) + '\n');
    console.log(`${options['--out']}: ${result.block.nodes.length} discovered, ${result.block.nodes.filter(node => node.status === 'read').length} fully read. Complete: ${result.block.complete}.`);
    if (result.block.nodes.find(node => node.id === result.block.root).status === 'unreadable') process.exitCode = 1;
  } catch (error) { console.error(`review-docs: ${error.message}`); process.exitCode = 1; }
}
