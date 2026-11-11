import { validateOptions } from './options.js';

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
