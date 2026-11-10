import { test } from 'node:test';
import assert from 'node:assert/strict';
import { chapters } from '../src/chapters.js';
import { validate } from '../src/document.js';
import { document } from './fixture.js';

test('groups the reading path while preserving section ids and optional views', () => {
  const doc = document();
  doc.sections[0].group = 'design';
  doc.sections.unshift({ id: 'intro', title: 'The problem', group: 'overview', blocks: [{ type: 'text', text: 'An explanation.' }] });
  doc.sections.push({ id: 'inventory', title: 'Definitions', group: 'details', blocks: [{ type: 'text', text: 'Supporting evidence.' }] });
  assert.deepEqual(chapters(validate(doc)).map(c => [c.id, c.sections, Boolean(c.supporting)]), [
    ['view-overview', ['intro'], false], ['view-design', ['design'], false], ['view-details', ['inventory'], true],
  ]);
  delete doc.sections[1].group;
  assert.throws(() => validate(doc), /set group on every section/);
});
