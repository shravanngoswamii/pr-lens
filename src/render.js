import { readFile } from 'node:fs/promises';
import { build } from 'esbuild';
import { validate } from './document.js';
import { emptyFeedback, validateFeedback } from './feedback.js';

const escape = value => String(value).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]);
const paragraphs = text => text.split(/\n\s*\n/).map(p => `<p>${escape(p)}</p>`).join('');

export async function render(input, { feedback } = {}) {
  const doc = validate(input);
  feedback = validateFeedback(feedback ?? emptyFeedback(doc), doc);
  const sources = new Map(doc.sources.map(source => [source.id, source]));
  const refs = ids => !ids?.length ? '' : `<ul class="refs">${ids.map(id => {
    const source = sources.get(id);
    return `<li><a href="${escape(source.url)}" target="_blank" rel="noopener noreferrer">${escape(source.label)}</a></li>`;
  }).join('')}</ul>`;
  const blockHTML = block => {
    const title = escape(block.title ?? '');
    const citations = refs(block.refs);
    switch (block.type) {
      case 'text': return `${paragraphs(block.text)}${citations}`;
      case 'code': return `<div class="example"><h3>${title}</h3><pre><code>${escape(block.code)}</code></pre>${citations}</div>`;
      case 'compare': return `<div class="comparison"><h3>${title}</h3><div class="columns"><div><h4>Before</h4>${paragraphs(block.before)}</div><div><h4>After</h4>${paragraphs(block.after)}</div></div>${citations}</div>`;
      case 'details': return `<details><summary>${title}</summary>${paragraphs(block.text)}${citations}</details>`;
      case 'finding': case 'check': return `<div class="note ${block.type}"><span class="status">${escape(block.status)}</span><h3>${title}</h3>${paragraphs(block.text)}${citations}</div>`;
      case 'diagram': return `<figure id="graph-${block.id}" data-graph="${block.id}">
        <figcaption><h3>${title}</h3>${paragraphs(block.text)}</figcaption>
        <div class="graph-tools" hidden><button type="button" data-action="in" aria-label="Zoom in">Zoom in</button><button type="button" data-action="out" aria-label="Zoom out">Zoom out</button><button type="button" data-action="fit">Fit to view</button><output aria-label="Zoom level">100%</output></div>
        <div class="graph-layout"><div class="viewport" tabindex="0" role="group" aria-label="${title}. Arrow keys pan, plus and minus zoom, zero fits."><p class="graph-message" role="status">Preparing diagram. The node list and relationships are available below.</p></div>
        <aside class="inspector" aria-label="Node details"><label for="select-${block.id}">Select a node</label><select id="select-${block.id}">${block.nodes.map((node, i) => `<option value="${i}">${escape(`${node.kind}: ${node.label}`)}</option>`).join('')}</select><div class="selection" aria-live="polite"></div></aside></div>
        <p class="graph-help">Types: rectangles. Methods: rounded boxes. Values: hexagons. Dashed edges: possible relationships.<br>Drag to pan. Ctrl + scroll to zoom. Use the buttons or focus the diagram for keyboard controls.</p>
        <details><summary>Nodes and relationships</summary>${block.nodes.map(node => `<h4>${escape(`${node.kind}: ${node.label}`)}</h4>${paragraphs(node.text)}${node.signature ? `<pre><code>${escape(node.signature)}</code></pre>` : ''}${refs(node.refs)}`).join('')}${block.edges.map(edge => `<p><strong>${escape(`${edge.from} ${edge.label} ${edge.to}`)}</strong> (${escape(edge.status)}). ${escape(edge.text)}</p>${refs(edge.refs)}`).join('')}</details>
        <details><summary>Generated Mermaid</summary><pre class="mermaid-source"></pre></details>${citations}</figure>`;
    }
  };
  const [css, font, license] = await Promise.all([
    readFile(new URL('./viewer.css', import.meta.url), 'utf8'),
    readFile(new URL('../assets/geist-latin.ttf', import.meta.url)),
    readFile(new URL('../assets/Geist-OFL.txt', import.meta.url), 'utf8'),
  ]);
  const bundle = await build({ entryPoints: [new URL('./viewer.js', import.meta.url).pathname], bundle: true, write: false, format: 'iife', minify: true, legalComments: 'inline', target: 'es2022' });
  const script = bundle.outputFiles[0].text.replace(/<\/script/gi, '<\\/script');
  const data = JSON.stringify(doc).replace(/</g, '\\u003c').replace(/\u2028/g, '\\u2028').replace(/\u2029/g, '\\u2029');
  const feedbackData = JSON.stringify(feedback).replace(/</g, '\\u003c');
  return `<!doctype html>
<html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><meta name="color-scheme" content="light"><title>${escape(doc.title)}</title><style>@font-face{font-family:Geist;src:url(data:font/ttf;base64,${font.toString('base64')}) format('truetype');font-weight:100 900;font-display:swap}${css}</style></head>
<body><a class="skip" href="#content">Skip to review</a><div class="viewer-bar"><a class="home" href="#content">Review docs</a><details class="contents"><summary>Contents</summary><nav class="action-menu" aria-label="Sections">${doc.sections.map(section => `<a href="#section-${section.id}">${escape(section.title)}</a>`).join('')}<a href="#sources">Sources</a></nav></details>
<div class="viewer-actions" data-runtime hidden><button type="button" id="comments-toggle" aria-expanded="false" aria-controls="feedback-panel">Comments (0)</button><details class="save-menu"><summary>Save</summary><div class="action-menu"><button type="button" id="save-review">HTML with comments</button><button type="button" id="download">Save editable JSON</button><button type="button" id="export-feedback">Export feedback</button><button type="button" id="import-feedback">Import feedback</button><input type="file" id="feedback-file" accept=".json,application/json" hidden></div></details></div></div>
<div class="workspace"><div class="document">
<main id="content"><header><h1>${escape(doc.title)}</h1><p class="lead">${escape(doc.summary)}</p><a href="${escape(doc.review.url)}" target="_blank" rel="noopener noreferrer">${escape(doc.review.title)}</a><details class="revisions"><summary>Reviewed revisions and scope</summary><dl><dt>Base</dt><dd><code>${doc.review.base}</code></dd><dt>Head</dt><dd><code>${doc.review.head}</code></dd>${doc.review.diffBase ? `<dt>Diff base</dt><dd><code>${doc.review.diffBase}</code></dd>` : ''}<dt>PR checked</dt><dd>${escape(doc.review.checkedAt)}</dd></dl><p>This document records the reviewed snapshot. Source links support the analysis. Structural validation does not prove call relationships.</p></details></header>
${doc.sections.map(section => `<section id="section-${section.id}" data-section="${section.id}"><div class="section-heading"><h2>${escape(section.title)}</h2><button type="button" class="comment-link" data-runtime hidden aria-label="Comment on ${escape(section.title)}" data-comment-target="${escape(JSON.stringify({ section: section.id }))}">Comment</button></div>${section.blocks.map(blockHTML).join('')}</section>`).join('')}
<section id="sources"><h2>Sources</h2>${refs(doc.sources.map(source => source.id))}</section><footer>Generated with review-docs. Explanations and relationships are agent-authored.</footer></main></div><aside id="feedback-panel" class="feedback-panel" aria-labelledby="feedback-title" hidden></aside></div>
<template id="font-license"><pre>${escape(license)}</pre></template><script id="review-data" type="application/json">${data}</script><script id="feedback-data" type="application/json">${feedbackData}</script><script>${script}</script></body></html>`;
}
