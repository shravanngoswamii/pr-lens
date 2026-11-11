import { mkdir, readFile, writeFile, rename, rm } from 'node:fs/promises';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { validateConfig } from './config.js';
import { run } from './process.js';
import { github, parseRequest, checkRequest, scanRequests } from './github.js';
import { withState } from './state.js';

export function hostedConfig(input, root) {
  return validateConfig({ ...input, since: new Date(Date.now() - 86400000).toISOString(), stateDir: resolve(root, input.stateDir),
    publish: { ...input.publish, checkout: resolve(root, input.publish.checkout) } });
}

export function checkHostedActor(config, env = process.env) {
  if (env.GITHUB_EVENT_NAME === 'workflow_dispatch' && env.GITHUB_ACTOR?.toLowerCase() === config.login.toLowerCase()) return;
  if (['workflow_dispatch', 'issue_comment'].includes(env.GITHUB_EVENT_NAME) && !config.requesters.some(user => String(user.id) === env.GITHUB_ACTOR_ID)) throw new Error('This account cannot dispatch the review worker');
}

export async function scanHosted(config, gh, commentURL) {
  if ((await gh.api('user')).login.toLowerCase() !== config.login.toLowerCase()) throw new Error('REVIEW_BOT_TOKEN belongs to a different account');
  if (commentURL) {
    await checkRequest(parseRequest(commentURL), config, gh);
    return true;
  }
  return withState(config, async (state, save) => {
    const started = new Date().toISOString();
    const pending = (await scanRequests(config, gh, state)).length > 0;
    if (!pending) { state.since = started; await save(); }
    return pending;
  });
}

export async function setupHosted(config, { execute = run } = {}) {
  const user = JSON.parse((await execute('gh', ['api', 'user'])).stdout);
  if (user.login.toLowerCase() !== config.login.toLowerCase()) throw new Error('REVIEW_BOT_TOKEN belongs to a different account');
  const repo = JSON.parse((await execute('gh', ['api', `repos/${config.publish.repo}`])).stdout);
  if (!repo.permissions?.push) throw new Error('The bot needs push access to the reports repository');
  await mkdir(dirname(config.publish.checkout), { recursive: true });
  await execute('git', ['-c', 'credential.helper=', '-c', 'core.hooksPath=/dev/null', 'clone', '--quiet', '--single-branch', '--depth=1', '--branch', config.publish.branch, `https://github.com/${config.publish.repo}.git`, config.publish.checkout]);
  for (const [name, value] of [
    ['user.name', user.login], ['user.email', `${user.id}+${user.login}@users.noreply.github.com`],
    ['credential.helper', ''], ['credential.useHttpPath', 'true'],
  ]) await execute('git', ['-C', config.publish.checkout, 'config', name, value]);
  await execute('git', ['-C', config.publish.checkout, 'config', '--add', 'credential.helper', '!gh auth git-credential']);
  await execute('git', ['-C', config.publish.checkout, 'push', '--dry-run', 'origin', `HEAD:${config.publish.branch}`]);
}

export async function compactState(config) {
  const file = join(config.stateDir, 'state.json');
  let state;
  try { state = JSON.parse(await readFile(file, 'utf8')); }
  catch (error) { if (error.code === 'ENOENT') return; throw error; }
  for (const [id, job] of Object.entries(state.requests)) if (job.status === 'posted') {
    if (!/^(review-|inbox-)?\d+$/.test(id)) throw new Error('Invalid request id in hosted state');
    await rm(join(config.stateDir, id), { recursive: true, force: true });
    delete job.document; delete job.directory;
  }
  await rm(join(config.stateDir, 'lock'), { recursive: true, force: true });
  await writeFile(file + '.tmp', JSON.stringify(state, null, 2) + '\n', { mode: 0o600 });
  await rename(file + '.tmp', file);
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  try {
    const root = process.cwd();
    if (!process.env.REVIEW_BOT_CONFIG) throw new Error('Set REVIEW_BOT_CONFIG to the calling bot repository configuration');
    const config = hostedConfig(JSON.parse(process.env.REVIEW_BOT_CONFIG), root);
    if (process.argv[2] === 'compact') await compactState(config);
    else if (process.argv[2] === 'scan') {
      checkHostedActor(config);
      await mkdir(join(root, 'output'), { recursive: true });
      await writeFile(join(root, 'output/bot-hosted.json'), JSON.stringify(config, null, 2) + '\n');
      const pending = await scanHosted(config, github(config), process.env.COMMENT_URL);
      if (process.env.GITHUB_OUTPUT) await writeFile(process.env.GITHUB_OUTPUT, `pending=${pending}\n`, { flag: 'a' });
      console.log(pending ? 'Review request found.' : 'No pending review requests.');
    }
    else if (process.argv[2] === 'setup') {
      await mkdir(join(root, 'output'), { recursive: true });
      await writeFile(join(root, 'output/bot-hosted.json'), JSON.stringify(config, null, 2) + '\n');
      await setupHosted(config);
    } else throw new Error('Usage: node bot/hosted.js scan|setup|compact');
  } catch (error) { console.error(`review-bot: ${error.message}`); process.exitCode = 1; }
}
