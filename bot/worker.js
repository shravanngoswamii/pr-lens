import { mkdir, readFile } from 'node:fs/promises';
import { join } from 'node:path';
import { github, parseRequest, checkRequest, scanRequests } from './github.js';
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
  if ((await gh.api('user')).login.toLowerCase() !== config.login.toLowerCase()) throw new Error('GitHub CLI is using a different account');
  await gh.api('notifications?all=true&per_page=1');
  let auth;
  try { auth = JSON.parse((await run('claude', ['auth', 'status', '--json'], { env: claudeEnvironment() })).stdout); }
  catch { throw new Error('Sign in to Claude Code with your Claude subscription'); }
  if (!auth.loggedIn || !['claude.ai', 'oauth_token'].includes(auth.authMethod)) throw new Error('Sign in to Claude Code with your Claude subscription');
  return { github: config.login, requesters: config.requesters.map(user => user.login).join(', '), claude: auth.subscriptionType ?? auth.authMethod };
}

export async function runRequest(config, gh, url, state, save, { retry = false, collect = collectContext, review = (collected, dir) => reviewContext(collected, dir, undefined, { model: config.model }), inspect = inspectHTML, deploy = publish, wait = waitForPublication, log = console.log } = {}) {
  const reference = parseRequest(url);
  const request = reference.inbox ? await checkRequest(reference, config, gh) : reference;
  const previous = state.requests[request.id];
  if (previous?.status === 'posted') return previous;
  if (previous && !retry) throw new Error('Request already started. Use retry to resume it');
  if ((await gh.api(`repos/${request.repo}`)).private) throw new Error('Public PRs only. No private content will be published');
  const responsePath = request.eventId ? `repos/${request.repo}/pulls/${request.number}/reviews` : `repos/${request.repo}/issues/${request.number}/comments`;
  const findReply = async () => (await gh.pages(responsePath)).find(item => item.user?.login?.toLowerCase() === config.login.toLowerCase() && item.body?.includes(`<!-- review-docs:${request.id}:`));
  const posted = await findReply();
  if (posted) { state.requests[request.id] = { status: 'posted', comment: posted.html_url }; await save(); return state.requests[request.id]; }
  await checkRequest(request, config, gh);
  const job = state.requests[request.id] = { ...previous, status: 'running', request: url, updatedAt: new Date().toISOString() };
  await save();
  try {
    if (!request.eventId) await gh.api(`repos/${request.inbox?.repo ?? request.repo}/issues/comments/${request.inbox?.comment ?? request.id}/reactions`, { method: 'POST', body: { content: 'eyes' } });
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
    await checkRequest(request, config, gh);
    if (!job.publication) { job.publication = await deploy(config.publish, request, doc.review.head, job.directory); await save(); }
    log('Waiting for report deployment');
    await wait(config.publish, job.publication, doc.review.head);
    const latest = await gh.api(`repos/${request.repo}/pulls/${request.number}`);
    if (latest.head.sha !== doc.review.head || latest.base.sha !== doc.review.base) throw new Error('PR revisions changed during deployment. Post a new review request');
    const duplicate = await findReply();
    if (!duplicate) await checkRequest(request, config, gh);
    const response = duplicate ?? await gh.api(responsePath, { method: 'POST', body: { body: reviewComment(doc, job.publication.url, request), ...(request.eventId ? { event: 'COMMENT', commit_id: doc.review.head } : {}) } });
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
  let failed = 0;
  const started = new Date().toISOString();
  for (const url of await scanRequests(config, gh, state)) {
    try { await runRequest(config, gh, url, state, save, options); }
    catch (error) { failed++; (options.log ?? console.error)(`Request ${parseRequest(url).id}: ${error.message}`); }
  }
  state.since = started;
  await save();
  return { failed };
}
