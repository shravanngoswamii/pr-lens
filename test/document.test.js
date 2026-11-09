import { test } from 'node:test';
import assert from 'node:assert/strict';
import { validate, toMermaid } from '../src/document.js';

import { document } from './fixture.js';

test('accepts cycles and references across sections', () => assert.equal(validate(document()).id, 'tiny'));

test('rejects broken references, typos, duplicate ids, unsafe URLs and moving code links', () => {
  for (const [edit, message] of [
    [d => { d.sections[0].blocks[0].edges[0].to = 'absent'; }, /unknown node absent/],
    [d => { d.sections[0].blocks[0].nodes[0].refs = ['absent']; }, /unknown source absent/],
    [d => { d.sections[0].blocks[0].nodes.push(d.sections[0].blocks[0].nodes[0]); }, /duplicate id f/],
    [d => { d.sections.push(d.sections[0]); }, /duplicate diagram id/],
    [d => { d.sources[0].url = 'javascript:alert(1)'; }, /HTTPS/],
    [d => { d.sources[0].url = 'https://github.com/a/b/blob/main/f.jl'; }, /full commit/],
    [d => { d.summary = ''; }, /nonempty string/],
    [d => { d.sections[0].blocks[0].nodes[0].summmary = 'typo'; }, /unknown field/],
    [d => { d.review.head = 'abc'; }, /40-character/],
    [d => { d.sections[0].blocks[0].edges[0].status = 'confirmed'; }, /source, observed, possible/],
    [d => { d.sections[0].blocks[0].nodes = null; }, /expected a nonempty array/],
  ]) {
    const doc = document(); edit(doc); assert.throws(() => validate(doc), message);
  }
});

test('generates Mermaid from ids without accepting syntax in labels', () => {
  const graph = document().sections[0].blocks[0];
  graph.nodes[0].label = '</script>\n%%{init: {}}%% " [x]';
  graph.edges[0].status = 'possible';
  const text = toMermaid(graph);
  assert.match(text, /n0 -\.->.*n0/);
  assert.ok(!text.includes('</script>'));
  assert.ok(!text.includes('%%'));
  assert.ok(!text.includes('[x]'));
});
