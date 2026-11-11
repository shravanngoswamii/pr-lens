#!/usr/bin/env node
import { readFile, writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { validate } from '../src/document.js';
import { validateFeedback, buildPrompt } from '../src/feedback.js';

const usage = 'Usage: reviary validate review.json\n       reviary render review.json --out review.html [--feedback feedback.json]\n       reviary inventory REPO --base SHA --head SHA --out inventory.json [--scope src/,ext/]\n       reviary snapshot review.json --diagram ID --out design.json\n       reviary baseline review.json --from design.json --out updated.json\n       reviary prompt review.json --feedback feedback.json --out prompt.txt [--purpose review|code]\n       reviary extract review.html --out review.json --feedback-out feedback.json';
try {
  const [command, input, ...args] = process.argv.slice(2);
  const flags = { snapshot: ['--diagram', '--view', '--out'], baseline: ['--from', '--out'], validate: [], render: ['--out', '--feedback'], inventory: ['--base', '--head', '--out', '--scope'], prompt: ['--out', '--feedback', '--purpose'], extract: ['--out', '--feedback-out'] };
  if (!Object.hasOwn(flags, command) || !input || args.length % 2) throw new Error(usage);
  const options = {};
  for (let i = 0; i < args.length; i += 2) {
    if (!flags[command].includes(args[i]) || options[args[i]]) throw new Error(usage);
    options[args[i]] = args[i + 1];
  }
  const output = options['--out'];
  if (command !== 'validate' && !output || command === 'prompt' && !options['--feedback']) throw new Error(usage);
  if (command === 'extract' && !options['--feedback-out']) throw new Error(usage);
  if (output && [input, options['--feedback'], options['--from']].filter(Boolean).some(path => resolve(path) === resolve(output))) throw new Error('Output must differ from the editable input and feedback');
  if (command === 'inventory') {
    const { inventory } = await import('../scripts/inventory.js');
    await writeFile(output, JSON.stringify(inventory(input, options['--base'], options['--head'], options['--scope']?.split(',')), null, 2) + '\n');
    console.log(output);
  } else if (command === 'extract') {
    if ([input, output].some(path => resolve(path) === resolve(options['--feedback-out']))) throw new Error('Extraction outputs must differ from each other and the HTML input');
    const { extract } = await import('../src/extract.js');
    const { doc, feedback } = extract(await readFile(input, 'utf8'));
    await writeFile(output, JSON.stringify(doc, null, 2) + '\n');
    await writeFile(options['--feedback-out'], JSON.stringify(feedback, null, 2) + '\n');
    console.log(`${output}\n${options['--feedback-out']}`);
  } else {
    const parsed = JSON.parse(await readFile(input, 'utf8'));
    const doc = command === 'baseline' ? parsed : validate(parsed);
    if (command === 'snapshot' || command === 'baseline') {
      const { snapshot, attachBaseline } = await import('../src/snapshot.js');
      const result = command === 'snapshot' ? snapshot(doc, options['--diagram'], options['--view']) : attachBaseline(doc, JSON.parse(await readFile(options['--from'], 'utf8')));
      await writeFile(output, JSON.stringify(result, null, 2) + '\n'); console.log(output);
    } else {
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
  }
} catch (error) {
  console.error(`reviary: ${error.message}`);
  process.exitCode = 1;
}
