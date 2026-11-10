import { readFile } from 'node:fs/promises';
import { build } from 'esbuild';
import { validate } from './document.js';
import { emptyFeedback, validateFeedback, buildTaskPrompt } from './feedback.js';
import { suggestedDiff } from './diff.js';

const escape = value => String(value).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]);
const paragraphs = text => text.split(/\n\s*\n/).map(p => `<p>${escape(p)}</p>`).join('');

export async function render(input, { feedback } = {}) {
  const doc = validate(input);
  feedback = validateFeedback(feedback ?? emptyFeedback(doc), doc);
  const reviewPath = new URL(doc.review.url).pathname.split('/');
  const scope = `${reviewPath[1]}/${reviewPath[2]} #${reviewPath[4]}`;
  const sources = new Map(doc.sources.map(source => [source.id, source]));
  const refs = (ids, expanded = false) => {
    if (!ids?.length) return '';
    const list = `<ul class="refs">${ids.map(id => {
      const source = sources.get(id);
      return `<li><a href="${escape(source.url)}" target="_blank" rel="noopener noreferrer">${escape(source.label)}</a></li>`;
    }).join('')}</ul>`;
    return expanded ? list : `<details class="source-list"><summary>Sources (${ids.length})</summary>${list}</details>`;
  };
  const copyControl = (id, text, label) => `<div class="copy-control"><button type="button" data-runtime hidden data-copy-target="${id}">${label}</button><span role="status" class="copy-status"></span><details class="copy-fallback"><summary>Copyable text</summary><label class="sr-only" for="${id}">${label} text</label><textarea id="${id}" readonly rows="8" spellcheck="false">\n${escape(text)}</textarea></details><script type="application/json" class="copy-data">${JSON.stringify(text).replace(/</g, '\\u003c')}</script></div>`;
  const blockHTML = (block, id, sectionId) => {
    const title = escape(block.title ?? '');
    const citations = refs(block.refs);
    switch (block.type) {
      case 'text': return `${paragraphs(block.text)}${citations}`;
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
      case 'diagram': return `<figure id="graph-${block.id}" data-graph="${block.id}">
        <figcaption><div class="diagram-heading"><h3>${title}</h3><a class="explore-link" data-runtime hidden data-view="graph-${block.id}" href="#graph-${block.id}">Explore diagram</a><a class="explanation-link" data-runtime hidden data-view="section-${sectionId}" href="#section-${sectionId}">Back to explanation</a></div>${paragraphs(block.text)}<p class="canvas-hint">Select a node for its meaning and source.</p></figcaption>

        <div class="graph-layout"><div class="canvas-pane"><div class="viewport" tabindex="0" role="group" aria-label="${title}. Arrow keys pan, plus and minus zoom, zero fits."><p class="graph-message" role="status">Loading diagram. Text details are below.</p></div><div class="graph-tools" hidden><button type="button" data-action="out" aria-label="Zoom out">-</button><output aria-label="Zoom level">100%</output><button type="button" data-action="in" aria-label="Zoom in">+</button><button type="button" data-action="fit" aria-label="Fit to view">Fit</button></div></div>
        <aside class="inspector" aria-label="Node details"><label for="select-${block.id}">Select a node</label><select id="select-${block.id}">${block.nodes.map((node, i) => `<option value="${i}">${escape(`${node.kind}: ${node.label}`)}</option>`).join('')}</select><div class="selection" aria-live="polite"></div></aside></div>
        <p class="graph-help">Rectangles: types. Rounded: methods. Hexagons: values. Dashed: uncertain.<br>Drag to pan. Ctrl + scroll to zoom. Keyboard: arrows, +, -, 0.</p>
        <details><summary>Nodes and relationships</summary>${block.nodes.map(node => `<h4>${escape(`${node.kind}: ${node.label}`)}</h4>${paragraphs(node.text)}${node.signature ? `<pre><code>${escape(node.signature)}</code></pre>` : ''}${refs(node.refs)}`).join('')}${block.edges.map(edge => `<p><strong>${escape(`${edge.from} ${edge.label} ${edge.to}`)}</strong> (${escape(edge.status)}). ${escape(edge.text)}</p>${refs(edge.refs)}`).join('')}</details>
        <details><summary>Generated Mermaid</summary><pre class="mermaid-source"></pre></details>${citations}</figure>`;
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
<a class="home" data-view="section-${doc.sections[0].id}" href="#section-${doc.sections[0].id}"><svg viewBox="0 0 24 24" width="22" height="22" aria-hidden="true"><path d="M5 6h5v5H5zM14 13h5v5h-5zM7.5 11v4.5H14M10 8.5h6.5V13" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linejoin="round"/></svg>Review docs</a>
<a class="review-scope" href="${escape(doc.review.url)}" target="_blank" rel="noopener noreferrer">${escape(scope)}</a>
<nav aria-label="Views">${doc.sections.map(section => `<a data-view="section-${section.id}" href="#section-${section.id}">${escape(section.title)}</a>`).join('')}<a data-view="sources" href="#sources">Sources</a></nav>
<details class="review-context"><summary>About this review</summary></details></aside>
<div class="viewer-bar"><button type="button" id="views-toggle" data-runtime hidden aria-expanded="false" aria-controls="view-navigation">Views</button><div class="review-title"><h1>${escape(doc.title)}</h1></div>
<div class="viewer-actions" data-runtime hidden><button type="button" id="comments-toggle" aria-expanded="false" aria-controls="feedback-panel">Comments (0)</button><details class="save-menu"><summary>Save</summary><div class="action-menu"><button type="button" id="save-review">HTML with comments</button><button type="button" id="download">Save editable JSON</button><button type="button" id="export-feedback">Export feedback</button><button type="button" id="import-feedback">Import feedback</button><input type="file" id="feedback-file" accept=".json,application/json" hidden></div></details></div></div>
<div class="workspace"><div class="document">
<main id="content" tabindex="-1"><header class="review-meta"><p class="lead">${escape(doc.summary)}</p><a href="${escape(doc.review.url)}" target="_blank" rel="noopener noreferrer">${escape(doc.review.title)}</a><details class="revisions"><summary>Revisions</summary><dl><dt>Base</dt><dd><code>${doc.review.base}</code></dd><dt>Head</dt><dd><code>${doc.review.head}</code></dd>${doc.review.diffBase ? `<dt>Diff base</dt><dd><code>${doc.review.diffBase}</code></dd>` : ''}<dt>PR checked</dt><dd>${escape(doc.review.checkedAt)}</dd></dl><p>Reviewed snapshot. Validation checks structure, not call paths.</p></details></header>
${doc.sections.map((section, sectionIndex) => `<section id="section-${section.id}" data-section="${section.id}"><div class="section-heading"><h2 tabindex="-1">${escape(section.title)}</h2><button type="button" class="comment-link" data-runtime hidden aria-label="Comment on ${escape(section.title)}" data-comment-target="${escape(JSON.stringify({ section: section.id }))}">Comment</button></div><div class="chapter-body">${section.blocks.map((block, blockIndex) => `<div class="review-block" data-order="${blockIndex}" data-block-type="${block.type}">${blockHTML(block, `copy-${sectionIndex}-${blockIndex}`, section.id)}</div>`).join('')}</div></section>`).join('')}
<section id="sources"><div class="section-heading"><h2 tabindex="-1">Sources</h2></div>${refs(doc.sources.map(source => source.id), true)}</section></main></div><aside id="feedback-panel" class="feedback-panel" aria-labelledby="feedback-title" hidden></aside></div>
<template id="font-license"><pre>${escape(license)}</pre></template><script id="review-data" type="application/json">${data}</script><script id="feedback-data" type="application/json">${feedbackData}</script><script>${script}</script></body></html>`;
}
