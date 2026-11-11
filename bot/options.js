export function validateOptions({ model, effort, fresh }) {
  if (model !== undefined && (typeof model !== 'string' || !/^[A-Za-z0-9][A-Za-z0-9._:\[\]-]{0,150}$/.test(model))) throw new Error('Invalid Claude model');
  if (effort !== undefined && !['low', 'medium', 'high', 'xhigh', 'max'].includes(effort)) throw new Error('Use effort low, medium, high, xhigh or max');
  if (fresh !== undefined && typeof fresh !== 'boolean') throw new Error('fresh must be a boolean');
}

export function parseOptions(tokens) {
  const options = {};
  for (let i = 0; i < tokens.length; i++) {
    const flag = tokens[i].toLowerCase();
    if (!['--model', '--effort', '--fresh'].includes(flag)) return;
    const key = flag.slice(2);
    if (Object.hasOwn(options, key)) return;
    if (key === 'fresh') options.fresh = true;
    else {
      if (++i >= tokens.length) return;
      options[key] = tokens[i];
    }
  }
  try { validateOptions(options); return options; }
  catch { return; }
}
