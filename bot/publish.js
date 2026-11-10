import { copyFile, mkdir } from 'node:fs/promises';
import { join } from 'node:path';
import { run } from './process.js';

export async function publish(config, request, head, dir, execute = run) {
  const git = async args => (await execute('git', ['-C', config.checkout, ...args])).stdout.trim();
  if (await git(['status', '--porcelain'])) throw new Error('Publishing checkout has local changes');
  const remote = await git(['remote', 'get-url', 'origin']);
  if (remote.replace(/\.git$/, '') !== `https://github.com/${config.repo}`) throw new Error('Publishing remote does not match configuration');
  await git(['fetch', 'origin', config.branch]);
  await git(['merge', '--ff-only', `origin/${config.branch}`]);
  if (await git(['rev-parse', 'HEAD']) !== await git(['rev-parse', `origin/${config.branch}`])) throw new Error('Publishing checkout has unpushed commits');
  const path = `${config.prefix}/${request.repo}/${request.number}/${head}/${request.id}`;
  const target = join(config.checkout, path);
  await mkdir(target, { recursive: true });
  for (const name of ['index.html', 'review.json']) await copyFile(join(dir, name), join(target, name));
  await git(['add', '--', path]);
  if (await git(['diff', '--cached', '--name-only'])) {
    await git(['commit', '-m', `Add review for ${request.repo} #${request.number}`]);
    await git(['push', 'origin', `HEAD:${config.branch}`]);
  }
  return { url: `${config.url.replace(/\/$/, '')}/${path}/`, commit: await git(['rev-parse', 'HEAD']) };
}

export async function waitForPublication(config, publication, head, { execute = run, delay = ms => new Promise(resolve => setTimeout(resolve, ms)), fetchURL = fetch } = {}) {
  const deadline = Date.now() + 5 * 60 * 1000;
  while (Date.now() < deadline) {
    const { stdout } = await execute('gh', ['run', 'list', '--repo', config.repo, '--commit', publication.commit, '--limit', '20', '--json', 'status,conclusion,url']);
    const runs = JSON.parse(stdout);
    if (runs.some(run => run.status === 'completed' && run.conclusion !== 'success')) throw new Error('Report deployment CI failed');
    if (runs.length && runs.every(run => run.status === 'completed' && run.conclusion === 'success')) {
      const response = await fetchURL(publication.url + 'review.json', { signal: AbortSignal.timeout(15000), cache: 'no-store' });
      if (response.ok && (await response.json()).review?.head === head) return;
    }
    await delay(15000);
  }
  throw new Error('Report deployment did not finish within five minutes');
}
