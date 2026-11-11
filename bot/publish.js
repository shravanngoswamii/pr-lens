import { copyFile, mkdir, readFile } from 'node:fs/promises';
import { join } from 'node:path';
import { createHash } from 'node:crypto';
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

export async function waitForPublication(config, publication, head, { directory, delay = ms => new Promise(resolve => setTimeout(resolve, ms)), fetchURL = fetch, timeout = 5 * 60 * 1000 } = {}) {
  if (!directory) throw new Error('Reviewed report directory is required');
  const names = ['index.html', 'review.json'];
  const files = await Promise.all(names.map(name => readFile(join(directory, name))));
  if (JSON.parse(files[1]).review?.head !== head) throw new Error('Report revision does not match publication');
  const digest = bytes => createHash('sha256').update(bytes).digest('hex');
  const hashes = files.map(digest);
  const deadline = Date.now() + timeout;
  while (Date.now() < deadline) {
    const matches = await Promise.all(names.map(async (name, i) => {
      try {
        const response = await fetchURL(publication.url + name, { signal: AbortSignal.timeout(15000), cache: 'no-store' });
        return response.ok && digest(Buffer.from(await response.arrayBuffer())) === hashes[i];
      } catch { return false; }
    }));
    if (matches.every(Boolean)) return;
    await delay(15000);
  }
  throw new Error('Deployed report files did not match the reviewed files before the timeout');
}
