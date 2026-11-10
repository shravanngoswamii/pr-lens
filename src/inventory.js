const SHA = /^[a-f0-9]{40}$/;
const HASH = /^[a-f0-9]{64}$/;
const ID = /^[a-zA-Z][a-zA-Z0-9_-]*$/;
export const inventoryBlocks = doc => doc.sections.flatMap(section => section.blocks).filter(block => block.type === 'inventory');
export const definitionURL = (review, revision, location) => `${review.url.split('/pull/')[0]}/blob/${revision}/${location.path.split('/').map(encodeURIComponent).join('/')}#L${location.line}`;
export const definitionsFor = (doc, graph, node) => inventoryBlocks(doc).flatMap(block => block.links.filter(link => link.diagram === graph && link.node === node).map(link => block.data.items.find(item => item.id === link.definition)));
export function coverage(block) {
  return block.data.items.map(item => ({ ...item, links: block.links.filter(link => link.definition === item.id), reason: block.omissions.find(omission => omission.definition === item.id)?.reason }));
}

export function validateInventory(block, review, graphs, path) {
  const fail = message => { throw new Error(`${path}: ${message}`); };
  const object = (value, keys) => {
    if (!value || typeof value !== 'object' || Array.isArray(value)) fail('expected an object');
    for (const key of Object.keys(value)) if (!keys.includes(key)) fail(`unknown field ${key}`);
  };
  const text = value => { if (typeof value !== 'string' || !value.trim()) fail('expected nonempty text'); };
  const array = value => { if (!Array.isArray(value)) fail('expected an array'); };
  const relative = value => { text(value); if (value.startsWith('/') || value.split('/').includes('..') || /[\0\r\n]/.test(value)) fail('expected a relative path'); };
  const data = block.data;
  object(data, ['version', 'language', 'parser', 'base', 'head', 'scope', 'files', 'items', 'notes']);
  if (data.version !== 1) fail('inventory version must be 1');
  text(data.language);
  text(data.parser);
  if (!SHA.test(data.base) || data.base !== (review.diffBase ?? review.base) || data.head !== review.head) fail('inventory revisions must match the reviewed diff');
  for (const key of ['scope', 'files', 'items', 'notes']) array(data[key]);
  if (!data.scope.length) fail('inventory needs an explicit scope');
  data.scope.forEach(relative); data.files.forEach(relative);
  if (new Set(data.files).size !== data.files.length) fail('duplicate inventory file');
  if (data.files.some(file => !data.scope.some(prefix => prefix === '.' || file === prefix || file.startsWith(prefix.endsWith('/') ? prefix : prefix + '/')))) fail('inventory file is outside its scope');
  const ids = new Map();
  for (const item of data.items) {
    object(item, ['id', 'kind', 'name', 'signature', 'change', 'before', 'after']);
    if (!ID.test(item.id) || ids.has(item.id)) fail('definition IDs must be valid and unique');
    ids.set(item.id, item);
    for (const key of ['name', 'signature']) text(item[key]);
    if (!['type', 'function', 'method', 'macro'].includes(item.kind) || !['added', 'changed', 'removed'].includes(item.change)) fail('invalid definition kind or change');
    if (item.change === 'added' && (item.before || !item.after) || item.change === 'removed' && (!item.before || item.after) || item.change === 'changed' && (!item.before || !item.after)) fail('definition change does not match its before/after records');
    for (const side of ['before', 'after']) if (item[side]) {
      object(item[side], ['signature', 'fingerprint', 'locations']);
      text(item[side].signature);
      if (!HASH.test(item[side].fingerprint)) fail('expected a syntax hash');
      array(item[side].locations);
      if (!item[side].locations.length) fail('definition needs a source location');
      for (const location of item[side].locations) {
        object(location, ['path', 'line']); relative(location.path);
        if (!data.files.includes(location.path) || !Number.isInteger(location.line) || location.line < 1) fail('invalid definition source location');
      }
    }
    if (item.change === 'changed' && item.before.fingerprint === item.after.fingerprint) fail('unchanged syntax was marked changed');
  }
  for (const note of data.notes) {
    object(note, ['revision', 'path', 'line', 'text']);
    text(note.text);
    if (![data.base, data.head].includes(note.revision) || !data.files.includes(note.path) || !Number.isInteger(note.line) || note.line < 1) fail('invalid inventory note');
  }
  array(block.links); array(block.omissions);
  const links = new Set(); const omissions = new Set();
  for (const link of block.links) {
    object(link, ['definition', 'diagram', 'node']);
    const item = ids.get(link.definition); const graph = graphs.get(link.diagram);
    const node = [...(graph?.nodes ?? []), ...(graph?.baseline?.nodes ?? [])].find(node => node.id === link.node);
    if (!item || !node) fail('definition link names a missing definition, diagram or node');
    if (node.kind !== 'group' && node.kind !== item.kind) fail('definition kind does not match its diagram node');
    const key = JSON.stringify([link.definition, link.diagram, link.node]);
    if (links.has(key)) fail('duplicate definition link');
    links.add(key);
  }
  for (const omission of block.omissions) {
    object(omission, ['definition', 'reason']); text(omission.reason);
    if (!ids.has(omission.definition) || omissions.has(omission.definition) || block.links.some(link => link.definition === omission.definition)) fail('invalid or already diagrammed omission');
    omissions.add(omission.definition);
  }
}
