#!/usr/bin/env node
import { readFile } from 'node:fs/promises';
import { validateConfig } from '../bot/config.js';
import { github } from '../bot/github.js';
import { doctor, withState, runRequest, poll } from '../bot/worker.js';

try {
  const [command, path, flag, comment, ...rest] = process.argv.slice(2);
  if (!['doctor', 'watch', 'run', 'retry'].includes(command) || !path || rest.length || (['run', 'retry'].includes(command) ? flag !== '--comment' || !comment : flag !== undefined)) throw new Error('Usage: review-bot doctor|watch CONFIG\n       review-bot run|retry CONFIG --comment COMMENT_URL');
  const config = validateConfig(JSON.parse(await readFile(path, 'utf8')));
  const gh = github(config);
  const status = await doctor(config, gh);
  console.log(`GitHub: ${status.github}. Requests: ${status.requester}. Claude: ${status.claude}.`);
  if (command !== 'doctor') await withState(config, async (state, save) => {
    if (command !== 'watch') return runRequest(config, gh, comment, state, save, { retry: command === 'retry' });
    console.log('Watching new PR conversation mentions. Ctrl+C stops the worker.');
    while (true) {
      try { await poll(config, gh, state, save); }
      catch (error) { console.error(error.message); }
      await new Promise(resolve => setTimeout(resolve, gh.pollSeconds * 1000));
    }
  });
} catch (error) {
  console.error(`review-bot: ${error.message}`);
  process.exitCode = 1;
}
