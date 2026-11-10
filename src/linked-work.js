const ID = /^[a-zA-Z][a-zA-Z0-9_-]*$/;
const UTC = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d+)?(?:Z|\+00:00)$/;

export function validateLinkedWork(block, path = 'Linked work') {
  const fail = message => { throw new Error(`${path}: ${message}`); };
  const object = (value, keys) => {
    if (!value || typeof value !== 'object' || Array.isArray(value)) fail('expected an object');
    for (const key of Object.keys(value)) if (!keys.includes(key)) fail(`unknown field ${key}`);
  };
  const text = value => { if (typeof value !== 'string' || !value.trim()) fail('expected a nonempty string'); };
  const id = value => { text(value); if (!ID.test(value)) fail(`invalid ID ${value}`); };
  const url = value => {
    text(value);
    let parsed;
    try { parsed = new URL(value); } catch { fail('invalid URL'); }
    if (parsed.protocol !== 'https:' || parsed.username || parsed.password) fail('URLs must use HTTPS without credentials');
  };
  id(block.id);
  for (const key of ['title', 'text', 'scope']) text(block[key]);
  if (!UTC.test(block.checkedAt) || !Number.isFinite(Date.parse(block.checkedAt))) fail('invalid checkedAt timestamp');
  if (!['draft', 'reviewed'].includes(block.analysis)) fail('analysis must be draft or reviewed');
  if (typeof block.complete !== 'boolean') fail('complete must be a boolean');
  object(block.limits, ['maxDepth', 'maxItems']);
  for (const key of ['maxDepth', 'maxItems']) if (block.limits[key] !== null && (!Number.isSafeInteger(block.limits[key]) || block.limits[key] < (key === 'maxItems' ? 1 : 0))) fail(`invalid ${key} limit`);
  if (!Array.isArray(block.notes) || block.notes.some(note => typeof note !== 'string' || !note.trim())) fail('notes must be an array of nonempty strings');
  if (!Array.isArray(block.nodes) || !block.nodes.length || !Array.isArray(block.edges)) fail('expected nodes and edges arrays');
  const ids = new Set();
  for (const node of block.nodes) {
    object(node, ['id', 'url', 'title', 'kind', 'state', 'summary', 'status', 'detail']);
    id(node.id);
    if (ids.has(node.id)) fail(`duplicate node ${node.id}`);
    ids.add(node.id);
    url(node.url);
    if (!/^https:\/\/github\.com\/[^/?#]+\/[^/?#]+\/(issues|pull)\/[1-9]\d*$/.test(node.url)) fail('item URLs must identify a GitHub issue or PR');
    for (const key of ['title', 'summary']) text(node[key]);
    if (node.detail !== undefined) text(node.detail);
    if (!['pr', 'issue', 'unknown'].includes(node.kind)) fail('invalid item kind');
    if (!['open', 'closed', 'merged', 'unknown'].includes(node.state)) fail('invalid item state');
    if (!['read', 'partial', 'unread', 'unreadable'].includes(node.status)) fail('invalid read status');
  }
  if (!ids.has(block.root)) fail('root must name a node');
  const edgeIds = new Set();
  for (const edge of block.edges) {
    object(edge, ['id', 'from', 'to', 'label', 'text', 'evidence']);
    id(edge.id);
    if (edgeIds.has(edge.id)) fail(`duplicate edge ${edge.id}`);
    edgeIds.add(edge.id);
    if (!ids.has(edge.from) || !ids.has(edge.to)) fail('edge refers to an unknown node');
    text(edge.label);
    text(edge.text);
    if (!Array.isArray(edge.evidence) || !edge.evidence.length) fail('edge needs discovery evidence');
    for (const evidence of edge.evidence) {
      object(evidence, ['url', 'text']);
      url(evidence.url);
      text(evidence.text);
    }
  }
  if (block.complete && (block.nodes.some(node => node.status !== 'read') || block.notes.length)) fail('complete cannot be true with unread items or coverage notes');
  return block;
}
