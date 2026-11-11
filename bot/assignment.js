import { run } from './process.js';

export async function reviewerVersion() {
  const repository = process.env.REVIARY_TOOL_REPOSITORY;
  const ref = process.env.REVIARY_TOOL_REF;
  if (repository || ref) return { repository, ref };
  const cwd = new URL('../', import.meta.url).pathname;
  const [remote, head] = await Promise.all([
    run('git', ['remote', 'get-url', 'origin'], { cwd }),
    run('git', ['rev-parse', 'HEAD'], { cwd }),
  ]);
  return { repository: remote.stdout.trim().replace(/^https:\/\/github\.com\/|^git@github\.com:/, '').replace(/\.git$/, ''), ref: head.stdout.trim() };
}

export async function cloudAssignment(gh, config, request, session, context, tool) {
  if (!/^(?:inbox-|review-)?[1-9]\d*$/.test(String(request.id))) throw new Error('Invalid review request ID');
  const validTool = value => /^[A-Za-z0-9-]+\/[A-Za-z0-9_.-]+$/.test(value?.repository ?? '') && /^[a-f0-9]{40}$/.test(value?.ref ?? '');
  if (!validTool(tool)) throw new Error('Use a public GitHub reviewer repository and full commit');
  const branch = `claude/reviary-${request.id}`, repo = `repos/${config.publish.repo}`;
  const refPath = `${repo}/git/ref/heads/${branch}`;
  const filePath = `${repo}/contents/reviary-request.json`;
  const assignment = { version: 1, request: String(request.id), session: session.id, tool, output: { repository: config.publish.repo, branch, path: 'reviary-result.json' }, review: context.review, body: context.body ?? '', linked: context.linked, inventory: context.inventory, limits: context.limits };
  const text = JSON.stringify(assignment, null, 2) + '\n';
  if (Buffer.byteLength(text) > 2 * 1024 * 1024) throw new Error('Cloud assignment exceeds 2 MB. Review this PR interactively');
  let file;
  try { file = await gh.api(`${filePath}?ref=${encodeURIComponent(branch)}`); }
  catch (error) { if (error.status !== 404) throw error; }
  let commit;
  if (file) {
    if (file.encoding !== 'base64' || file.size > 2 * 1024 * 1024) throw new Error('Invalid saved cloud assignment');
    const saved = JSON.parse(Buffer.from(file.content, 'base64').toString('utf8'));
    if (saved.version !== 1 || saved.request !== assignment.request || saved.session !== session.id || !validTool(saved.tool)) throw new Error('Cloud assignment belongs to a different request or session');
    if (['url', 'title', 'base', 'head', 'diffBase'].some(key => saved.review?.[key] !== context.review[key])) throw new Error('PR changed since the cloud assignment. Post a new request');
    tool = saved.tool;
    commit = (await gh.api(refPath)).object.sha;
  } else {
    try { await gh.api(refPath); }
    catch (error) {
      if (error.status !== 404) throw error;
      const base = await gh.api(`${repo}/git/ref/heads/${config.publish.branch}`);
      await gh.api(`${repo}/git/refs`, { method: 'POST', body: { ref: `refs/heads/${branch}`, sha: base.object.sha } });
    }
    const result = await gh.api(filePath, { method: 'PUT', body: { branch, message: `Save review request for ${request.repo} #${request.number}`, content: Buffer.from(text).toString('base64') } });
    commit = result.commit.sha;
  }
  if (!/^[a-f0-9]{40}$/.test(commit)) throw new Error('Cloud assignment commit is missing');
  return { branch, repository: config.publish.repo, tool, url: `https://github.com/${config.publish.repo}/blob/${commit}/reviary-request.json` };
}

export function cloudPrompt(request, assignment) {
  return `Review ${request.repo} #${request.number} with Reviary.\nClone https://github.com/${assignment.tool.repository} and checkout ${assignment.tool.ref}.\nRead SKILL.md, README.md and docs/bot-review.md. Follow their format and review guides.\nAssignment: ${assignment.url}\nSave reviary-result.json on branch ${assignment.branch} in https://github.com/${assignment.repository}.\nThe controller validates, renders, publishes and replies. Do not post GitHub comments.`;
}
