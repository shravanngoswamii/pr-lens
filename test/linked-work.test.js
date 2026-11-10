import { test } from 'node:test';
import assert from 'node:assert/strict';
import { collectLinkedWork, references, parseItem } from '../scripts/linked-work.js';
import { validate } from '../src/document.js';
import { document, linkedWork } from './fixture.js';

test('finds shorthand, ranges, cross-repo links and anchored URLs without treating URL fragments as issues', () => {
  const result = references('#2–#4 x/y#9 #2 https://github.com/x/y/pull/10/files#issuecomment-123 https://other.test/#999 word#30', 'a/b');
  assert.deepEqual(new Set(result.items.map(item => `${item.repo}#${item.number}`)), new Set(['a/b#2', 'a/b#3', 'a/b#4', 'x/y#9', 'x/y#10']));
  assert.equal(references('#4–#2', 'a/b').notes.length, 1);
  assert.throws(() => parseItem('https://github.com/a/b/blob/main/file#1'), /issue or PR/);
});

function reader({ failComments = false } = {}) {
  return async endpoint => {
    const number = Number(endpoint.match(/(?:issues|pulls)\/(\d+)/)[1]);
    if (/\/timeline\?/.test(endpoint)) return number === 1 ? [{ event: 'cross-referenced', source: { issue: { html_url: 'https://github.com/a/b/pull/3' } } }] : [];
    if (/\/comments\?/.test(endpoint)) {
      if (failComments && endpoint.includes('/issues/1/')) throw new Error('HTTP 403');
      return number === 1 ? [{ body: 'See #2.', html_url: 'https://github.com/a/b/pull/1#issuecomment-1' }] : [];
    }
    if (/\/reviews\?/.test(endpoint)) return [];
    if (endpoint.includes('/pulls/')) return { base: { sha: 'a'.repeat(40) }, head: { sha: 'b'.repeat(40) }, merged_at: null };
    return { title: `Item ${number}`, body: number === 2 ? 'Back to #1 and x/y#4.' : '', state: 'open',
      html_url: `https://github.com/a/b/pull/${number}`, pull_request: {}, updated_at: '2026-11-10T00:00:00Z' };
  };
}

test('collects discussion and incoming references once across cycles with explicit frontier limits', async () => {
  const limited = await collectLinkedWork('https://github.com/a/b/pull/1', { read: reader(), maxDepth: 1 });
  assert.equal(limited.block.nodes.length, 4);
  assert.deepEqual(limited.block.nodes.map(n => n.status), ['read', 'read', 'read', 'unread']);
  assert.match(limited.block.nodes[3].detail, /Depth limit/);
  assert.equal(limited.block.complete, false);
  assert.equal(limited.block.edges.filter(e => e.label === 'referenced by').length, 1);
  const all = await collectLinkedWork('https://github.com/a/b/pull/1', { read: reader(), maxDepth: null, maxItems: null });
  assert.equal(all.records.length, 4);
  assert.equal(all.block.complete, true);
  const budget = await collectLinkedWork('https://github.com/a/b/pull/1', { read: reader(), maxItems: 1 });
  assert.equal(budget.records.length, 1);
  assert.match(budget.block.nodes[1].detail, /Item budget/);
});

test('records access failures and stops new reads after a rate limit', async () => {
  const partial = await collectLinkedWork('https://github.com/a/b/pull/1', { read: reader({ failComments: true }) });
  assert.equal(partial.block.nodes[0].status, 'partial');
  assert.equal(partial.block.complete, false);
  assert.ok(partial.block.notes.length);
  const read = async endpoint => {
    if (endpoint === 'repos/a/b/issues/2') throw Object.assign(new Error('Rate limit'), { rateLimited: true });
    return reader()(endpoint);
  };
  const stopped = await collectLinkedWork('https://github.com/a/b/pull/1', { read });
  assert.deepEqual(stopped.block.nodes.map(n => n.status), ['read', 'unreadable', 'unread']);
  assert.match(stopped.block.nodes[2].detail, /rate limit/);
});

test('validates hierarchy references and refuses false completeness or unsafe evidence', () => {
  const doc = document(); doc.sections[0].blocks.push(linkedWork());
  validate(doc);
  for (const [edit, message] of [
    [b => { b.edges[0].to = 'missing'; }, /unknown node/],
    [b => { b.complete = true; }, /complete cannot/],
    [b => { b.edges[0].evidence[0].url = 'javascript:alert(1)'; }, /HTTPS/],
    [b => { b.nodes[0].status = 'confirmed'; }, /read status/],
  ]) {
    const copy = structuredClone(doc); edit(copy.sections[0].blocks[1]); assert.throws(() => validate(copy), message);
  }
});
