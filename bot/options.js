export function validateOptions({ model, effort }) {
  if (model !== undefined && (typeof model !== 'string' || !/^[A-Za-z0-9][A-Za-z0-9._:\[\]-]{0,150}$/.test(model))) throw new Error('Invalid Claude model');
  if (effort !== undefined && !['low', 'medium', 'high', 'xhigh', 'max'].includes(effort)) throw new Error('Use effort low, medium, high, xhigh or max');
}

export function parseOptions(tokens) {
  if (tokens.length % 2) return;
  const options = {};
  for (let i = 0; i < tokens.length; i += 2) {
    const flag = tokens[i].toLowerCase();
    if (!['--model', '--effort'].includes(flag)) return;
    const key = flag.slice(2);
    if (Object.hasOwn(options, key)) return;
    options[key] = tokens[i + 1];
  }
  try { validateOptions(options); return options; }
  catch { return; }
}
