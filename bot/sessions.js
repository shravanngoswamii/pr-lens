import { validateOptions, parseOptions } from './options.js';
import { github } from './github.js';
import { randomUUID } from 'node:crypto';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const validID = id => /^(?:session|cse)_[A-Za-z0-9]{10,100}$/.test(id ?? '');

function validate(value) {
  if (value?.version !== 1 || !value.sessions || typeof value.sessions !== 'object' || Array.isArray(value.sessions)) throw new Error('Invalid cloud-session registry');
  for (const [key, entry] of Object.entries(value.sessions)) {
    if (!/^[1-9]\d*\/[1-9]\d*$/.test(key) || !entry || typeof entry.request !== 'string' || !['creating', 'ready'].includes(entry.status) || entry.status === 'ready' && !validID(entry.session?.id)) throw new Error('Invalid cloud-session registry entry');
    if (entry.session) validateOptions(entry.session);
    if (entry.superseded && (!Array.isArray(entry.superseded) || !entry.superseded.every(id => typeof id === 'string'))) throw new Error('Invalid cloud creation history');
    if (entry.delivery && (typeof entry.delivery.request !== 'string' || !['sending', 'queued'].includes(entry.delivery.status))) throw new Error('Invalid cloud delivery receipt');
  }
  return value;
}

export async function openSessions(gh, repo) {
  if (!/^[A-Za-z0-9-]+\/[A-Za-z0-9_.-]+$/.test(repo)) throw new Error('Invalid bot repository');
  const name = 'REVIARY_SESSIONS', path = `repos/${repo}/actions/variables/${name}`;
  let state;
  try { state = validate(JSON.parse((await gh.api(path)).value)); }
  catch { throw new Error('Cloud-session registry is unavailable. Restore REVIARY_SESSIONS before reviewing'); }
  return {
    get: key => structuredClone(state.sessions[key]),
    set: async (key, entry) => {
      const sessions = { ...state.sessions };
      if (entry === undefined) delete sessions[key];
      else sessions[key] = structuredClone(entry);
      const next = validate({ version: 1, sessions });
      await gh.api(path, { method: 'PATCH', body: { name, value: JSON.stringify(next) } });
      state = next;
    },
  };
}

export async function prSession(store, request, { fresh = false } = {}, create) {
  if (![request.repositoryId, request.number].every(value => Number.isSafeInteger(value) && value > 0)) throw new Error('Use the GitHub repository ID and PR number');
  const key = `${request.repositoryId}/${request.number}`, operation = String(request.id);
  const current = store.get(key);
  if (fresh && current?.superseded?.includes(operation)) throw new Error('This fresh request was superseded. Post a new review request');
  if (current?.status === 'creating') throw new Error('Cloud-session creation needs recovery. Link the created session before retrying');
  if (current && (!fresh || current.request === operation)) return { ...structuredClone(current.session), url: `https://claude.ai/code/${current.session.id}` };
  const pending = { status: 'creating', request: operation, ...(current ? { previous: current.session.id, superseded: [...(current.superseded ?? []), current.request] } : {}) };
  await store.set(key, pending);
  let result;
  try { result = await create(); }
  catch (error) {
    if (error.notCreated) await store.set(key, current);
    throw error;
  }
  if (!validID(result?.id)) throw new Error('Claude returned an invalid cloud session ID');
  validateOptions(result);
  const session = { id: result.id, url: `https://claude.ai/code/${result.id}`, ...(result.model ? { model: result.model } : {}), ...(result.effort ? { effort: result.effort } : {}) };
  await store.set(key, { ...pending, status: 'ready', session });
  return structuredClone(session);
}

export async function linkSession(gh, repo, prURL, input, options) {
  const match = /^https:\/\/github\.com\/([A-Za-z0-9-]+\/[A-Za-z0-9_.-]+)\/pull\/([1-9]\d*)$/.exec(prURL);
  const id = /^https:\/\/claude\.ai\/code\/((?:session|cse)_[A-Za-z0-9]+)(?:\?[^#]*)?$/.exec(input)?.[1] ?? input;
  validateOptions(options);
  if (!match || !validID(id) || !options.model || !options.effort || options.backend !== undefined) throw new Error('Use a PR URL, cloud session ID, model and effort');
  const repository = await gh.api(`repos/${match[1]}`);
  if (repository.private) throw new Error('Public PRs only');
  await gh.api(`repos/${match[1]}/pulls/${match[2]}`);
  const store = await openSessions(gh, repo), key = `${repository.id}/${match[2]}`;
  if (store.get(key) && !options.fresh) throw new Error('This PR has a session. Use --fresh to replace it explicitly');
  return prSession(store, { repositoryId: repository.id, number: Number(match[2]), id: `link-${randomUUID()}` }, options, async () => ({ id, model: options.model, effort: options.effort }));
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  try {
    const [command, repo, pr, session, ...flags] = process.argv.slice(2);
    const options = parseOptions(flags);
    if (command !== 'link' || !repo || !pr || !session || !options) throw new Error('Usage: node bot/sessions.js link BOT_REPO PR_URL SESSION_ID --model MODEL --effort EFFORT [--fresh]');
    console.log((await linkSession(github({}), repo, pr, session, options)).url);
  } catch (error) { console.error(error.message); process.exitCode = 1; }
}
