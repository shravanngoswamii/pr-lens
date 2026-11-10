import { run } from './process.js';

export const responseSchema = {
  type: 'object', properties: {
    files: { type: 'array', maxItems: 30, items: { type: 'object', properties: { path: { type: 'string' }, revision: { enum: ['base', 'head'] } }, required: ['path', 'revision'], additionalProperties: false } },
    document: { type: 'object', additionalProperties: true },
  }, required: ['files'], additionalProperties: false,
};

export function claudeEnvironment(env = process.env) {
  const allowed = ['PATH', 'HOME', 'USER', 'LOGNAME', 'LANG', 'LC_ALL', 'XDG_CONFIG_HOME', 'XDG_DATA_HOME', 'XDG_RUNTIME_DIR', 'DBUS_SESSION_BUS_ADDRESS', 'CLAUDE_CONFIG_DIR', 'SSL_CERT_FILE', 'NODE_EXTRA_CA_CERTS', 'HTTPS_PROXY', 'HTTP_PROXY', 'NO_PROXY'];
  return Object.fromEntries(allowed.filter(key => env[key] !== undefined).map(key => [key, env[key]]));
}

export async function askClaude(prompt, cwd, execute = run) {
  const { stdout } = await execute('claude', ['-p', '--output-format', 'json', '--json-schema', JSON.stringify(responseSchema),
    '--tools', '', '--disable-slash-commands', '--setting-sources', '', '--strict-mcp-config', '--mcp-config', '{"mcpServers":{}}', '--no-session-persistence'],
  { input: prompt, cwd, env: claudeEnvironment(), timeout: 10 * 60 * 1000 });
  let output;
  try { output = JSON.parse(stdout); } catch { throw new Error('Claude returned invalid JSON'); }
  if (output.is_error || output.subtype !== 'success' || !output.structured_output) throw new Error(`Claude did not complete (${output.subtype ?? 'unknown status'})`);
  return output.structured_output;
}
