import { chapters } from './chapters.js';

export function initWorkspace(doc, draw) {
  const root = document.documentElement;
  const main = document.querySelector('main');
  const sidebar = document.querySelector('.sidebar');
  const toggle = document.querySelector('#views-toggle');
  const routes = new Map();
  const sections = [...main.querySelectorAll(':scope > section')];
  main.querySelector('.chapter-outline')?.remove();
  const outline = document.createElement('nav');
  outline.className = 'chapter-outline';
  outline.setAttribute('aria-label', 'In Details');
  main.prepend(outline);
  const reading = chapters(doc);
  const grouped = Boolean(doc.sections[0].group);
  root.classList.toggle('grouped-review', grouped);
  const chapterFor = section => reading.find(chapter => chapter.sections.includes(section.dataset.section));
  const graphs = new Map(doc.sections.flatMap(section => section.blocks.filter(block => block.type === 'diagram')).map((graph, index) => [graph.id, { graph, index }]));
  document.querySelector('.chapter-pager')?.remove();
  const pager = document.createElement('nav');
  pager.className = 'chapter-pager';
  pager.setAttribute('aria-label', 'Reading order');
  main.after(pager);
  let current;

  function menu(open) {
    root.classList.toggle('nav-open', open);
    toggle.setAttribute('aria-expanded', String(open));
    document.querySelector('.workspace').inert = open;
    if (open) sidebar.querySelector('[aria-current=page], a').focus();
  }
  function restore(section) {
    const body = section.querySelector('.chapter-body');
    if (!body) return;
    const blocks = [...section.querySelectorAll('.review-block[data-order]')];
    blocks.sort((a, b) => Number(a.dataset.order) - Number(b.dataset.order));
    blocks.forEach(block => { block.hidden = false; body.append(block); });
    section.querySelector('.section-notes')?.remove();
    section.classList.remove('diagram-view');
  }
  for (const section of sections) {
    const figures = [...section.querySelectorAll('figure[data-graph]')];
    routes.set(section.id, { section });
    restore(section);
    for (const figure of figures) routes.set(figure.id, { section, figure });
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
  for (const chapter of reading) routes.set(chapter.id, { section: sections.find(section => section.id === `section-${chapter.sections[0]}`), chapter });
  const meta = document.querySelector('.review-meta');
  if (meta) document.querySelector('.review-context').append(meta);
  const fallback = reading[0].id;

  function pageLink(chapter, label) {
    const link = document.createElement('a');
    link.href = `#${chapter.id}`;
    link.dataset.view = chapter.id;
    const direction = document.createElement('span');
    direction.textContent = label;
    const title = document.createElement('strong');
    title.textContent = chapter.title;
    link.append(direction, title);
    return link;
  }
  async function show(id, focus = false) {
    const route = routes.get(id) ?? routes.get(current) ?? routes.get(fallback);
    current = routes.has(id) ? id : current ?? fallback;
    const chapter = route.chapter ?? chapterFor(route.section);
    outline.replaceChildren();
    outline.hidden = !chapter?.supporting || Boolean(route.figure);
    if (!outline.hidden) for (const id of chapter.sections) {
      const section = sections.find(section => section.dataset.section === id);
      const link = document.createElement('a');
      link.href = `#${section.id}`;
      link.dataset.view = section.id;
      link.textContent = section.querySelector('h2').textContent;
      outline.append(link);
    }
    root.dataset.view = current;
    root.dataset.mode = route.figure ? 'diagram' : 'chapter';
    for (const section of sections) {
      restore(section);
      section.hidden = route.figure || !grouped || !chapter ? section !== route.section : !chapter.sections.includes(section.dataset.section);
    }
    main.querySelectorAll('figure[data-graph]').forEach(figure => { figure.hidden = false; });
    if (route.figure) {
      const section = route.section;
      section.classList.add('diagram-view');
      const notes = document.createElement('details');
      notes.className = 'section-notes';
      const summary = document.createElement('summary');
      summary.textContent = 'Section notes';
      notes.append(summary);
      for (const block of section.querySelectorAll('.chapter-body > .review-block')) {
        if (block.dataset.blockType === 'diagram') block.hidden = !block.contains(route.figure);
        else notes.append(block);
      }
      if (notes.children.length > 1) route.figure.querySelector('.inspector').append(notes);
      section.querySelectorAll('figure[data-graph]').forEach(figure => { figure.hidden = figure !== route.figure; });
    }
    const sequence = reading.filter(chapter => !chapter.supporting);
    const index = sequence.indexOf(chapter);
    pager.replaceChildren();
    if (index > 0) pager.append(pageLink(sequence[index - 1], 'Previous'));
    if (index >= 0 && index < sequence.length - 1) pager.append(pageLink(sequence[index + 1], 'Next'));
    if (sequence.length && (chapter?.supporting || !chapter)) pager.append(pageLink(sequence.at(-1), 'Back to review'));
    for (const link of document.querySelectorAll('a[data-view]')) {
      const target = routes.get(link.dataset.view);
      const active = (target?.chapter ? target.chapter === chapter : target?.section === route.section) && (!link.closest('.diagram-tabs') || target.figure === route.figure);
      active ? link.setAttribute('aria-current', 'page') : link.removeAttribute('aria-current');
    }
    menu(false);
    document.dispatchEvent(new CustomEvent('review:navigate'));
    if (focus) route.section.querySelector('h2')?.focus({ preventScroll: true });
    if (grouped && !route.figure) {
      if (route.chapter) main.scrollTop = 0;
      else route.section.scrollIntoView({ block: 'start' });
    }
    const visible = route.figure ? [route.figure] : [...main.querySelectorAll(':scope > section:not([hidden]) figure[data-graph]')];
    for (const figure of visible) {
      if (figure.dataset.ready) continue;
      const { graph, index } = graphs.get(figure.dataset.graph);
      figure.dataset.ready = 'loading';
      await draw(graph, index);
    }
    return route;
  }
  root.classList.add('workspace-mode');
  document.addEventListener('click', async event => {
    const link = event.target.closest('a[data-view]');
    if (!link) return;
    event.preventDefault();
    history.pushState(null, '', link.getAttribute('href'));
    const route = await show(link.dataset.view, true);
    if (link.dataset.source) document.getElementById(`source-${link.dataset.source}`)?.focus();
    if (link.dataset.node && route.figure) document.dispatchEvent(new CustomEvent('review:select-node', { detail: { diagram: route.figure.dataset.graph, node: link.dataset.node } }));
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
