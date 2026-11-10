import { run } from './process.js';

export function github(config, execute = run) {
  let pollSeconds = 60;
  async function api(path, { method = 'GET', body } = {}) {
    if (!/^(repos\/|notifications\?|user$)/.test(path) || /[\r\n]/.test(path)) throw new Error('Invalid GitHub API path');
    const args = ['gh', config.sandbox, 'api', '--include', '--method', method, '-H', 'Accept: application/vnd.github+json', path];
    if (body !== undefined) args.push('--input', '-');
    let stdout;
    try { ({ stdout } = await execute('ghsb', args, { input: body === undefined ? '' : JSON.stringify(body) })); }
    catch (cause) {
      const status = cause.stderr?.match(/HTTP (\d+)/)?.[1];
      throw Object.assign(new Error(`GitHub ${method} ${path} failed${status ? ` (HTTP ${status})` : ''}`), { rateLimited: /rate limit/i.test(cause.stderr ?? '') });
    }
    const parts = stdout.split(/\r?\n\r?\n/);
    const headers = parts.shift();
    pollSeconds = Math.max(pollSeconds, Number(headers.match(/^x-poll-interval:\s*(\d+)/im)?.[1] ?? 60));
    return JSON.parse(parts.join('\n\n'));
  }
  async function pages(path) {
    const items = [];
    for (let page = 1; page <= 20; page++) {
      const rows = await api(`${path}${path.includes('?') ? '&' : '?'}per_page=100&page=${page}`);
      if (!Array.isArray(rows)) throw new Error('Expected a GitHub list');
      items.push(...rows);
      if (rows.length < 100) return items;
    }
    throw new Error('GitHub pagination exceeded 2000 items');
  }
  return { api, pages, read: (path, paginate) => paginate ? pages(path.replace(/[?&]per_page=100/, '')) : api(path), get pollSeconds() { return pollSeconds; } };
}

export function parseComment(url) {
  const match = /^https:\/\/github\.com\/([A-Za-z0-9-]+\/[A-Za-z0-9_.-]+)\/pull\/([1-9]\d*)#issuecomment-([1-9]\d*)$/.exec(url);
  if (!match || ![match[2], match[3]].every(value => Number.isSafeInteger(Number(value)))) throw new Error('Use a PR conversation comment URL ending in #issuecomment-N');
  return { repo: match[1], number: Number(match[2]), id: Number(match[3]) };
}

export function isRequest(comment, config) {
  return comment.user?.login?.toLowerCase() === config.requester.toLowerCase() && comment.body?.trim().toLowerCase() === `@${config.login.toLowerCase()} review`;
}
