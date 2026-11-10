#!/usr/bin/env node
import { writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { run } from '../bot/process.js';
import { hostedConfig } from '../bot/hosted.js';

export async function configureBot(login, repo, requesters, execute = run) {
  const account = /^[A-Za-z0-9][A-Za-z0-9-]*$/;
  if (!account.test(login ?? '') || !/^[A-Za-z0-9-]+\/[A-Za-z0-9_.-]+$/.test(repo ?? '') || !requesters.length || !requesters.every(user => account.test(user))) throw new Error('Usage: node scripts/configure-bot.js BOT REPORT_REPO REQUESTER [REQUESTER...]');
  const users = [];
  for (const name of requesters) {
    const { stdout } = await execute('gh', ['api', `users/${name}`]);
    const user = JSON.parse(stdout);
    users.push({ login: user.login, id: user.id });
  }
  const [owner, name] = repo.split('/');
  const config = { version: 1, login, requesters: users, stateDir: 'output/bot-state',
    publish: { checkout: 'output/site', repo, branch: 'gh-pages', prefix: 'reviews', url: `https://${owner.toLowerCase()}.github.io/${name}` } };
  hostedConfig(config, process.cwd());
  return config;
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  try {
    const [login, repo, ...requesters] = process.argv.slice(2);
    const config = await configureBot(login, repo, requesters);
    await writeFile('bot.hosted.json', JSON.stringify(config, null, 2) + '\n');
    console.log('Saved bot.hosted.json. Commit it before enabling the worker.');
  } catch (error) { console.error(error.message); process.exitCode = 1; }
}
