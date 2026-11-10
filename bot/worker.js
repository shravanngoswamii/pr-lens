import { mkdir, readFile, writeFile, rename, rm } from 'node:fs/promises';
import { join } from 'node:path';
import { github, parseComment, isRequest } from './github.js';
import { run } from './process.js';
import { claudeEnvironment } from './claude.js';
import { collectContext } from './context.js';
import { reviewContext } from './review.js';
import { inspectHTML } from './inspect.js';
import { publish, waitForPublication } from './publish.js';

const markdown = text => text.replace(/[\\`*_{}\[\]<>#]/g, '\\$&').replace(/@/g, '&#64;');
const excerpt = (text, limit) => {
  const sentence = text.match(/^.*?[.!?](?:\s|$)/s)?.[0].trim() ?? text.trim();
  return sentence.length <= limit ? sentence : sentence.slice(0, limit - 3).replace(/\s+\S*$/, '') + '...';
};

export function reviewComment(doc, url, request) {
  const findings = doc.sections.flatMap(section => section.blocks).filter(block => block.type === 'finding');
  const lines = [`Reviewed [${doc.review.head.slice(0, 7)}](https://github.com/${request.repo}/commit/${doc.review.head}).`, '', markdown(excerpt(doc.summary, 320))];
  for (const finding of findings.slice(0, 3)) {
    const source = doc.sources.find(source => source.id === finding.refs?.[0]);
    lines.push('', `- ${finding.status}: ${source ? `[${markdown(finding.title)}](${source.url})` : markdown(finding.title)}. ${markdown(excerpt(finding.text, 200))}`);
  }
  if (!findings.length) lines.push('', 'No findings reported in this source review.');
  lines.push('', `[Review report](${url}) · [Editable source](${url}review.json)`, '', 'PR code and runtime tests were not run.', '', `<!-- review-docs:${request.id}:${doc.review.head} -->`);
  return lines.join('\n');
}

export async function doctor(config, gh = github(config)) {
  if ((await gh.api('user')).login.toLowerCase() !== config.login.toLowerCase()) throw new Error('ghsb is using a different GitHub account');
  await gh.api('notifications?all=true&per_page=1');
  let auth;
  try { auth = JSON.parse((await run('claude', ['auth', 'status', '--json'], { env: claudeEnvironment() })).stdout); }
  catch { throw new Error('Sign in to Claude Code with your Claude subscription'); }
  if (!auth.loggedIn || !['claude.ai', 'oauth_token'].includes(auth.authMethod)) throw new Error('Sign in to Claude Code with your Claude subscription');
  return { github: config.login, requester: config.requester, claude: auth.subscriptionType ?? auth.authMethod };
}

export async function withState(config, action) {
  await mkdir(config.stateDir, { recursive: true, mode: 0o700 });
  const lock = join(config.stateDir, 'lock');
  try { await mkdir(lock); }
  catch (error) {
    if (error.code !== 'EEXIST') throw error;
    const pid = Number(await readFile(join(lock, 'pid'), 'utf8').catch(() => '0'));
    if (!Number.isSafeInteger(pid) || pid < 1) throw new Error('Bot lock is incomplete. Check for a running worker before removing it');
    try { process.kill(pid, 0); throw new Error('Another bot command is running'); }
    catch (cause) { if (cause.code !== 'ESRCH') throw cause; }
    await rm(lock, { recursive: true }); await mkdir(lock);
  }
  await writeFile(join(lock, 'pid'), String(process.pid));
  try {
    const file = join(config.stateDir, 'state.json');
    let state;
    try { state = JSON.parse(await readFile(file, 'utf8')); }
    catch (error) { if (error.code !== 'ENOENT') throw error; state = { version: 1, since: new Date().toISOString(), requests: {} }; }
    if (state.version !== 1 || !state.requests || typeof state.requests !== 'object' || Array.isArray(state.requests) || !Number.isFinite(Date.parse(state.since))) throw new Error('Invalid bot state');
    const save = async () => { await writeFile(file + '.tmp', JSON.stringify(state, null, 2) + '\n', { mode: 0o600 }); await rename(file + '.tmp', file); };
    await save();
    return await action(state, save);
  } finally { await rm(lock, { recursive: true }); }
}

export async function runRequest(config, gh, url, state, save, { retry = false, collect = collectContext, review = reviewContext, inspect = inspectHTML, deploy = publish, wait = waitForPublication, log = console.log } = {}) {
  const request = parseComment(url);
  const comment = await gh.api(`repos/${request.repo}/issues/comments/${request.id}`);
  if (comment.issue_url?.toLowerCase() !== `https://api.github.com/repos/${request.repo}/issues/${request.number}`.toLowerCase() || !isRequest(comment, config)) throw new Error('Comment is not an authorized review request');
  const previous = state.requests[request.id];
  if (previous?.status === 'posted') return previous;
  if (previous && !retry) throw new Error('Request already started. Use retry to resume it');
  if ((await gh.api(`repos/${request.repo}`)).private) throw new Error('Public PRs only. No private content will be published');
  const comments = await gh.pages(`repos/${request.repo}/issues/${request.number}/comments`);
  const posted = comments.find(item => item.user?.login?.toLowerCase() === config.login.toLowerCase() && item.body?.includes(`<!-- review-docs:${request.id}:`));
  if (posted) { state.requests[request.id] = { status: 'posted', comment: posted.html_url }; await save(); return state.requests[request.id]; }
  const job = state.requests[request.id] = { ...previous, status: 'running', request: url, updatedAt: new Date().toISOString() };
  await save();
  try {
    await gh.api(`repos/${request.repo}/issues/comments/${request.id}/reactions`, { method: 'POST', body: { content: 'eyes' } });
    const dir = join(config.stateDir, String(request.id));
    await mkdir(dir, { recursive: true });
    let doc;
    if (job.document) doc = JSON.parse(await readFile(job.document, 'utf8'));
    else {
      const attempt = join(dir, String(Date.now()));
      await mkdir(attempt);
      log(`Collecting ${request.repo} #${request.number}`);
      const collected = await collect(gh, request, attempt);
      log('Reviewing with Claude');
      doc = await review(collected, attempt);
      await inspect(join(attempt, 'index.html'), doc);
      job.document = join(attempt, 'review.json');
      job.directory = attempt;
      job.head = doc.review.head;
      await save();
    }
    const current = await gh.api(`repos/${request.repo}/pulls/${request.number}`);
    if (current.head.sha !== doc.review.head || current.base.sha !== doc.review.base) throw new Error('PR revisions changed. Post a new review request');
    if (!job.publication) { job.publication = await deploy(config.publish, request, doc.review.head, job.directory); await save(); }
    log('Waiting for report deployment');
    await wait(config.publish, job.publication, doc.review.head);
    const latest = await gh.api(`repos/${request.repo}/pulls/${request.number}`);
    if (latest.head.sha !== doc.review.head || latest.base.sha !== doc.review.base) throw new Error('PR revisions changed during deployment. Post a new review request');
    const duplicate = (await gh.pages(`repos/${request.repo}/issues/${request.number}/comments`)).find(item => item.user?.login?.toLowerCase() === config.login.toLowerCase() && item.body?.includes(`<!-- review-docs:${request.id}:`));
    const response = duplicate ?? await gh.api(`repos/${request.repo}/issues/${request.number}/comments`, { method: 'POST', body: { body: reviewComment(doc, job.publication.url, request) } });
    Object.assign(job, { status: 'posted', comment: response.html_url, updatedAt: new Date().toISOString() });
    await save();
    log(job.comment);
    return job;
  } catch (error) {
    Object.assign(job, { status: 'failed', error: error.message, updatedAt: new Date().toISOString() });
    await save();
    throw error;
  }
}

export async function poll(config, gh, state, save, options = {}) {
  const started = new Date().toISOString();
  const since = new Date(Date.parse(state.since) - 120000).toISOString();
  const notifications = await gh.pages(`notifications?all=true&since=${encodeURIComponent(since)}`);
  const seen = new Set();
  for (const thread of notifications) {
    const match = /^https:\/\/api\.github\.com\/repos\/([A-Za-z0-9-]+\/[A-Za-z0-9_.-]+)\/pulls\/([1-9]\d*)$/.exec(thread.subject?.url ?? '');
    if (thread.subject?.type !== 'PullRequest' || !match || seen.has(thread.subject.url)) continue;
    seen.add(thread.subject.url);
    for (const comment of await gh.pages(`repos/${match[1]}/issues/${match[2]}/comments?since=${encodeURIComponent(since)}`)) {
      if (!isRequest(comment, config) || state.requests[comment.id] || Date.parse(comment.created_at) < Date.parse(state.since) - 120000) continue;
      try { await runRequest(config, gh, comment.html_url, state, save, options); }
      catch (error) { (options.log ?? console.error)(`Request ${comment.id}: ${error.message}`); }
    }
  }
  state.since = started;
  await save();
}
