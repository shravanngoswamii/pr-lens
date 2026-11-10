import { isAbsolute } from 'node:path';

export function validateConfig(config) {
  if (!config || config.version !== 1) throw new Error('Expected bot configuration version 1');
  for (const key of ['login', ...(config.requesters === undefined ? ['requester'] : []), ...(config.sandbox === undefined ? [] : ['sandbox'])]) if (!/^[A-Za-z0-9][A-Za-z0-9_-]*$/.test(config[key])) throw new Error(`Invalid ${key}`);
  if (config.requesters !== undefined) {
    if (config.requester !== undefined || !Array.isArray(config.requesters) || !config.requesters.length || config.requesters.some(user => !user || !/^[A-Za-z0-9][A-Za-z0-9-]*$/.test(user.login) || !Number.isSafeInteger(user.id) || user.id < 1)) throw new Error('Use requesters with GitHub login and numeric account id');
    if (new Set(config.requesters.map(user => user.id)).size !== config.requesters.length) throw new Error('Duplicate requester account id');
  }
  if (config.since !== undefined && (!/^\d{4}-\d{2}-\d{2}T.*Z$/.test(config.since) || !Number.isFinite(Date.parse(config.since)))) throw new Error('since must be a UTC timestamp');
  if ((config.requesters ?? [{ login: config.requester }]).some(user => user.login.toLowerCase() === config.login.toLowerCase())) throw new Error('Bot and requesters must be separate accounts');
  if (!isAbsolute(config.stateDir ?? '')) throw new Error('stateDir must be absolute');
  const pub = config.publish;
  if (!pub || !isAbsolute(pub.checkout ?? '') || !/^[A-Za-z0-9-]+\/[A-Za-z0-9_.-]+$/.test(pub.repo) || !/^[A-Za-z0-9][A-Za-z0-9_-]*$/.test(pub.branch)) throw new Error('Invalid publishing checkout, repo or branch');
  if (!/^[A-Za-z0-9][A-Za-z0-9_-]*$/.test(pub.prefix)) throw new Error('Use a single relative directory as the publishing prefix');
  const url = new URL(pub.url);
  if (url.protocol !== 'https:' || url.username || url.password || url.search || url.hash) throw new Error('Use an HTTPS publishing URL without credentials, query or fragment');
  return config;
}
