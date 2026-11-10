import { structuredPatch, formatPatch } from 'diff';

export function suggestedDiff(block) {
  const patch = structuredPatch(`a/${block.path}`, `b/${block.path}`, block.before, block.after, '', '', { context: 3, timeout: 2000 });
  if (!patch) throw new Error(`Diff for ${block.path} is too large. Use a smaller snippet.`);
  const rows = [];
  for (const hunk of patch.hunks) {
    rows.push({ kind: 'hunk', text: `@@ -${hunk.oldStart},${hunk.oldLines} +${hunk.newStart},${hunk.newLines} @@` });
    let oldLine = hunk.oldStart;
    let newLine = hunk.newStart;
    for (const line of hunk.lines) {
      const prefix = line[0];
      rows.push({ kind: prefix === '+' ? 'added' : prefix === '-' ? 'removed' : prefix === ' ' ? 'context' : 'note',
        mark: prefix, oldLine: prefix === ' ' || prefix === '-' ? oldLine++ : '',
        newLine: prefix === ' ' || prefix === '+' ? newLine++ : '', text: prefix === '\\' ? line : line.slice(1) });
    }
  }
  return { patch: formatPatch(patch), rows };
}
