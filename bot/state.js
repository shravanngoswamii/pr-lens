import { mkdir, readFile, writeFile, rename, rm } from 'node:fs/promises';
import { join } from 'node:path';

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
    catch (error) { if (error.code !== 'ENOENT') throw error; state = { version: 1, since: config.since ?? new Date().toISOString(), requests: {} }; }
    if (state.version !== 1 || !state.requests || typeof state.requests !== 'object' || Array.isArray(state.requests) || !Number.isFinite(Date.parse(state.since))) throw new Error('Invalid bot state');
    const save = async () => { await writeFile(file + '.tmp', JSON.stringify(state, null, 2) + '\n', { mode: 0o600 }); await rename(file + '.tmp', file); };
    await save();
    return await action(state, save);
  } finally { await rm(lock, { recursive: true }); }
}

