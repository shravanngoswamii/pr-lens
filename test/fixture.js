export const document = () => ({
  version: 1, id: 'tiny', title: 'A small review', summary: 'Follow one call.',
  review: { url: 'https://github.com/owner/repo/pull/1', title: 'A change', base: 'a'.repeat(40), head: 'b'.repeat(40), checkedAt: '2026-11-10T00:00:00Z' },
  sources: [{ id: 'code', label: 'Definition', url: `https://github.com/owner/repo/blob/${'b'.repeat(40)}/src/code.jl#L1` }],
  sections: [{ id: 'design', title: 'Design', blocks: [{ type: 'diagram', id: 'calls', title: 'A recursive call', text: 'One selected source path.', nodes: [
    { id: 'f', label: 'f', kind: 'method', text: 'Calls itself.', signature: 'f(x::Int)', refs: ['code'] },
    { id: 't', label: 'Int', kind: 'type', text: 'Input type.' },
  ], edges: [{ id: 'recurse', from: 'f', to: 'f', label: 'calls', status: 'source', text: 'Source recursion.', refs: ['code'] }] }] }],
});

export const linkedWork = () => ({
  type: 'linked-work', id: 'links', title: 'Related work', text: 'Discovery paths with cycles.',
  root: 'root', checkedAt: '2026-11-10T00:00:00Z', scope: 'Bodies and discussion.', analysis: 'reviewed', complete: false,
  limits: { maxDepth: 2, maxItems: 10 }, notes: [], nodes: [
    { id: 'root', url: 'https://github.com/owner/repo/pull/1', title: 'The change', kind: 'pr', state: 'open', status: 'read', summary: 'Replaces the old approach.' },
    { id: 'old', url: 'https://github.com/owner/repo/pull/2', title: 'Earlier approach', kind: 'pr', state: 'closed', status: 'read', summary: 'Provides the earlier design.' },
    { id: 'unknown', url: 'https://github.com/owner/repo/issues/3', title: 'Follow-up', kind: 'issue', state: 'unknown', status: 'unread', summary: 'Its role is unverified.', detail: 'Depth limit.' },
  ], edges: [
    { id: 'replaces', from: 'root', to: 'old', label: 'replaces', text: 'The root body names its predecessor.', evidence: [{ url: 'https://github.com/owner/repo/pull/1', text: 'PR body.' }] },
    { id: 'back', from: 'old', to: 'root', label: 'mentions', text: 'The earlier work links back.', evidence: [{ url: 'https://github.com/owner/repo/pull/2', text: 'PR body.' }] },
    { id: 'pending', from: 'old', to: 'unknown', label: 'mentions', text: 'Needs review.', evidence: [{ url: 'https://github.com/owner/repo/pull/2', text: 'PR body.' }] },
    { id: 'also', from: 'root', to: 'unknown', label: 'mentions', text: 'Needs review.', evidence: [{ url: 'https://github.com/owner/repo/pull/1', text: 'PR body.' }] },
  ],
});

