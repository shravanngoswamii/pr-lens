#!/usr/bin/env node
import { readFile, writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { validate } from '../src/document.js';

const usage = 'Usage: review-docs validate review.json\n       review-docs render review.json --out review.html';
try {
  const [command, input, flag, output, ...extra] = process.argv.slice(2);
  if (!['validate', 'render'].includes(command) || !input || extra.length ||
      (command === 'validate' && flag) || (command === 'render' && (flag !== '--out' || !output))) throw new Error(usage);
  if (command === 'render' && resolve(input) === resolve(output)) throw new Error('Output must differ from the editable input');
  const doc = validate(JSON.parse(await readFile(input, 'utf8')));
  if (command === 'validate') console.log(`${input}: valid structure (relationships still need review)`);
  else {
    const { render } = await import('../src/render.js');
    await writeFile(output, await render(doc));
    console.log(output);
  }
} catch (error) {
  console.error(`review-docs: ${error.message}`);
  process.exitCode = 1;
}
