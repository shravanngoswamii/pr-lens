import { document } from './fixture.js';
export function designDocument() {
  const doc = document();
  doc.sources.push({ id: 'base-code', label: 'Base definition', url: `https://github.com/owner/repo/blob/${doc.review.base}/src/code.jl#L1` });
  const method = { id: 'f', kind: 'method', label: 'f', text: 'Validates an input.', signature: 'f(x::Int)', refs: ['code'] };
  const old = { id: 'old', kind: 'method', label: 'old', text: 'Previous handler.', signature: 'old(x::Int)', refs: ['base-code'] };
  const kept = { id: 'kept', kind: 'type', label: 'Existing', text: 'Shared storage.', refs: ['code'] };
  const added = { id: 'new', kind: 'type', label: 'New', text: 'New storage.', refs: ['code'] };
  const edge = { id: 'calls', from: 'f', to: 'new', label: 'calls', text: 'Selected source path.', status: 'source', refs: ['code'] };
  const graph = { type: 'diagram', id: 'calls', title: 'Design change', text: 'Storage and validation.', nodes: [method, kept, added], edges: [edge],
    baseline: { revision: doc.review.base, scope: 'Storage and validation.', nodes: [{ ...method, refs: ['base-code'] }, { ...kept, refs: ['base-code'] }, old], edges: [{ ...edge, to: 'old', refs: ['base-code'] }] } };
  const side = (signature, fingerprint) => ({ signature, fingerprint: fingerprint.repeat(64), locations: [{ path: 'src/code.jl', line: 1 }] });
  const data = { version: 1, language: 'Julia', parser: 'Test fixture', base: doc.review.base, head: doc.review.head, scope: ['src/'], files: ['src/code.jl'], notes: [], items: [
    { id: 'def-f', kind: 'method', name: 'f', signature: method.signature, change: 'changed', before: side(method.signature, 'a'), after: side(method.signature, 'b') },
    { id: 'def-new', kind: 'type', name: 'New', signature: 'New', change: 'added', after: side('New', 'c') },
    { id: 'def-old', kind: 'method', name: 'old', signature: old.signature, change: 'removed', before: side(old.signature, 'd') },
    { id: 'def-unassigned', kind: 'macro', name: 'pending', signature: 'pending(x)', change: 'added', after: side('pending(x)', 'e') },
  ] };
  const inventory = { type: 'inventory', title: 'Definitions', text: 'Parsed source changes.', data, links: [
    { definition: 'def-f', diagram: 'calls', node: 'f' }, { definition: 'def-new', diagram: 'calls', node: 'new' }, { definition: 'def-old', diagram: 'calls', node: 'old' },
  ], omissions: [] };
  doc.sections[0].blocks = [graph];
  doc.sections.push({ id: 'definitions', title: 'Definitions', blocks: [inventory] });
  return doc;
}
