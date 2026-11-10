import mermaid from 'mermaid';
import { toMermaid } from './document.js';
import { initFeedback } from './feedback-viewer.js';

const doc = JSON.parse(document.querySelector('#review-data').textContent);
initFeedback(doc);
const sources = new Map(doc.sources.map(source => [source.id, source]));
const element = (tag, text, parent) => {
  const node = document.createElement(tag);
  if (text) node.textContent = text;
  parent.append(node);
  return node;
};
const addRefs = (ids, parent) => {
  if (!ids?.length) return;
  const list = element('ul', '', parent);
  list.className = 'refs';
  for (const id of ids) {
    const source = sources.get(id);
    const a = element('a', source.label, element('li', '', list));
    a.href = source.url;
    a.target = '_blank';
    a.rel = 'noopener noreferrer';
  }
};

mermaid.initialize({ startOnLoad: false, securityLevel: 'strict', theme: 'base', look: 'classic',
  flowchart: { htmlLabels: false, useMaxWidth: false, curve: 'basis', wrappingWidth: 320 },
  themeVariables: { fontFamily: 'Geist, system-ui, sans-serif', fontSize: '16px', primaryColor: '#ffffff', primaryTextColor: '#171717', primaryBorderColor: '#a3a3a3', lineColor: '#737373', edgeLabelBackground: '#f7f7f7' },
});

