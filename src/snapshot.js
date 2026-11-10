import { validate } from './document.js';

const repository = review => review.url.split('/pull/')[0];
const findGraph = (doc, id) => {
  const graph = doc.sections.flatMap(section => section.blocks).find(block => block.type === 'diagram' && block.id === id);
  if (!graph) throw new Error(`Unknown diagram ${id}`);
  return graph;
};
export function snapshot(doc, id, view = 'head') {
  validate(doc);
  if (!['base', 'head'].includes(view)) throw new Error('Use base or head for the snapshot view');
  const { baseline, type, ...head } = findGraph(doc, id);
  if (view === 'base' && !baseline) throw new Error('This diagram has no baseline to export');
  const graph = view === 'head' ? head : { id: head.id, title: head.title, text: baseline.scope, nodes: baseline.nodes, edges: baseline.edges,
    ...(baseline.direction ?? head.direction ? { direction: baseline.direction ?? head.direction } : {}), ...(baseline.refs ? { refs: baseline.refs } : {}) };
  const used = new Set([...(graph.refs ?? []), ...graph.nodes.flatMap(node => node.refs ?? []), ...graph.edges.flatMap(edge => edge.refs ?? [])]);
  return { version: 1, revision: view === 'head' ? doc.review.head : baseline.revision, repository: repository(doc.review), ...structuredClone(graph), sources: doc.sources.filter(source => used.has(source.id)).map(source => ({ ...source })) };
}
export function validateSnapshot(value) {
  if (!value || value.version !== 1) throw new Error('Expected a version 1 design snapshot');
  const { version, revision, repository: repo, sources, ...graph } = value;
  if (!/^https:\/\/github\.com\/[^/?#]+\/[^/?#]+$/.test(repo)) throw new Error('Snapshot needs a GitHub repository URL');
  validate({ version: 1, id: 'snapshot', title: 'Snapshot', summary: 'Design snapshot.',
    review: { url: repo + '/pull/1', title: 'Snapshot', base: revision, head: revision, checkedAt: '2000-01-01T00:00:00Z' }, sources,
    sections: [{ id: 'design', title: 'Design', blocks: [{ ...graph, type: 'diagram' }] }] });
  if (graph.baseline) throw new Error('A snapshot contains one revision only');
  return value;
}
export function attachBaseline(input, inputSnapshot) {
  validateSnapshot(inputSnapshot);
  const candidate = structuredClone(input);
  if (Array.isArray(candidate?.sections)) for (const section of candidate.sections) if (Array.isArray(section?.blocks)) for (const block of section.blocks) {
    if (block?.type === 'inventory') block.links = [];
    if (block?.type === 'diagram' && block.id === inputSnapshot.id) delete block.baseline;
  }
  validate(candidate);
  const doc = structuredClone(input); const saved = structuredClone(inputSnapshot);
  if (saved.revision !== (doc.review.diffBase ?? doc.review.base)) throw new Error('Snapshot revision differs from the reviewed diff base. Reconcile the design with that commit first.');
  if (saved.repository.toLowerCase() !== repository(doc.review).toLowerCase()) throw new Error('Snapshot belongs to a different repository');
  const graph = findGraph(doc, saved.id);
  const ids = new Map();
  for (const source of saved.sources) {
    const existing = doc.sources.find(item => item.id === source.id);
    let id = source.id;
    if (existing && existing.url !== source.url) {
      id = `${saved.id}-base-${source.id}`;
      while (doc.sources.some(item => item.id === id && item.url !== source.url)) id += '-old';
    }
    if (!doc.sources.some(item => item.id === id)) doc.sources.push({ ...source, id });
    ids.set(source.id, id);
  }
  const refs = value => value?.map(id => ids.get(id));
  graph.baseline = { revision: saved.revision, scope: saved.text, ...(saved.direction ? { direction: saved.direction } : {}),
    nodes: saved.nodes.map(node => ({ ...node, ...(node.refs ? { refs: refs(node.refs) } : {}) })),
    edges: saved.edges.map(edge => ({ ...edge, ...(edge.refs ? { refs: refs(edge.refs) } : {}) })),
    ...(saved.refs ? { refs: refs(saved.refs) } : {}) };
  return validate(doc);
}
