import { mkdtemp, readFile, appendFile } from 'node:fs/promises';
import { join, resolve } from 'node:path';
import { tmpdir } from 'node:os';
import { fileURLToPath } from 'node:url';
import { run } from './process.js';
import { claudeEnvironment } from './claude.js';
import { checkCloud } from './cloud.js';

export async function saveCloudAuth(dir, repo, execute = run) {
  if (!/^[A-Za-z0-9-]+\/[A-Za-z0-9_.-]+$/.test(repo)) throw new Error('Invalid bot repository');
  const { claudeAiOauth: auth } = JSON.parse(await readFile(join(dir, '.credentials.json'), 'utf8'));
  if (!auth?.refreshToken || !Array.isArray(auth.scopes) || !auth.scopes.includes('user:sessions:claude_code') || !auth.scopes.every(scope => /^[a-z_:]+$/.test(scope))) throw new Error('Sign in with claude auth login in the dedicated cloud directory');
  await execute('gh', ['secret', 'set', 'CLAUDE_CODE_OAUTH_REFRESH_TOKEN', '--repo', repo], { input: auth.refreshToken });
  await execute('gh', ['variable', 'set', 'CLAUDE_CODE_OAUTH_SCOPES', '--repo', repo, '--body', auth.scopes.join(' ')]);
}

export async function loginCloud(repo, execute = run) {
  if (!process.env.CLAUDE_CODE_OAUTH_REFRESH_TOKEN || !process.env.CLAUDE_CODE_OAUTH_SCOPES) throw new Error('Configure the cloud refresh token and scopes in the bot repository');
  const dir = await mkdtemp(join(tmpdir(), 'reviary-cloud-login-'));
  const env = { ...claudeEnvironment(), CLAUDE_CONFIG_DIR: dir, CLAUDE_CODE_OAUTH_REFRESH_TOKEN: process.env.CLAUDE_CODE_OAUTH_REFRESH_TOKEN, CLAUDE_CODE_OAUTH_SCOPES: process.env.CLAUDE_CODE_OAUTH_SCOPES };
  delete env.CLAUDE_CODE_OAUTH_TOKEN;
  await execute('claude', ['auth', 'login'], { env, timeout: 60000 });
  await saveCloudAuth(dir, repo, execute);
  process.env.CLAUDE_CONFIG_DIR = dir;
  if (process.env.GITHUB_ENV) await appendFile(process.env.GITHUB_ENV, `CLAUDE_CONFIG_DIR=${dir}\n`);
  await checkCloud(execute);
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  try {
    if (process.argv[2] === 'save' && process.argv.length === 5) await saveCloudAuth(process.argv[3], process.argv[4]);
    else if (process.argv[2] === 'login' && process.argv.length === 4) await loginCloud(process.argv[3]);
    else throw new Error('Usage: node bot/cloud-auth.js save LOGIN_DIR BOT_REPO\n       node bot/cloud-auth.js login BOT_REPO');
    console.log('Cloud login saved in the bot repository.');
  } catch (error) { console.error(error.message); process.exitCode = 1; }
}
