import { test } from 'node:test';
import assert from 'node:assert/strict';
import { validate, toMermaid } from '../src/document.js';
import { graphView } from '../src/design.js';
import { coverage } from '../src/inventory.js';
import { snapshot, attachBaseline } from '../src/snapshot.js';
import { targets } from '../src/feedback.js';
import { designDocument } from './design-fixture.js';
import { execFileSync } from 'node:child_process';
import { mkdtempSync, writeFileSync, readFileSync, rmSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';

test('compares stable graph IDs and retains both routes when an edge changes target', () => {
  const doc = validate(designDocument()); const graph = doc.sections[0].blocks[0];
  const changes = graphView(graph, doc);
  assert.deepEqual(changes.nodes.map(node => [node.id, node.change]), [['f', 'changed'], ['kept', 'unchanged'], ['new', 'added'], ['old', 'removed']]);
  assert.deepEqual(changes.edges.map(edge => [edge.to, edge.change]), [['old', 'removed'], ['new', 'changed']]);
  assert.deepEqual(graphView(graph, doc, 'base').nodes, graph.baseline.nodes);
  assert.deepEqual(graphView(graph, doc, 'head').nodes, graph.nodes);
  assert.match(toMermaid(changes), /classDef added/);
  assert.match(toMermaid(changes), /linkStyle 0/);
  const oldTarget = targets(doc).find(target => target.target.node === 'old');
  assert.ok(oldTarget.signature.includes('old(x::Int)'));
  assert.ok(oldTarget.refs.includes('base-code'));
  assert.equal(coverage(doc.sections[1].blocks[0]).filter(item => !item.links.length && !item.reason).length, 1);
});

test('rejects stale baselines, invalid coverage and contradictory inventory records', () => {
  for (const [edit, error] of [
    [d => { d.sections[0].blocks[0].baseline.revision = 'c'.repeat(40); }, /baseline must match/],
    [d => { d.sections[0].blocks[0].baseline.edges[0].to = 'missing'; }, /unknown node/],
    [d => { d.sections[0].blocks[0].baseline.nodes[0].refs = ['code']; }, /baseline code links/],
    [d => { d.sections[1].blocks[0].data.head = 'c'.repeat(40); }, /inventory revisions/],
    [d => { d.sections[1].blocks[0].links[0].node = 'missing'; }, /missing definition/],
    [d => { d.sections[1].blocks[0].links[0].node = 'new'; }, /kind does not match/],
    [d => { d.sections[1].blocks[0].omissions.push({ definition: 'def-f', reason: 'Too detailed.' }); }, /already diagrammed/],
    [d => { d.sections[1].blocks[0].data.items[0].before.fingerprint = 'b'.repeat(64); }, /unchanged syntax/],
  ]) { const doc = designDocument(); edit(doc); assert.throws(() => validate(doc), error); }
});

test('CLI round-trips a snapshot and resolves removed-node placements when attaching the baseline', () => {
  const dir = mkdtempSync(join(tmpdir(), 'reviary-snapshot-'));
  const base = designDocument();
  const head = designDocument(); delete head.sections[0].blocks[0].baseline;
  const input = join(dir, 'base.json'); const current = join(dir, 'head.json'); const saved = join(dir, 'design.json'); const output = join(dir, 'review.json');
  try {
    writeFileSync(input, JSON.stringify(base)); writeFileSync(current, JSON.stringify(head));
    execFileSync(process.execPath, ['bin/reviary.js', 'snapshot', input, '--diagram', 'calls', '--view', 'base', '--out', saved]);
    execFileSync(process.execPath, ['bin/reviary.js', 'baseline', current, '--from', saved, '--out', output]);
    const result = validate(JSON.parse(readFileSync(output, 'utf8')));
    assert.equal(result.sections[0].blocks[0].baseline.revision, base.review.base);
    assert.deepEqual(result.sections[1].blocks[0].links, head.sections[1].blocks[0].links);
    assert.deepEqual(JSON.parse(readFileSync(current, 'utf8')), head);
  } finally { rmSync(dir, { recursive: true, force: true }); }
});

test('exports a reusable head snapshot and imports its pinned sources without collisions', () => {
  const base = designDocument(); const graph = base.sections[0].blocks[0];
  base.sections = [base.sections[0]]; base.review.head = base.review.base;
  graph.nodes = graph.baseline.nodes; graph.edges = graph.baseline.edges; delete graph.baseline;
  const saved = snapshot(base, 'calls');
  saved.sources[0].id = 'code'; saved.nodes.forEach(node => { if (node.refs) node.refs = ['code']; }); saved.edges.forEach(edge => { edge.refs = ['code']; });
  const head = designDocument(); delete head.sections[0].blocks[0].baseline; head.sections[1].blocks[0].links.pop();
  const attached = attachBaseline(head, saved);
  assert.ok(attached.sources.some(source => source.id === 'calls-base-code'));
  assert.equal(attached.sections[0].blocks[0].baseline.nodes[0].refs[0], 'calls-base-code');
  assert.ok(!head.sections[0].blocks[0].baseline);
  assert.throws(() => attachBaseline(head, { ...saved, revision: head.review.head }), /differs from/);
  assert.throws(() => attachBaseline(head, { ...saved, repository: 'https://github.com/other/repo' }), /different repository/);
  assert.ok(!snapshot(attached, 'calls').baseline);
});
