import { definitionsFor } from './inventory.js';

const same = (a, b, fields) => fields.every(field => JSON.stringify(a[field] ?? null) === JSON.stringify(b[field] ?? null));
export const changeLabel = item => item.change && item.change !== 'unchanged' ? `${item.label} [${item.change}]` : item.label;
export const edgeChangeLabel = edge => edge.change && edge.change !== 'unchanged' ? `${edge.label} (${({ added: '+', changed: '~', removed: '-' })[edge.change]})` : edge.label;
export function graphView(graph, doc, mode = 'changes') {
  if (!graph.baseline) return graph;
  if (mode === 'base') return { ...graph, nodes: graph.baseline.nodes, edges: graph.baseline.edges, direction: graph.baseline.direction ?? graph.direction };
  if (mode === 'head') return { ...graph };
  const before = graph.baseline;
  const oldNodes = new Map(before.nodes.map(node => [node.id, node]));
  const newNodes = new Map(graph.nodes.map(node => [node.id, node]));
  const oldEdges = new Map(before.edges.map(edge => [edge.id, edge]));
  const newEdges = new Map(graph.edges.map(edge => [edge.id, edge]));
  const nodes = [...new Set([...newNodes.keys(), ...oldNodes.keys()])].map(id => {
    const a = oldNodes.get(id); const b = newNodes.get(id);
    const definitions = definitionsFor(doc, graph.id, id);
    const change = !a ? 'added' : !b ? 'removed' : !same(a, b, ['kind', 'label', 'text', 'signature']) || definitions.length ? 'changed' : 'unchanged';
    return { ...(b ?? a), change };
  });
  const edges = [];
  for (const id of new Set([...newEdges.keys(), ...oldEdges.keys()])) {
    const a = oldEdges.get(id); const b = newEdges.get(id);
    const change = !a ? 'added' : !b ? 'removed' : same(a, b, ['from', 'to', 'label', 'text', 'status']) ? 'unchanged' : 'changed';
    if (a && b && (a.from !== b.from || a.to !== b.to)) edges.push({ ...a, id: `old-${edges.length}`, change: 'removed' });
    edges.push({ ...(b ?? a), change });
  }
  return { ...graph, nodes, edges };
}
