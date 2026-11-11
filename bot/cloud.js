import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { run } from './process.js';
import { claudeEnvironment } from './claude.js';

const sessionPattern = /^(?:session|cse)_[A-Za-z0-9]{10,100}$/;

async function send(session, prompt, execute) {
  if (!sessionPattern.test(session)) throw new Error('Invalid Claude cloud session ID');
  let stdout;
  const env = claudeEnvironment();
  delete env.CLAUDE_CODE_OAUTH_TOKEN;
  try {
    ({ stdout } = await execute('claude', ['-p', '--cloud', session, '--output-format', 'json'], { input: prompt, env, timeout: 60000 }));
  } catch (error) { stdout = error.stdout; }
  let result;
  try { result = JSON.parse(stdout); } catch { throw new Error('Claude cloud access is unavailable. Sign in with claude auth login'); }
  if (result.session_id !== session || typeof result.ok !== 'boolean') throw new Error('Claude returned an invalid cloud response');
  return result;
}

export async function sendCloud(session, prompt, execute = run) {
  const result = await send(session, prompt, execute);
  if (!result.ok) throw new Error('Claude did not accept the cloud message. Reopen the saved session or request --fresh');
  return { id: session, url: `https://claude.ai/code/${session}` };
}

export async function checkCloud(execute = run) {
  const session = 'session_01AAAAAAAAAAAAAAAAAAAAAA';
  const result = await send(session, 'Connection check only. No work requested.', execute);
  if (result.ok) throw new Error('Claude cloud authentication could not be verified');
  if (result.error !== `Session not found: ${session}`) {
    const reason = String(result.error ?? 'No error detail').replace(/(?:sk-ant-|gh[pousr]_)[A-Za-z0-9_-]+|eyJ[A-Za-z0-9_.-]{20,}/g, '[redacted]').slice(0, 500);
    throw new Error(`Claude cloud access failed: ${reason}`);
  }
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  try { await checkCloud(); console.log('Claude cloud-session access is available. No session was created.'); }
  catch (error) { console.error(error.message); process.exitCode = 1; }
}
