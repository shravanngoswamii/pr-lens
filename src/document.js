import { validateLinkedWork } from './linked-work.js';

const ID = /^[a-zA-Z][a-zA-Z0-9_-]*$/;
const SHA = /^[a-f0-9]{40}$/;

export function validate(doc) {
  const fail = (path, message) => { throw new Error(`${path}: ${message}`); };
  const object = (value, path, keys) => {
    if (!value || typeof value !== 'object' || Array.isArray(value)) fail(path, 'expected an object');
    for (const key of Object.keys(value)) if (!keys.includes(key)) fail(`${path}.${key}`, 'unknown field');
  };
  const string = (value, path) => {
    if (typeof value !== 'string' || !value.trim()) fail(path, 'expected a nonempty string');
  };
  const choice = (value, path, choices) => {
    if (!choices.includes(value)) fail(path, `expected one of ${choices.join(', ')}`);
  };
  const array = (value, path, nonempty = false) => {
    if (!Array.isArray(value) || (nonempty && !value.length)) fail(path, `expected ${nonempty ? 'a nonempty' : 'an'} array`);
  };
  const identifier = (value, path) => {
    string(value, path);
    if (!ID.test(value)) fail(path, 'use a letter followed by letters, digits, underscores or hyphens');
  };
  const unique = (items, path) => {
    const ids = new Set();
    items.forEach((item, i) => {
      identifier(item.id, `${path}[${i}].id`);
      if (ids.has(item.id)) fail(`${path}[${i}].id`, `duplicate id ${item.id}`);
      ids.add(item.id);
    });
    return ids;
  };
  object(doc, '$', ['version', 'id', 'title', 'summary', 'review', 'sources', 'sections']);
  if (doc.version !== 1) fail('$.version', 'expected 1');
  identifier(doc.id, '$.id');
  string(doc.title, '$.title');
  string(doc.summary, '$.summary');
  object(doc.review, '$.review', ['url', 'title', 'base', 'head', 'diffBase', 'checkedAt']);
  string(doc.review.title, '$.review.title');
  if (!/^https:\/\/github\.com\/[^/?#]+\/[^/?#]+\/pull\/[1-9]\d*$/.test(doc.review.url)) fail('$.review.url', 'expected a GitHub PR URL');
  for (const key of ['base', 'head']) if (!SHA.test(doc.review[key])) fail(`$.review.${key}`, 'expected a full 40-character commit SHA');
  if (doc.review.diffBase !== undefined && !SHA.test(doc.review.diffBase)) fail('$.review.diffBase', 'expected a full 40-character commit SHA');
  if (!/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d+)?(?:Z|\+00:00)$/.test(doc.review.checkedAt) || !Number.isFinite(Date.parse(doc.review.checkedAt))) fail('$.review.checkedAt', 'expected a UTC timestamp such as 2026-11-10T00:00:00Z');
  array(doc.sources, '$.sources');
  doc.sources.forEach((source, i) => {
    const p = `$.sources[${i}]`;
    object(source, p, ['id', 'label', 'url']);
    string(source.label, `${p}.label`);
    string(source.url, `${p}.url`);
    let url;
    try { url = new URL(source.url); } catch { fail(`${p}.url`, 'expected an absolute HTTPS URL'); }
    if (url.protocol !== 'https:' || url.username || url.password) fail(`${p}.url`, 'expected HTTPS without credentials');
    if (/\/(blob|raw)\//.test(url.pathname) && !/\/(blob|raw)\/[a-f0-9]{40}\//.test(url.pathname)) fail(`${p}.url`, 'pin code links to a full commit SHA');
  });
  const sources = unique(doc.sources, '$.sources');
  const refs = (value, path) => {
    if (value === undefined) return;
    array(value, path);
    value.forEach((id, i) => { if (!sources.has(id)) fail(`${path}[${i}]`, `unknown source ${id}`); });
  };
  const graphIds = new Set();
  array(doc.sections, '$.sections', true);
  doc.sections.forEach((section, i) => {
    const p = `$.sections[${i}]`;
    object(section, p, ['id', 'title', 'blocks']);
    string(section.title, `${p}.title`);
    array(section.blocks, `${p}.blocks`, true);
    section.blocks.forEach((block, j) => {
      const b = `${p}.blocks[${j}]`;
      const fields = {
        text: ['text'], code: ['title', 'code', 'language'], compare: ['title', 'before', 'after'],
        details: ['title', 'text'], finding: ['title', 'text', 'status'], check: ['title', 'text', 'status'],
        diagram: ['id', 'title', 'text', 'direction', 'nodes', 'edges'],
        diff: ['title', 'text', 'path', 'before', 'after', 'scope', 'verification'],
        proposal: ['title', 'text', 'kind', 'current', 'suggested'],
        prompt: ['title', 'text', 'instructions'],
        'linked-work': ['id', 'title', 'text', 'root', 'checkedAt', 'scope', 'analysis', 'complete', 'limits', 'notes', 'nodes', 'edges'],
      };
      if (!block || !Object.hasOwn(fields, block.type)) fail(`${b}.type`, `expected one of ${Object.keys(fields).join(', ')}`);
      object(block, b, ['type', 'refs', ...fields[block.type]]);
      refs(block.refs, `${b}.refs`);
      if (block.type === 'linked-work') {
        validateLinkedWork(block, b);
        if (graphIds.has(block.id)) fail(`${b}.id`, `duplicate diagram id ${block.id}`);
        graphIds.add(block.id);
        return;
      }
      if (block.type === 'diff') {
        for (const field of ['title', 'text', 'path']) string(block[field], `${b}.${field}`);
        for (const field of ['before', 'after']) if (typeof block[field] !== 'string') fail(`${b}.${field}`, 'expected a string');
        if (/^[\\/]|[\r\n\0]/.test(block.path) || block.path.split(/[\\/]/).includes('..')) fail(`${b}.path`, 'use a relative path without parent traversal or newlines');
        choice(block.scope, `${b}.scope`, ['pr', 'suggestion']);
        choice(block.verification, `${b}.verification`, ['source-checked', 'tested', 'unverified']);
        return;
      }
      if (block.type === 'proposal') {
        for (const field of ['title', 'text', 'suggested']) string(block[field], `${b}.${field}`);
        choice(block.kind, `${b}.kind`, ['title', 'description']);
        if (typeof block.current !== 'string' || block.kind === 'title' && !block.current.trim()) fail(`${b}.current`, 'expected the original PR text');
        return;
      }
      for (const field of fields[block.type].filter(f => !['language', 'direction', 'nodes', 'edges', 'id', 'status'].includes(f))) string(block[field], `${b}.${field}`);
      if (block.language !== undefined) string(block.language, `${b}.language`);
      if (block.type === 'finding') choice(block.status, `${b}.status`, ['verified', 'suggestion', 'question', 'unverified']);
      if (block.type === 'check') choice(block.status, `${b}.status`, ['passed', 'failed', 'unverified']);
      if (block.type !== 'diagram') return;
      identifier(block.id, `${b}.id`);
      if (graphIds.has(block.id)) fail(`${b}.id`, `duplicate diagram id ${block.id}`);
      graphIds.add(block.id);
      if (block.direction !== undefined) choice(block.direction, `${b}.direction`, ['LR', 'TB']);
      array(block.nodes, `${b}.nodes`, true);
      array(block.edges, `${b}.edges`);
      block.nodes.forEach((node, k) => {
        const n = `${b}.nodes[${k}]`;
        object(node, n, ['id', 'label', 'kind', 'text', 'signature', 'refs']);
        for (const f of ['label', 'text']) string(node[f], `${n}.${f}`);
        choice(node.kind, `${n}.kind`, ['type', 'method', 'value']);
        if (node.signature !== undefined) string(node.signature, `${n}.signature`);
        refs(node.refs, `${n}.refs`);
      });
      const nodes = unique(block.nodes, `${b}.nodes`);
      block.edges.forEach((edge, k) => {
        const e = `${b}.edges[${k}]`;
        object(edge, e, ['id', 'from', 'to', 'label', 'status', 'text', 'refs']);
        for (const f of ['label', 'text']) string(edge[f], `${e}.${f}`);
        for (const f of ['from', 'to']) if (!nodes.has(edge[f])) fail(`${e}.${f}`, `unknown node ${edge[f]}`);
        choice(edge.status, `${e}.status`, ['source', 'observed', 'possible']);
        refs(edge.refs, `${e}.refs`);
      });
      unique(block.edges, `${b}.edges`);
    });
  });
  unique(doc.sections, '$.sections');
  return doc;
}

// Labels must not become Mermaid syntax.
const label = text => [...text].map(c => /[a-zA-Z0-9 ]/.test(c) ? c : `#${c.codePointAt(0)};`).join('');

export function toMermaid(graph) {
  const ids = new Map(graph.nodes.map((node, i) => [node.id, `n${i}`]));
  const lines = [`flowchart ${graph.direction ?? 'LR'}`];
  graph.nodes.forEach(node => {
    const text = `"${label(`${node.kind}: ${node.label}`)}"`;
    const shape = node.kind === 'method' ? `(${text})` : node.kind === 'value' ? `{{${text}}}` : `[${text}]`;
    lines.push(`  ${ids.get(node.id)}${shape}`);
  });
  graph.edges.forEach(edge => {
    const arrow = edge.status === 'possible' ? '-.->' : '-->';
    lines.push(`  ${ids.get(edge.from)} ${arrow}|"${label(edge.label)}"| ${ids.get(edge.to)}`);
  });
  return lines.join('\n');
}
