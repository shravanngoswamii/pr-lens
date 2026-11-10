import { test } from 'node:test';
import assert from 'node:assert/strict';
import { document } from './fixture.js';
import { extract } from '../src/extract.js';

test('reads generated data without executing scripts and accepts older exports without feedback', () => {
  const html = `<script>throw new Error('must not run')</script><script type='application/json' id='review-data'>${JSON.stringify(document())}</script>`;
  const result = extract(html);
  assert.deepEqual(result.doc, document());
  assert.deepEqual(result.feedback.comments, []);
  assert.throws(() => extract(html + html), /More than one/);
  assert.throws(() => extract('<html>Unrelated file</html>'), /No embedded/);
});
