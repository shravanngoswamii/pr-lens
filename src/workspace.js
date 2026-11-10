export function initWorkspace(doc, draw) {
  const root = document.documentElement;
  const main = document.querySelector('main');
  const sidebar = document.querySelector('.sidebar');
  const toggle = document.querySelector('#views-toggle');
  const routes = new Map();
  const sections = [...main.querySelectorAll(':scope > section')];
  const graphs = new Map(doc.sections.flatMap(section => section.blocks.filter(block => block.type === 'diagram')).map((graph, index) => [graph.id, { graph, index }]));
  let current;

  function menu(open) {
    root.classList.toggle('nav-open', open);
    toggle.setAttribute('aria-expanded', String(open));
    document.querySelector('.workspace').inert = open;
    if (open) sidebar.querySelector('[aria-current=page], a').focus();
  }
  for (const section of sections) {
    const figures = [...section.querySelectorAll('figure[data-graph]')];
    routes.set(section.id, { section, figure: figures[0] });
    for (const figure of figures) routes.set(figure.id, { section, figure });
    if (!figures.length) continue;
    section.classList.add('diagram-view');
    let notes = section.querySelector('.section-notes');
    if (!notes && section.querySelector(':scope > .review-block')) {
      notes = document.createElement('details');
      notes.className = 'section-notes';
      const summary = document.createElement('summary');
      summary.textContent = 'Section notes';
      notes.append(summary);
      section.querySelectorAll(':scope > .review-block').forEach(block => notes.append(block));
    }
    section.notes = notes;
    if (figures.length > 1 && !section.querySelector('.diagram-tabs')) {
      const tabs = document.createElement('nav');
      tabs.className = 'diagram-tabs';
      tabs.setAttribute('aria-label', 'Diagrams');
      for (const figure of figures) {
        const link = document.createElement('a');
        link.href = `#${figure.id}`;
        link.dataset.view = figure.id;
        link.textContent = figure.querySelector('h3').textContent;
        tabs.append(link);
      }
      section.querySelector('.section-heading').after(tabs);
    }
    for (const figure of figures) {
      const inspector = figure.querySelector('.inspector');
      figure.querySelectorAll(':scope > details, :scope > .graph-help').forEach(node => {
        if (node.classList.contains('graph-help')) {
          const help = document.createElement('details');
          const summary = document.createElement('summary');
          summary.textContent = 'Controls and key';
          help.append(summary, node);
          inspector.append(help);
        } else inspector.append(node);
      });
    }
  }
  const meta = document.querySelector('.review-meta');
  if (meta) document.querySelector('.review-context').append(meta);
  const firstGraph = main.querySelector('figure[data-graph]');
  const fallback = firstGraph?.id ?? sections[0].id;

  async function show(id, focus = false) {
    const route = routes.get(id) ?? routes.get(current) ?? routes.get(fallback);
    current = routes.has(id) ? id : current ?? fallback;
    root.dataset.view = current;
    for (const section of sections) section.hidden = section !== route.section;
    for (const figure of main.querySelectorAll('figure[data-graph]')) figure.hidden = figure !== route.figure;
    if (route.section.notes && route.figure) route.figure.querySelector('.inspector').append(route.section.notes);
    for (const link of document.querySelectorAll('a[data-view]')) {
      const target = routes.get(link.dataset.view);
      const active = target?.section === route.section && (!link.closest('.diagram-tabs') || target.figure === route.figure);
      active ? link.setAttribute('aria-current', 'page') : link.removeAttribute('aria-current');
    }
    menu(false);
    document.dispatchEvent(new CustomEvent('review:navigate'));
    if (focus) route.section.querySelector('h2')?.focus({ preventScroll: true });
    if (route.figure && !route.figure.dataset.ready) {
      const { graph, index } = graphs.get(route.figure.dataset.graph);
      route.figure.dataset.ready = 'loading';
      await draw(graph, index);
    }
    return route;
  }
  root.classList.add('workspace-mode');
  document.addEventListener('click', event => {
    const link = event.target.closest('a[data-view]');
    if (!link) return;
    event.preventDefault();
    history.pushState(null, '', link.getAttribute('href'));
    show(link.dataset.view, true);
  });
  window.addEventListener('hashchange', () => show(location.hash.slice(1)));
  window.addEventListener('popstate', () => show(location.hash.slice(1)));
  toggle.addEventListener('click', () => menu(!root.classList.contains('nav-open')));
  document.querySelector('#comments-toggle').addEventListener('click', () => menu(false));
  document.addEventListener('keydown', event => {
    if (event.key === 'Escape' && root.classList.contains('nav-open')) { menu(false); toggle.focus(); }
  });
  matchMedia('(min-width: 1201px)').addEventListener('change', () => menu(false));
  return show(location.hash.slice(1) || root.dataset.view || fallback);
}
