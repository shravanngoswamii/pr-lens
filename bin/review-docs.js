#!/usr/bin/env node
import { readFile, writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { validate } from '../src/document.js';
import { validateFeedback, buildPrompt } from '../src/feedback.js';

const usage = 'Usage: review-docs validate review.json\n       review-docs render review.json --out review.html [--feedback feedback.json]\n       review-docs prompt review.json --feedback feedback.json --out prompt.txt [--purpose review|code]\n       review-docs extract review.html --out review.json --feedback-out feedback.json';
try {
  const [command, input, ...args] = process.argv.slice(2);
  const flags = { validate: [], render: ['--out', '--feedback'], prompt: ['--out', '--feedback', '--purpose'], extract: ['--out', '--feedback-out'] };
  if (!Object.hasOwn(flags, command) || !input || args.length % 2) throw new Error(usage);
  const options = {};
  for (let i = 0; i < args.length; i += 2) {
    if (!flags[command].includes(args[i]) || options[args[i]]) throw new Error(usage);
    options[args[i]] = args[i + 1];
  }
  const output = options['--out'];
  if (command !== 'validate' && !output || command === 'prompt' && !options['--feedback']) throw new Error(usage);
  if (command === 'extract' && !options['--feedback-out']) throw new Error(usage);
  if (output && [input, options['--feedback']].filter(Boolean).some(path => resolve(path) === resolve(output))) throw new Error('Output must differ from the editable input and feedback');
  if (command === 'extract') {
    if ([input, output].some(path => resolve(path) === resolve(options['--feedback-out']))) throw new Error('Extraction outputs must differ from each other and the HTML input');
    const { extract } = await import('../src/extract.js');
    const { doc, feedback } = extract(await readFile(input, 'utf8'));
    await writeFile(output, JSON.stringify(doc, null, 2) + '\n');
    await writeFile(options['--feedback-out'], JSON.stringify(feedback, null, 2) + '\n');
    console.log(`${output}\n${options['--feedback-out']}`);
  } else {
    const doc = validate(JSON.parse(await readFile(input, 'utf8')));
    const feedback = options['--feedback'] ? validateFeedback(JSON.parse(await readFile(options['--feedback'], 'utf8')), doc) : undefined;
    if (command === 'validate') console.log(`${input}: valid structure (relationships still need review)`);
    else if (command === 'prompt') {
      await writeFile(output, buildPrompt(doc, feedback, { purpose: options['--purpose'] ?? 'review' }));
      console.log(output);
    } else {
      const { render } = await import('../src/render.js');
      await writeFile(output, await render(doc, { feedback }));
      console.log(output);
    }
  }
} catch (error) {
  console.error(`review-docs: ${error.message}`);
  process.exitCode = 1;
}