async function draw(graph, index) {
  const figure = document.querySelector(`#graph-${graph.id}`);
  const viewport = figure.querySelector('.viewport');
  const selection = figure.querySelector('.selection');
  const select = figure.querySelector('select');
  const syntax = toMermaid(graph);
  figure.querySelector('.mermaid-source').textContent = syntax;
  let svg;
  function showNode(i) {
    const node = graph.nodes[i];
    select.value = String(i);
    selection.replaceChildren();
    element('h4', node.label, selection);
    element('p', node.text, selection);
    if (node.signature) element('code', node.signature, element('pre', '', selection));
    addRefs(node.refs, selection);
    const comment = element('button', 'Comment on this node', selection);
    comment.type = 'button';
    comment.dataset.commentTarget = JSON.stringify({ section: figure.closest('section').dataset.section, diagram: graph.id, node: node.id });
    const related = graph.edges.filter(edge => edge.from === node.id || edge.to === node.id);
    if (related.length) element('h4', 'Relationships', selection);
    for (const edge of related) {
      const from = graph.nodes.find(n => n.id === edge.from).label;
      const to = graph.nodes.find(n => n.id === edge.to).label;
      element('strong', `${from} ${edge.label} ${to}`, element('p', '', selection));
      element('p', `${edge.status}: ${edge.text}`, selection);
      addRefs(edge.refs, selection);
    }
    svg?.querySelectorAll('.node').forEach(n => n.setAttribute('aria-pressed', String(n.dataset.nodeIndex === String(i))));
  }
  select.addEventListener('change', () => showNode(Number(select.value)));
  showNode(0);
  try {
    const result = await mermaid.render(`diagram${index}`, syntax);
    viewport.innerHTML = result.svg;
    svg = viewport.querySelector('svg');
    // Mermaid 12 leaves entities in edge labels. Restore the original as SVG text.
    svg.querySelectorAll('.edgeLabels > .edgeLabel').forEach((group, i) => {
      const text = group.querySelector('text');
      text.textContent = graph.edges[i].label;
      text.setAttribute('x', '0');
      text.setAttribute('y', '0');
      text.setAttribute('dominant-baseline', 'middle');
      group.querySelector('.label').removeAttribute('transform');
      const rect = group.querySelector('rect.background');
      const box = text.getBBox();
      if (box.width) for (const [key, value] of Object.entries({ x: box.x - 4, y: box.y - 2, width: box.width + 8, height: box.height + 4 })) rect?.setAttribute(key, value);
    });
    svg.removeAttribute('style');
    svg.setAttribute('width', '100%');
    svg.setAttribute('height', '100%');
    svg.setAttribute('aria-label', graph.title);
    const original = svg.viewBox.baseVal;
    const initial = { x: original.x, y: original.y, w: original.width, h: original.height };
    const size = () => figure.style.setProperty('--graph-height', `${Math.ceil(Math.min(680, Math.max(360, initial.h * Math.min(1, viewport.clientWidth / initial.w))))}px`);
    new ResizeObserver(size).observe(viewport);
    size();
    let view = { ...initial };
    const update = () => {
      svg.setAttribute('viewBox', `${view.x} ${view.y} ${view.w} ${view.h}`);
      figure.querySelector('output').textContent = `${Math.round(initial.w / view.w * 100)}%`;
    };
    const zoom = factor => {
      const scale = initial.w / view.w * factor;
      if (scale < 0.2 || scale > 8) return;
      view.x += view.w * (1 - 1 / factor) / 2;
      view.y += view.h * (1 - 1 / factor) / 2;
      view.w /= factor;
      view.h /= factor;
      update();
    };
    const fit = () => { view = { ...initial }; update(); };
    figure.querySelector('.graph-tools').hidden = false;
    figure.querySelectorAll('[data-action]').forEach(button => button.addEventListener('click', () => {
      if (button.dataset.action === 'fit') fit();
      else zoom(button.dataset.action === 'in' ? 1.25 : 0.8);
    }));
    let drag = null;
    let moved = false;
    svg.addEventListener('pointerdown', event => {
      if (event.button !== 0) return;
      moved = false;
      drag = { x: event.clientX, y: event.clientY, view: { ...view } };
      svg.setPointerCapture(event.pointerId);
    });
    svg.addEventListener('pointermove', event => {
      if (!drag) return;
      if (Math.hypot(event.clientX - drag.x, event.clientY - drag.y) < 5 && !moved) return;
      moved = true;
      const matrix = svg.getScreenCTM();
      view.x = drag.view.x - (event.clientX - drag.x) / matrix.a;
      view.y = drag.view.y - (event.clientY - drag.y) / matrix.d;
      update();
    });
    svg.addEventListener('pointerup', event => {
      drag = null;
      if (!moved) {
        const node = document.elementFromPoint(event.clientX, event.clientY)?.closest('.node');
        if (node && svg.contains(node)) showNode(Number(node.dataset.nodeIndex));
      }
    });
    svg.addEventListener('pointercancel', () => { drag = null; });
    viewport.addEventListener('wheel', event => {
      if (!event.ctrlKey) return;
      event.preventDefault();
      zoom(event.deltaY < 0 ? 1.1 : 1 / 1.1);
    }, { passive: false });
    viewport.addEventListener('keydown', event => {
      if (event.target !== viewport) return;
      if (['+', '=', '-', '0', 'ArrowLeft', 'ArrowRight', 'ArrowUp', 'ArrowDown'].includes(event.key)) event.preventDefault();
      if (['+', '='].includes(event.key)) zoom(1.25);
      if (event.key === '-') zoom(0.8);
      if (event.key === '0') fit();
      if (event.key === 'ArrowLeft') view.x -= view.w / 10;
      if (event.key === 'ArrowRight') view.x += view.w / 10;
      if (event.key === 'ArrowUp') view.y -= view.h / 10;
      if (event.key === 'ArrowDown') view.y += view.h / 10;
      update();
    });
    svg.querySelectorAll('.node').forEach(node => {
      const match = node.id.match(/(?:^|-)flowchart-n(\d+)-/);
      if (!match) return;
      const i = Number(match[1]);
      node.dataset.nodeIndex = String(i);
      node.setAttribute('tabindex', '0');
      node.setAttribute('role', 'button');
      node.setAttribute('aria-label', `${graph.nodes[i].kind}: ${graph.nodes[i].label}`);
      node.addEventListener('keydown', event => {
        if (event.key === 'Enter' || event.key === ' ') { event.preventDefault(); showNode(i); }
      });
    });
    showNode(0);
    figure.dataset.ready = 'true';
  } catch (error) {
    viewport.replaceChildren();
    element('p', `Diagram could not be drawn: ${error.message}. Use the node list below.`, viewport).setAttribute('role', 'alert');
    figure.dataset.ready = 'error';
  }
}

const download = document.querySelector('#download');
download.hidden = false;
download.addEventListener('click', () => {
  const url = URL.createObjectURL(new Blob([JSON.stringify(doc, null, 2) + '\n'], { type: 'application/json' }));
  const link = element('a', '', document.body);
  link.href = url;
  link.download = `${doc.id}.json`;
  link.click();
  link.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
});

async function start() {
  await document.fonts.ready;
  for (const [index, graph] of doc.sections.flatMap(section => section.blocks.filter(block => block.type === 'diagram')).entries()) await draw(graph, index);
  document.documentElement.dataset.ready = 'true';
}
start();
