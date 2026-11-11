import { readFile } from 'node:fs/promises';
import { build } from 'esbuild';
import { validate } from './document.js';
import { emptyFeedback, validateFeedback, buildTaskPrompt } from './feedback.js';
import { suggestedDiff } from './diff.js';
import { coverage, definitionURL } from './inventory.js';
import { graphView } from './design.js';
import { chapters } from './chapters.js';

const escape = value => String(value).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]);
const paragraphs = text => text.split(/\n\s*\n/).map(p => `<p>${escape(p)}</p>`).join('');

export async function render(input, { feedback } = {}) {
  const doc = validate(input);
  feedback = validateFeedback(feedback ?? emptyFeedback(doc), doc);
  const reviewPath = new URL(doc.review.url).pathname.split('/');
  const scope = `${reviewPath[1]}/${reviewPath[2]} #${reviewPath[4]}`;
  const sources = new Map(doc.sources.map(source => [source.id, source]));
  const reading = chapters(doc);
  const citation = ids => !ids?.length ? '' : `<sup class="citations">${ids.map(id => `<a href="#source-${id}" data-view="sources" data-source="${id}" aria-label="Source ${doc.sources.findIndex(source => source.id === id) + 1}: ${escape(sources.get(id).label)}">${doc.sources.findIndex(source => source.id === id) + 1}</a>`).join(', ')}</sup>`;
  const refs = (ids, expanded = false) => {
    if (!ids?.length) return '';
    const list = `<ul class="refs">${ids.map(id => {
      const source = sources.get(id);
      return `<li${expanded ? ` id="source-${id}" tabindex="-1"` : ''}><a href="${escape(source.url)}" target="_blank" rel="noopener noreferrer">${expanded ? `${doc.sources.indexOf(source) + 1}. ` : ''}${escape(source.label)}</a></li>`;
    }).join('')}</ul>`;
    return expanded ? list : `<details class="source-list"><summary>Sources (${ids.length})</summary>${list}</details>`;
  };
  const copyControl = (id, text, label) => `<div class="copy-control"><button type="button" data-runtime hidden data-copy-target="${id}">${label}</button><span role="status" class="copy-status"></span><details class="copy-fallback"><summary>Copyable text</summary><label class="sr-only" for="${id}">${label} text</label><textarea id="${id}" readonly rows="8" spellcheck="false">\n${escape(text)}</textarea></details><script type="application/json" class="copy-data">${JSON.stringify(text).replace(/</g, '\\u003c')}</script></div>`;
  const inventoryHTML = block => {
    const rows = coverage(block);
    const linked = rows.filter(row => row.links.length).length;
    const omitted = rows.filter(row => row.reason).length;
    const sourceLinks = item => ['before', 'after'].filter(side => item[side]).map(side => `<h4>${side === 'before' ? 'Base' : 'Head'}</h4><pre><code>${escape(item[side].signature)}</code></pre><ul class="refs">${item[side].locations.map(location => `<li><a href="${escape(definitionURL(doc.review, side === 'before' ? block.data.base : block.data.head, location))}" target="_blank" rel="noopener noreferrer">${escape(location.path)}:${location.line}</a></li>`).join('')}</ul>`).join('');
    const diagrams = new Map(doc.sections.flatMap(section => section.blocks).filter(block => block.type === 'diagram').map(graph => [graph.id, graph]));
    return `<div class="definition-inventory"><h3>${escape(block.title)}</h3>${paragraphs(block.text)}<p class="block-meta">${rows.length} changed declarations · ${linked} in diagrams · ${omitted} omitted with reasons · ${rows.length - linked - omitted} unassigned<br>${rows.filter(row => row.change === 'added').length} added · ${rows.filter(row => row.change === 'changed').length} changed · ${rows.filter(row => row.change === 'removed').length} removed<br>Scope: ${escape(block.data.scope.join(', '))} · ${block.data.files.length} changed files</p>
      <div class="inventory-filters" data-runtime hidden><div><label for="inventory-search">Search definitions</label><input id="inventory-search" type="search" placeholder="Name, signature or file"></div><div><label for="inventory-kind">Kind</label><select id="inventory-kind" data-filter="kind"><option value="">All kinds</option>${['type', 'function', 'method', 'macro'].map(kind => `<option>${kind}</option>`).join('')}</select></div><div><label for="inventory-change">Change</label><select id="inventory-change" data-filter="change"><option value="">All changes</option>${['added', 'changed', 'removed'].map(change => `<option>${change}</option>`).join('')}</select></div><div><label for="inventory-coverage">Coverage</label><select id="inventory-coverage" data-filter="coverage"><option value="">All definitions</option><option value="linked">In diagrams</option><option value="omitted">Omitted</option><option value="unassigned">Unassigned</option></select></div></div><p class="inventory-result block-meta" role="status"></p>
      <details><summary>Collection notes (${block.data.notes.length})</summary><p>Parser: ${escape(block.data.parser)}.</p><p>Written declarations are compared without loading the project. Macros, generated code and quoted code need separate checks. Signature edits and moves may appear as removal and addition.</p>${block.data.notes.map(note => `<p class="block-meta"><a href="${escape(definitionURL(doc.review, note.revision, note))}" target="_blank" rel="noopener noreferrer">${escape(note.path)}:${note.line}</a> ${escape(note.text)}</p>`).join('')}</details>
      <div class="inventory-items">${rows.map(item => `<details class="definition-item" id="definition-${item.id}" data-kind="${item.kind}" data-change="${item.change}" data-coverage="${item.links.length ? 'linked' : item.reason ? 'omitted' : 'unassigned'}"><summary>${escape(item.name)}<span class="block-meta">${item.kind} · ${item.change} · ${item.links.length ? 'in diagrams' : item.reason ? 'omitted' : 'unassigned'}</span></summary>${sourceLinks(item)}${item.links.map(link => { const graph = diagrams.get(link.diagram); const node = [...graph.nodes, ...(graph.baseline?.nodes ?? [])].find(node => node.id === link.node); return `<p><a data-view="graph-${link.diagram}" data-node="${link.node}" href="#graph-${link.diagram}">${escape(graph.title)} / ${escape(node.label)}</a>${node.kind === 'group' ? ' (group)' : ''}</p>`; }).join('')}${item.reason ? paragraphs(item.reason) : !item.links.length ? '<p>No diagram or omission reason recorded.</p>' : ''}</details>`).join('')}</div></div>`;
  };
  const blockHTML = (block, id, sectionId) => {
    const title = escape(block.title ?? '');
    const citations = citation(block.refs);
    switch (block.type) {
      case 'text': return paragraphs(block.text).replace(/<\/p>$/, `${citations}</p>`);
      case 'code': return `<div class="example"><h3>${title}</h3><pre><code>${escape(block.code)}</code></pre>${citations}</div>`;
      case 'compare': return `<div class="comparison"><h3>${title}</h3><div class="columns"><div><h4>Before</h4>${paragraphs(block.before)}</div><div><h4>After</h4>${paragraphs(block.after)}</div></div>${citations}</div>`;
      case 'details': return `<details><summary>${title}</summary>${paragraphs(block.text)}${citations}</details>`;
      case 'table': return `<div class="review-table"><h3>${title}</h3><div class="table-scroll" role="region" aria-label="${title}" tabindex="0"><table role="table"><thead><tr>${block.columns.map(column => `<th scope="col">${escape(column)}</th>`).join('')}</tr></thead><tbody>${block.rows.map(row => `<tr>${row.map((cell, i) => i ? `<td data-label="${escape(block.columns[i])}">${escape(cell)}</td>` : `<th scope="row">${escape(cell)}</th>`).join('')}</tr>`).join('')}</tbody></table></div>${citations}</div>`;
      case 'finding': case 'check': return `<div class="note ${block.type}"><span class="status">${escape(block.status)}</span><h3>${title}</h3>${paragraphs(block.text)}${citations}</div>`;
      case 'diff': {
        const diff = suggestedDiff(block);
        return `<div class="suggested-change"><h3>${title}</h3>${paragraphs(block.text)}<p class="block-meta">${block.scope === 'pr' ? 'PR change' : 'Suggestion · not applied'} · ${escape(block.verification)}<br><code>${escape(block.path)}</code> · snippet lines</p>
        <div class="diff-scroll" tabindex="0" role="region" aria-label="${title} diff"><table class="diff"><caption class="sr-only">Removed lines start with minus. Added lines start with plus.</caption><colgroup><col class="line-number"><col class="line-number"><col class="line-mark"><col></colgroup><tbody>${diff.rows.map(row => row.kind === 'hunk' || row.kind === 'note' ? `<tr class="${row.kind}"><td colspan="4">${escape(row.text)}</td></tr>` : `<tr class="${row.kind}"><td class="line-number">${row.oldLine}</td><td class="line-number">${row.newLine}</td><td class="line-mark">${row.mark}</td><td class="line-code">${escape(row.text) || ' '}</td></tr>`).join('')}</tbody></table>${!diff.rows.length ? '<p>No changes between the snippets.</p>' : ''}</div>
        ${copyControl(id, diff.patch, 'Copy patch')}<p class="block-meta">Check file context before applying this snippet patch.</p>${citations}</div>`;
      }
      case 'proposal': return `<div class="wording-proposal"><h3>${title}</h3>${paragraphs(block.text)}<p class="block-meta">Suggested ${block.kind} · not applied</p><pre class="proposed-text">${escape(block.suggested)}</pre>${copyControl(id, block.suggested, `Copy ${block.kind}`)}<details><summary>Current ${block.kind}</summary><pre>${escape(block.current) || '(Empty)'}</pre></details>${citations}</div>`;
      case 'prompt': return `<div class="agent-task"><h3>${title}</h3>${paragraphs(block.text)}<div class="task-instructions">${paragraphs(block.instructions)}</div>${copyControl(id, buildTaskPrompt(doc, block.instructions, block.refs), 'Copy agent prompt')}${citations}</div>`;
      case 'linked-work': return `<div class="linked-work" id="graph-${block.id}" data-linked-work="${block.id}"><h3>${title}</h3>${paragraphs(block.text)}<p class="block-meta">${block.nodes.filter(node => node.status === 'read').length} of ${block.nodes.length} items read · ${block.complete ? 'Collection complete' : 'Incomplete'} · ${block.analysis === 'reviewed' ? 'Agent-reviewed explanations' : 'Explanations need review'}<br>Checked ${escape(block.checkedAt)}</p><details><summary>Scope and limits</summary>${paragraphs(block.scope)}<p>Depth: ${block.limits.maxDepth ?? 'none'}. Read budget: ${block.limits.maxItems ?? 'none'}.</p>${block.notes.map(note => paragraphs(note)).join('')}</details><div class="linked-browser" data-runtime hidden><label for="search-${block.id}">Search linked work</label><input id="search-${block.id}" type="search" placeholder="Title, number or read status"><p class="linked-result-count block-meta" role="status"></p><div class="linked-tree"></div></div><details><summary>All items and links</summary>${block.nodes.map(node => `<h4><a href="${escape(node.url)}" target="_blank" rel="noopener noreferrer">${escape(node.title)}</a></h4><p class="block-meta">${node.kind} · ${node.state} · ${node.status}</p>${paragraphs(node.summary)}${node.detail ? paragraphs(node.detail) : ''}`).join('')}${block.edges.map(edge => `<p>${escape(`${block.nodes.find(node => node.id === edge.from).title} ${edge.label} ${block.nodes.find(node => node.id === edge.to).title}`)}. ${escape(edge.text)}</p>${edge.evidence.map(evidence => `<p class="block-meta"><a href="${escape(evidence.url)}" target="_blank" rel="noopener noreferrer">${escape(evidence.text)}</a></p>`).join('')}`).join('')}</details>${citations}</div>`;
      case 'inventory': return inventoryHTML(block);
      case 'diagram': {
        const all = graphView(block, doc);
        return `<figure id="graph-${block.id}" data-graph="${block.id}">
        <figcaption><div class="diagram-heading"><h3>${title}</h3><a class="explore-link" data-runtime hidden data-view="graph-${block.id}" href="#graph-${block.id}">Open diagram</a><a class="explanation-link" data-runtime hidden data-view="section-${sectionId}" href="#section-${sectionId}">Back to section</a></div>${paragraphs(block.text)}<p class="canvas-hint">Select a node for its meaning and source.</p></figcaption>

        ${block.baseline ? `<div class="design-views" role="group" aria-label="Design revision" data-runtime hidden>${['base', 'changes', 'head'].map(mode => `<button type="button" data-revision="${mode}">${mode[0].toUpperCase() + mode.slice(1)}</button>`).join('')}</div><p class="design-key block-meta"><span class="change-added">Added (+)</span> · <span class="change-changed">Changed (~)</span> · <span class="change-removed">Removed (-)</span> · Existing<br>Changes describe this scoped graph and its linked declarations. Scope: ${escape(block.baseline.scope)}</p>` : ''}
        <div class="graph-layout"><div class="canvas-pane"><div class="viewport" tabindex="0" role="group" aria-label="${title}. Arrow keys pan, plus and minus zoom, zero fits."><p class="graph-message" role="status">Loading diagram. Text details are below.</p></div><div class="graph-tools" hidden><button type="button" data-action="out" aria-label="Zoom out">-</button><output aria-label="Zoom level">100%</output><button type="button" data-action="in" aria-label="Zoom in">+</button><button type="button" data-action="fit" aria-label="Fit to view">Fit</button></div></div>
        <aside class="inspector" aria-label="Node details"><label for="select-${block.id}">Select a node</label><select id="select-${block.id}">${all.nodes.map((node, i) => `<option value="${i}">${escape(`${node.kind}: ${node.label}`)}</option>`).join('')}</select><div class="selection" aria-live="polite"></div></aside></div>
        <p class="graph-help">Labels identify types, functions, methods, macros, values and groups. Dashed arrows are uncertain.<br>Drag to pan. Ctrl + scroll to zoom. Keyboard: arrows, +, -, 0.</p>
        <details><summary>Nodes and relationships</summary>${all.nodes.map(node => `<h4>${escape(`${node.kind}: ${node.label}`)}</h4>${paragraphs(node.text)}${node.signature ? `<pre><code>${escape(node.signature)}</code></pre>` : ''}${refs(node.refs)}`).join('')}${all.edges.map(edge => `<p><strong>${escape(`${edge.from} ${edge.label} ${edge.to}`)}</strong> (${escape(edge.status)}). ${escape(edge.text)}</p>${refs(edge.refs)}`).join('')}</details>
        <details><summary>Generated Mermaid</summary><pre class="mermaid-source"></pre></details>${citations}</figure>`;
      }
    }
  };
  const [css, font, license] = await Promise.all([
    readFile(new URL('./viewer.css', import.meta.url), 'utf8'),
    readFile(new URL('../assets/ibm-plex-sans.ttf', import.meta.url)),
    readFile(new URL('../assets/IBM-Plex-OFL.txt', import.meta.url), 'utf8'),
  ]);
  const bundle = await build({ entryPoints: [new URL('./viewer.js', import.meta.url).pathname], bundle: true, write: false, format: 'iife', minify: true, legalComments: 'inline', target: 'es2022' });
  const script = bundle.outputFiles[0].text.replace(/<\/script/gi, '<\\/script');
  const data = JSON.stringify(doc).replace(/</g, '\\u003c').replace(/\u2028/g, '\\u2028').replace(/\u2029/g, '\\u2029');
  const feedbackData = JSON.stringify(feedback).replace(/</g, '\\u003c');
  return `<!doctype html>
<html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><meta name="color-scheme" content="light"><title>${escape(doc.title)}</title><style>@font-face{font-family:"IBM Plex Sans";src:url(data:font/ttf;base64,${font.toString('base64')}) format('truetype');font-weight:100 700;font-display:swap}${css}</style></head>
<body><a class="skip" href="#content">Skip to review</a>
<aside class="sidebar" id="view-navigation" aria-label="Review navigation">
<a class="home" data-view="${reading[0].id}" href="#${reading[0].id}"><svg viewBox="0 0 24 24" width="22" height="22" aria-hidden="true"><path d="M5 6h5v5H5zM14 13h5v5h-5zM7.5 11v4.5H14M10 8.5h6.5V13" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linejoin="round"/></svg>Review docs</a>
<a class="review-scope" href="${escape(doc.review.url)}" target="_blank" rel="noopener noreferrer">${escape(scope)}</a>
<nav aria-label="Views">${reading.map(chapter => `<a data-view="${chapter.id}" href="#${chapter.id}"${chapter.supporting ? ' class="supporting-link"' : ''}>${escape(chapter.title)}</a>`).join('')}<a data-view="sources" href="#sources">Sources</a></nav>
<details class="review-context"><summary>About this review</summary></details></aside>
<div class="viewer-bar"><button type="button" id="views-toggle" data-runtime hidden aria-expanded="false" aria-controls="view-navigation">Views</button><div class="review-title"><h1>${escape(doc.title)}</h1></div>
<div class="viewer-actions" data-runtime hidden><button type="button" id="comments-toggle" aria-expanded="false" aria-controls="feedback-panel">Comments (0)</button><details class="save-menu"><summary>Save</summary><div class="action-menu"><button type="button" id="save-review">HTML with comments</button><button type="button" id="download">Save editable JSON</button><button type="button" id="export-feedback">Export feedback</button><button type="button" id="import-feedback">Import feedback</button><input type="file" id="feedback-file" accept=".json,application/json" hidden></div></details></div></div>
<div class="workspace"><div class="document">
<main id="content" tabindex="-1"><header class="review-meta"><p class="lead">${escape(doc.summary)}</p><a href="${escape(doc.review.url)}" target="_blank" rel="noopener noreferrer">${escape(doc.review.title)}</a><details class="revisions"><summary>Revisions</summary><dl><dt>Base</dt><dd><code>${doc.review.base}</code></dd><dt>Head</dt><dd><code>${doc.review.head}</code></dd>${doc.review.diffBase ? `<dt>Diff base</dt><dd><code>${doc.review.diffBase}</code></dd>` : ''}<dt>PR checked</dt><dd>${escape(doc.review.checkedAt)}</dd>${doc.review.agent ? `<dt>Agent</dt><dd>${escape(doc.review.agent.name)}</dd><dt>Requested model</dt><dd>${escape(doc.review.agent.requestedModel)}</dd><dt>Reported models</dt><dd>${escape(doc.review.agent.models.join(", ") || "Unreported")}</dd>` : ""}</dl><p>Reviewed snapshot. Validation checks structure, not call paths.</p></details></header>
${doc.sections.map((section, sectionIndex) => `<section id="section-${section.id}" data-section="${section.id}"><div class="section-heading"><h2 tabindex="-1">${escape(section.title)}</h2><button type="button" class="comment-link" data-runtime hidden aria-label="Comment on ${escape(section.title)}" data-comment-target="${escape(JSON.stringify({ section: section.id }))}">Comment</button></div><div class="chapter-body">${section.blocks.map((block, blockIndex) => `<div class="review-block" data-order="${blockIndex}" data-block-type="${block.type}">${blockHTML(block, `copy-${sectionIndex}-${blockIndex}`, section.id)}</div>`).join('')}</div></section>`).join('')}
<section id="sources"><div class="section-heading"><h2 tabindex="-1">Sources</h2></div>${refs(doc.sources.map(source => source.id), true)}</section></main></div><aside id="feedback-panel" class="feedback-panel" aria-labelledby="feedback-title" hidden></aside></div>
<template id="font-license"><pre>${escape(license)}</pre></template><script id="review-data" type="application/json">${data}</script><script id="feedback-data" type="application/json">${feedbackData}</script><script>${script}</script></body></html>`;
}
