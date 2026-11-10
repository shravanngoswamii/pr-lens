import mermaid from 'mermaid';
import { toMermaid } from './document.js';
import { initFeedback } from './feedback-viewer.js';
import { initWorkspace } from './workspace.js';
import { initReport } from './report-viewer.js';
import { graphView, changeLabel, edgeChangeLabel } from './design.js';
import { definitionsFor, definitionURL } from './inventory.js';
import { initInventories } from './inventory-viewer.js';

const doc = JSON.parse(document.querySelector('#review-data').textContent);
initFeedback(doc);
initReport(doc);
initInventories();
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
  flowchart: { htmlLabels: false, useMaxWidth: false, curve: 'basis', wrappingWidth: 320, nodeSpacing: 90, rankSpacing: 70 },
  themeVariables: { fontFamily: 'IBM Plex Sans, system-ui, sans-serif', fontSize: '16px', primaryColor: '#ffffff', primaryTextColor: '#171717', primaryBorderColor: '#acb9bf', lineColor: '#7d919b', edgeLabelBackground: '#f5f8f9' },
});

const initialized = new WeakSet();
let renderCount = 0;
async function draw(original, index, requestedMode) {
  const graphId = original.id;
  const graphElement = document.querySelector(`#graph-${graphId}`);
  const mode = requestedMode ?? graphElement.dataset.revisionView ?? 'changes';
  if (!initialized.has(graphElement)) {
    initialized.add(graphElement);
    graphElement.querySelectorAll('[data-revision]').forEach(button => button.addEventListener('click', () => draw(original, index, button.dataset.revision)));
    document.addEventListener('review:select-node', async event => {
      if (event.detail.diagram !== graphId) return;
      if (!graphElement.nodeIds?.includes(event.detail.node) && original.baseline) await draw(original, index, 'changes');
      graphElement.selectNode?.(event.detail.node);
    });
  }
  graphElement.dataset.revisionView = mode;
  graphElement.querySelectorAll('[data-revision]').forEach(button => button.setAttribute('aria-pressed', String(button.dataset.revision === mode)));
  graphElement.graphController?.abort();
  graphElement.graphObserver?.disconnect();
  const controller = new AbortController();
  graphElement.graphController = controller;
  const { signal } = controller;
  graphElement.dataset.ready = 'loading';
  const graph = graphView(original, doc, mode);
  const figure = document.querySelector(`#graph-${graph.id}`);
  const viewport = figure.querySelector('.viewport');
  const selection = figure.querySelector('.selection');
  const select = figure.querySelector('select');
  graphElement.nodeIds = graph.nodes.map(node => node.id);
  select.replaceChildren(...graph.nodes.map((node, i) => new Option(`${node.kind}: ${changeLabel(node)}`, String(i))));
  const syntax = toMermaid(graph);
  figure.querySelector('.mermaid-source').textContent = syntax;
  let svg;
  let focusNode = () => {};
  function showNode(i, focus = true) {
    const node = graph.nodes[i];
    select.value = String(i);
    selection.replaceChildren();
    figure.dataset.selectedNode = node.id;
    element('h4', node.label, selection);
    if (node.change) element('p', node.change === 'unchanged' ? 'Existing' : node.change, selection).className = 'block-meta';
    element('p', node.text, selection);
    if (node.signature) {
      const signature = element('details', '', selection);
      element('summary', 'Signature', signature);
      element('code', node.signature, element('pre', '', signature));
    }
    addRefs(node.refs, selection);
    const definitions = definitionsFor(doc, graph.id, node.id);
    if (definitions.length) {
      const list = element('details', '', selection); list.className = 'definition-list';
      element('summary', `Changed definitions (${definitions.length})`, list);
      for (const item of definitions) {
        const detail = element('details', '', list); element('summary', `${item.name} · ${item.change}`, detail);
        for (const side of ['before', 'after']) if (item[side]) {
          element('p', side === 'before' ? 'Base' : 'Head', detail);
          element('code', item[side].signature, element('pre', '', detail));
          for (const location of item[side].locations) {
            const link = element('a', `${location.path}:${location.line}`, element('p', '', detail));
            link.href = definitionURL(doc.review, side === 'before' ? doc.review.diffBase ?? doc.review.base : doc.review.head, location);
            link.target = '_blank'; link.rel = 'noopener noreferrer';
          }
        }
      }
    }
    const comment = element('button', 'Comment', selection);
    comment.type = 'button';
    comment.setAttribute('aria-label', 'Comment on this node');
    comment.dataset.commentTarget = JSON.stringify({ section: figure.closest('section').dataset.section, diagram: graph.id, node: node.id });
    const related = graph.edges.filter(edge => edge.from === node.id || edge.to === node.id);
    const relationships = element('details', '', selection);
    element('summary', `Relationships (${related.length})`, relationships);
    for (const edge of related) {
      const from = graph.nodes.find(n => n.id === edge.from).label;
      const to = graph.nodes.find(n => n.id === edge.to).label;
      element('strong', `${from} ${edge.label} ${to}`, element('p', '', relationships));
      element('p', `${edge.change && edge.change !== 'unchanged' ? edge.change + ' · ' : ''}${edge.status}: ${edge.text}`, relationships);
      addRefs(edge.refs, relationships);
    }
    svg?.querySelectorAll('.node').forEach(n => n.setAttribute('aria-pressed', String(n.dataset.nodeIndex === String(i))));
    if (focus) focusNode(i);
  }
  figure.selectNode = id => { const i = graph.nodes.findIndex(node => node.id === id); if (i >= 0) showNode(i); };
  select.addEventListener('change', () => showNode(Number(select.value)), { signal });
  showNode(Math.max(0, graph.nodes.findIndex(node => node.id === figure.dataset.selectedNode)));
  try {
    const result = await mermaid.render(`diagram${index}-${++renderCount}`, syntax);
    if (signal.aborted) return;
    viewport.innerHTML = result.svg;
    svg = viewport.querySelector('svg');
    // Mermaid leaves edge entities encoded.
    svg.querySelectorAll('.edgeLabels > .edgeLabel').forEach((group, i) => {
      const text = group.querySelector('text');
      text.textContent = edgeChangeLabel(graph.edges[i]);
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
    size();
    let view = { ...initial };
    let userView = false;
    const update = () => {
      svg.setAttribute('viewBox', `${view.x} ${view.y} ${view.w} ${view.h}`);
      figure.querySelector('output').textContent = `${Math.round(initial.w / view.w * 100)}%`;
    };
    focusNode = i => {
      if (view.w >= initial.w / 1.05) return;
      const node = svg.querySelector(`[data-node-index="${i}"]`);
      if (!node?.getCTM() || !svg.getCTM()) return;
      const box = node.getBBox();
      const point = new DOMPoint(box.x + box.width / 2, box.y + box.height / 2)
        .matrixTransform(node.getCTM()).matrixTransform(svg.getCTM().inverse());
      view.x = point.x - view.w / 2;
      view.y = point.y - view.h / 4;
      update();
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
    const readable = () => {
      if (userView || !viewport.clientWidth) return;
      const scale = svg.getScreenCTM()?.a;
      const narrow = matchMedia('(max-width: 1200px)').matches;
      const target = narrow ? 1 : 0.8;
      if (scale > 0 && scale < (narrow ? 0.95 : 0.75)) zoom(Math.min(8 / (initial.w / view.w), target / scale));
      if (narrow || initial.w / view.w >= 1.5) focusNode(Number(select.value));
    };
    figure.graphObserver = new ResizeObserver(() => { size(); readable(); });
    figure.graphObserver.observe(viewport);
    figure.querySelector('.graph-tools').hidden = false;
    figure.querySelectorAll('[data-action]').forEach(button => button.addEventListener('click', () => {
      userView = true;
      if (button.dataset.action === 'fit') fit();
      else zoom(button.dataset.action === 'in' ? 1.25 : 0.8);
    }, { signal }));
    let drag = null;
    let moved = false;
    svg.addEventListener('pointerdown', event => {
      if (event.button !== 0) return;
      moved = false;
      drag = { x: event.clientX, y: event.clientY, view: { ...view } };
      svg.setPointerCapture(event.pointerId);
    }, { signal });
    svg.addEventListener('pointermove', event => {
      if (!drag) return;
      if (Math.hypot(event.clientX - drag.x, event.clientY - drag.y) < 5 && !moved) return;
      userView = true;
      moved = true;
      const matrix = svg.getScreenCTM();
      view.x = drag.view.x - (event.clientX - drag.x) / matrix.a;
      view.y = drag.view.y - (event.clientY - drag.y) / matrix.d;
      update();
    }, { signal });
    svg.addEventListener('pointerup', event => {
      drag = null;
      if (!moved) {
        const node = document.elementFromPoint(event.clientX, event.clientY)?.closest('.node');
        if (node && svg.contains(node)) showNode(Number(node.dataset.nodeIndex));
      }
    }, { signal });
    svg.addEventListener('pointercancel', () => { drag = null; }, { signal });
    viewport.addEventListener('wheel', event => {
      if (!event.ctrlKey) return;
      userView = true;
      event.preventDefault();
      zoom(event.deltaY < 0 ? 1.1 : 1 / 1.1);
    }, { passive: false, signal });
    viewport.addEventListener('keydown', event => {
      if (event.target !== viewport) return;
      if (['+', '=', '-', '0', 'ArrowLeft', 'ArrowRight', 'ArrowUp', 'ArrowDown'].includes(event.key)) { event.preventDefault(); userView = true; }
      if (['+', '='].includes(event.key)) zoom(1.25);
      if (event.key === '-') zoom(0.8);
      if (event.key === '0') fit();
      if (event.key === 'ArrowLeft') view.x -= view.w / 10;
      if (event.key === 'ArrowRight') view.x += view.w / 10;
      if (event.key === 'ArrowUp') view.y -= view.h / 10;
      if (event.key === 'ArrowDown') view.y += view.h / 10;
      update();
    }, { signal });
    svg.querySelectorAll('.node').forEach(node => {
      const match = node.id.match(/(?:^|-)flowchart-n(\d+)-/);
      if (!match) return;
      const i = Number(match[1]);
      node.dataset.nodeIndex = String(i);
      node.setAttribute('tabindex', '0');
      node.setAttribute('role', 'button');
      node.setAttribute('aria-label', `${graph.nodes[i].kind}: ${changeLabel(graph.nodes[i])}`);
      node.addEventListener('keydown', event => {
        if (event.key === 'Enter' || event.key === ' ') { event.preventDefault(); showNode(i); }
      }, { signal });
    });
    fit();
    readable();
    const selected = graph.nodes.findIndex(node => node.id === figure.dataset.selectedNode);
    showNode(selected >= 0 ? selected : 0, false);
    figure.dataset.ready = 'true';
  } catch (error) {
    if (signal.aborted) return;
    viewport.replaceChildren();
    element('p', `Diagram failed: ${error.message}. See text details below.`, viewport).setAttribute('role', 'alert');
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
  await initWorkspace(doc, draw);
  document.documentElement.dataset.ready = 'true';
}
start();
