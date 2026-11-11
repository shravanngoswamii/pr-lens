const element = (tag, text, parent) => {
  const node = document.createElement(tag);
  if (text) node.textContent = text;
  parent.append(node);
  return node;
};
const link = (text, url, parent) => {
  const node = element('a', text, parent);
  node.href = url;
  node.target = '_blank';
  node.rel = 'noopener noreferrer';
};

export function initReport(doc) {
  document.addEventListener('click', async event => {
    const button = event.target.closest('[data-copy-target]');
    if (!button) return;
    const control = button.closest('.copy-control');
    const field = document.getElementById(button.dataset.copyTarget);
    const status = control.querySelector('[role=status]');
    const text = JSON.parse(control.querySelector('.copy-data').textContent);
    try {
      await navigator.clipboard.writeText(text);
      status.textContent = 'Copied.';
    } catch {
      control.querySelector('details').open = true;
      field.value = text;
      field.focus();
      field.select();
      status.textContent = 'Copy the selected text.';
    }
  });

  for (const section of doc.sections) for (const block of section.blocks.filter(block => block.type === 'linked-work')) {
    const container = document.querySelector(`[data-linked-work="${block.id}"]`);
    const tree = container.querySelector('.linked-tree');
    const search = container.querySelector('input');
    const count = container.querySelector('.linked-result-count');
    const nodes = new Map(block.nodes.map(node => [node.id, node]));
    const outgoing = new Map(block.nodes.map(node => [node.id, []]));
    const incoming = new Map(block.nodes.map(node => [node.id, 0]));
    for (const edge of block.edges) {
      outgoing.get(edge.from).push(edge);
      incoming.set(edge.to, incoming.get(edge.to) + 1);
    }

    function branch(id, ancestors, edge) {
      const node = nodes.get(id);
      const cycle = ancestors.has(id);
      const details = document.createElement('details');
      details.className = 'linked-item';
      const summary = element('summary', '', details);
      element('span', `${edge ? `${edge.label}: ` : ''}${node.title}`, summary).className = 'linked-title';
      const shortName = node.url.replace('https://github.com/', '').replace(/\/(?:pull|issues)\//, '#');
      element('span', `${shortName} | ${node.kind} | ${node.state} | ${node.status}${cycle ? ' | cycle back' : ''}`, summary).className = 'block-meta';
      let filled = false;
      details.addEventListener('toggle', () => {
        if (!details.open || filled) return;
        filled = true;
        const body = element('div', '', details);
        body.className = 'linked-body';
        element('p', node.summary, body);
        if (node.detail) element('p', node.detail, body).className = 'block-meta';
        if (edge) {
          element('p', edge.text, body);
          const refs = element('ul', '', body);
          refs.className = 'refs';
          for (const evidence of edge.evidence) link(evidence.text, evidence.url, element('li', '', refs));
        }
        const actions = element('div', '', body);
        actions.className = 'linked-actions';
        link('Open on GitHub', node.url, actions);
        const comment = element('button', 'Comment', actions);
        comment.type = 'button';
        comment.setAttribute('aria-label', 'Comment on this item');
        comment.dataset.commentTarget = JSON.stringify({ section: section.id, diagram: block.id, node: id });
        if (incoming.get(id) > 1) element('p', `Linked ${incoming.get(id)} times.`, body).className = 'block-meta';
        if (cycle) {
          element('p', 'Already on this path. Expand the earlier item.', body).className = 'block-meta';
          return;
        }
        const children = outgoing.get(id);
        if (!children.length) return;
        const list = element('ul', '', body);
        list.className = 'linked-children';
        const next = new Set([...ancestors, id]);
        for (const child of children) element('li', '', list).append(branch(child.to, next, child));
      });
      return details;
    }

    function show() {
      tree.replaceChildren();
      const query = search.value.trim().toLowerCase();
      if (!query) {
        const root = branch(block.root, new Set());
        tree.append(root);
        root.open = true;
        count.textContent = 'Expand to follow links. Search covers all items.';
      } else {
        const matches = block.nodes.filter(node => `${node.title} ${node.url} ${node.state} ${node.status} ${node.summary}`.toLowerCase().includes(query));
        for (const node of matches) tree.append(branch(node.id, new Set()));
        count.textContent = `${matches.length}/${block.nodes.length} matches. Clear search for the hierarchy.`;
      }
    }
    search.addEventListener('input', show);
    show();
  }
}
