import { run } from './process.js';

export function github(config, execute = run) {
  let pollSeconds = 60;
  async function api(path, { method = 'GET', body } = {}) {
    if (!/^(repos\/|notifications\?|user$)/.test(path) || /[\r\n]/.test(path)) throw new Error('Invalid GitHub API path');
    const args = [...(config.sandbox ? ['gh', config.sandbox] : []), 'api', '--include', '--method', method, '-H', 'Accept: application/vnd.github+json', path];
    if (body !== undefined) args.push('--input', '-');
    let stdout;
    try { ({ stdout } = await execute(config.sandbox ? 'ghsb' : 'gh', args, { input: body === undefined ? '' : JSON.stringify(body) })); }
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
  const allowed = config.requesters ? config.requesters.some(user => user.id === comment.user?.id) : comment.user?.login?.toLowerCase() === config.requester.toLowerCase();
  return allowed && comment.body?.trim().toLowerCase() === `@${config.login.toLowerCase()} review`;
}

export async function scanRequests(config, gh, state) {
  const since = new Date(Date.parse(state.since) - 120000).toISOString();
  const notifications = await gh.pages(`notifications?all=true&since=${encodeURIComponent(since)}`);
  const seen = new Set(), requests = new Map();
  for (const thread of notifications) {
    const match = /^https:\/\/api\.github\.com\/repos\/([A-Za-z0-9-]+\/[A-Za-z0-9_.-]+)\/pulls\/([1-9]\d*)$/.exec(thread.subject?.url ?? '');
    if (thread.subject?.type !== 'PullRequest' || !match || seen.has(thread.subject.url)) continue;
    seen.add(thread.subject.url);
    for (const comment of await gh.pages(`repos/${match[1]}/issues/${match[2]}/comments?since=${encodeURIComponent(since)}`)) {
      if (isRequest(comment, config) && !state.requests[comment.id] && Date.parse(comment.created_at) >= Date.parse(state.since) - 120000) requests.set(comment.id, comment.html_url);
    }
  }
  return [...requests.values()];
}
