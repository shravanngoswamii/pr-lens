export const document = () => ({
  version: 1, id: 'tiny', title: 'A small review', summary: 'Follow one call.',
  review: { url: 'https://github.com/owner/repo/pull/1', title: 'A change', base: 'a'.repeat(40), head: 'b'.repeat(40), checkedAt: '2026-11-10T00:00:00Z' },
  sources: [{ id: 'code', label: 'Definition', url: `https://github.com/owner/repo/blob/${'b'.repeat(40)}/src/code.jl#L1` }],
  sections: [{ id: 'design', title: 'Design', blocks: [{ type: 'diagram', id: 'calls', title: 'A recursive call', text: 'One selected source path.', nodes: [
    { id: 'f', label: 'f', kind: 'method', text: 'Calls itself.', signature: 'f(x::Int)', refs: ['code'] },
    { id: 't', label: 'Int', kind: 'type', text: 'Input type.' },
  ], edges: [{ id: 'recurse', from: 'f', to: 'f', label: 'calls', status: 'source', text: 'Source recursion.', refs: ['code'] }] }] }],
});

