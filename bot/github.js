import { run } from './process.js';
import { parseOptions } from './options.js';

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
      throw Object.assign(new Error(`GitHub ${method} ${path} failed${status ? ` (HTTP ${status})` : ''}`), { status: status ? Number(status) : undefined, rateLimited: /rate limit/i.test(cause.stderr ?? '') });
    }
    const parts = stdout.split(/\r?\n\r?\n/);
    const headers = parts.shift();
    pollSeconds = Math.max(pollSeconds, Number(headers.match(/^x-poll-interval:\s*(\d+)/im)?.[1] ?? 60));
    const payload = parts.join('\n\n');
    return payload.trim() ? JSON.parse(payload) : undefined;
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

function parseComment(url) {
  const match = /^https:\/\/github\.com\/([A-Za-z0-9-]+\/[A-Za-z0-9_.-]+)\/pull\/([1-9]\d*)#issuecomment-([1-9]\d*)$/.exec(url);
  if (!match || ![match[2], match[3]].every(value => Number.isSafeInteger(Number(value)))) throw new Error('Use a PR conversation comment URL ending in #issuecomment-N');
  return { repo: match[1], number: Number(match[2]), id: Number(match[3]) };
}

export function isRequest(comment, config) {
  return commentOptions(comment, config) !== undefined;
}

function isRequester(actor, config) {
  return config.requesters.some(user => user.id === actor?.id);
}

function commentOptions(comment, config) {
  if (!isRequester(comment.user, config)) return;
  const [mention, command, ...tokens] = (comment.body ?? '').trim().split(/\s+/);
  if (mention.toLowerCase() === `@${config.login.toLowerCase()}` && command?.toLowerCase() === 'review') return parseOptions(tokens);
}

function inboxTarget(comment, config) {
  if (!isRequester(comment.user, config)) return;
  const [url, ...tokens] = (comment.body ?? '').trim().split(/\s+/);
  const target = /^https:\/\/github\.com\/([A-Za-z0-9-]+\/[A-Za-z0-9_.-]+)\/pull\/([1-9]\d*)\/?$/.exec(url);
  const options = parseOptions(tokens);
  if (target && Number.isSafeInteger(Number(target[2])) && options) return { repo: target[1], number: Number(target[2]), options };
}

function withOptions(request, options) {
  if (request.options && ['model', 'effort', 'fresh'].some(key => request.options[key] !== options[key])) throw new Error('Review options changed. Post a new request');
  return { ...request, options };
}

export function parseRequest(url) {
  const inbox = /^https:\/\/github\.com\/([A-Za-z0-9-]+\/[A-Za-z0-9_.-]+)\/issues\/([1-9]\d*)#issuecomment-([1-9]\d*)$/.exec(url);
  if (inbox && [inbox[2], inbox[3]].every(value => Number.isSafeInteger(Number(value)))) return { id: `inbox-${inbox[3]}`, inbox: { repo: inbox[1], issue: Number(inbox[2]), comment: Number(inbox[3]) } };
  const match = /^https:\/\/github\.com\/([A-Za-z0-9-]+\/[A-Za-z0-9_.-]+)\/pull\/([1-9]\d*)#event-([1-9]\d*)$/.exec(url);
  if (!match) return parseComment(url);
  if (![match[2], match[3]].every(value => Number.isSafeInteger(Number(value)))) throw new Error('Invalid review request id');
  return { repo: match[1], number: Number(match[2]), id: `review-${match[3]}`, eventId: Number(match[3]) };
}

function reviewerEvents(events, config) {
  return events.filter(event => ['review_requested', 'review_request_removed'].includes(event.event) && event.requested_reviewer?.login?.toLowerCase() === config.login.toLowerCase());
}

export async function checkRequest(request, config, gh) {
  if (request.inbox) {
    const source = request.inbox;
    if (source.repo.toLowerCase() !== config.inbox?.repo.toLowerCase() || source.issue !== config.inbox.issue) throw new Error('Use the configured inbox issue');
    const comment = await gh.api(`repos/${source.repo}/issues/comments/${source.comment}`);
    const target = inboxTarget(comment, config);
    if (comment.issue_url?.toLowerCase() !== `https://api.github.com/repos/${source.repo}/issues/${source.issue}`.toLowerCase() || !target) throw new Error('Inbox comment must be an authorized public PR URL with valid review options');
    if (request.repo && (request.repo.toLowerCase() !== target.repo.toLowerCase() || request.number !== target.number)) throw new Error('Inbox target changed. Post a new request');
    return { ...withOptions(request, target.options), repo: target.repo, number: target.number };
  }
  if (!request.eventId) {
    const comment = await gh.api(`repos/${request.repo}/issues/comments/${request.id}`);
    if (comment.issue_url?.toLowerCase() !== `https://api.github.com/repos/${request.repo}/issues/${request.number}`.toLowerCase() || !isRequest(comment, config)) throw new Error('Comment is not an authorized review request');
    return withOptions(request, commentOptions(comment, config));
  }
  const events = reviewerEvents(await gh.pages(`repos/${request.repo}/issues/${request.number}/timeline`), config);
  const latest = events.at(-1);
  const pr = await gh.api(`repos/${request.repo}/pulls/${request.number}`);
  if (latest?.id !== request.eventId || latest.event !== 'review_requested' || !isRequester(latest.actor, config) || !pr.requested_reviewers?.some(user => user.login.toLowerCase() === config.login.toLowerCase())) throw new Error('Review request is no longer active or authorized');
  return withOptions(request, {});
}

export async function scanRequests(config, gh, state) {
  const since = new Date(Date.parse(state.since) - 120000).toISOString();
  const notifications = await gh.pages(`notifications?all=true&since=${encodeURIComponent(since)}`);
  const seen = new Set(), requests = new Map();
  if (config.inbox) {
    for (const comment of await gh.pages(`repos/${config.inbox.repo}/issues/${config.inbox.issue}/comments?since=${encodeURIComponent(since)}`)) {
      if (inboxTarget(comment, config) && !state.requests[`inbox-${comment.id}`] && Date.parse(comment.created_at) >= Date.parse(state.since) - 120000) requests.set(`inbox-${comment.id}`, comment.html_url);
    }
  }
  for (const thread of notifications) {
    const match = /^https:\/\/api\.github\.com\/repos\/([A-Za-z0-9-]+\/[A-Za-z0-9_.-]+)\/pulls\/([1-9]\d*)$/.exec(thread.subject?.url ?? '');
    if (thread.subject?.type !== 'PullRequest' || !match || seen.has(thread.subject.url)) continue;
    seen.add(thread.subject.url);
    for (const comment of await gh.pages(`repos/${match[1]}/issues/${match[2]}/comments?since=${encodeURIComponent(since)}`)) {
      if (isRequest(comment, config) && !state.requests[comment.id] && Date.parse(comment.created_at) >= Date.parse(state.since) - 120000) requests.set(comment.id, comment.html_url);
    }
    const latest = reviewerEvents(await gh.pages(`repos/${match[1]}/issues/${match[2]}/timeline`), config).at(-1);
    if (latest?.event === 'review_requested' && isRequester(latest.actor, config) && !state.requests[`review-${latest.id}`] && Date.parse(latest.created_at) >= Date.parse(state.since) - 120000) {
      requests.set(`review-${latest.id}`, `https://github.com/${match[1]}/pull/${match[2]}#event-${latest.id}`);
    }
  }
  return [...requests.values()];
}
