import { isAbsolute } from 'node:path';

export function validateConfig(config) {
  if (!config || config.version !== 1) throw new Error('Expected bot configuration version 1');
  for (const key of ['sandbox', 'login', 'requester']) if (!/^[A-Za-z0-9][A-Za-z0-9_-]*$/.test(config[key])) throw new Error(`Invalid ${key}`);
  if (config.login.toLowerCase() === config.requester.toLowerCase()) throw new Error('Bot and requester must be separate accounts');
  if (!isAbsolute(config.stateDir ?? '')) throw new Error('stateDir must be absolute');
  const pub = config.publish;
  if (!pub || !isAbsolute(pub.checkout ?? '') || !/^[A-Za-z0-9-]+\/[A-Za-z0-9_.-]+$/.test(pub.repo) || !/^[A-Za-z0-9][A-Za-z0-9_-]*$/.test(pub.branch)) throw new Error('Invalid publishing checkout, repo or branch');
  if (!/^[A-Za-z0-9][A-Za-z0-9_-]*$/.test(pub.prefix)) throw new Error('Use a single relative directory as the publishing prefix');
  const url = new URL(pub.url);
  if (url.protocol !== 'https:' || url.username || url.password || url.search || url.hash) throw new Error('Use an HTTPS publishing URL without credentials, query or fragment');
  return config;
}
