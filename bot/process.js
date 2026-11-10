import { spawn } from 'node:child_process';

export function run(command, args, { input = '', timeout = 60000, cwd, env = process.env, limit = 16 * 1024 * 1024 } = {}) {
  return new Promise((resolve, reject) => {
    const child = spawn(command, args, { cwd, env, stdio: ['pipe', 'pipe', 'pipe'] });
    const out = [], err = [];
    let size = 0, stopped;
    const timer = setTimeout(() => { stopped = 'timed out'; child.kill('SIGKILL'); }, timeout);
    for (const [stream, chunks] of [[child.stdout, out], [child.stderr, err]]) stream.on('data', chunk => {
      size += chunk.length;
      if (size > limit) { stopped = 'output exceeded the limit'; child.kill('SIGKILL'); }
      else chunks.push(chunk);
    });
    child.on('error', error => { clearTimeout(timer); reject(new Error(`${command}: ${error.code}`)); });
    child.on('close', code => {
      clearTimeout(timer);
      const stdout = Buffer.concat(out).toString();
      const stderr = Buffer.concat(err).toString();
      if (stopped || code !== 0) reject(Object.assign(new Error(`${command}: ${stopped ?? `exit ${code}`}`), { stdout, stderr }));
      else resolve({ stdout, stderr });
    });
    child.stdin.on('error', () => {});
    child.stdin.end(input);
  });
}
