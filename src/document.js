import { validateLinkedWork } from './linked-work.js';
import { validateInventory } from './inventory.js';
import { changeLabel, edgeChangeLabel } from './design.js';

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
  object(doc.review, '$.review', ['url', 'title', 'base', 'head', 'diffBase', 'checkedAt', 'agent']);
  if (doc.review.agent !== undefined) {
    object(doc.review.agent, '$.review.agent', ['name', 'requestedModel', 'models']);
    for (const key of ['name', 'requestedModel']) string(doc.review.agent[key], `$.review.agent.${key}`);
    array(doc.review.agent.models, '$.review.agent.models');
    doc.review.agent.models.forEach((name, i) => string(name, `$.review.agent.models[${i}]`));
  }
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
  const checkGraph = (block, b) => {
    if (block.direction !== undefined) choice(block.direction, `${b}.direction`, ['LR', 'TB']);
    array(block.nodes, `${b}.nodes`, true);
    array(block.edges, `${b}.edges`);
    block.nodes.forEach((node, k) => {
      const n = `${b}.nodes[${k}]`;
      object(node, n, ['id', 'label', 'kind', 'text', 'signature', 'refs']);
      for (const f of ['label', 'text']) string(node[f], `${n}.${f}`);
      choice(node.kind, `${n}.kind`, ['type', 'function', 'method', 'macro', 'value', 'group']);
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
  };
  const graphIds = new Set();
  array(doc.sections, '$.sections', true);
  doc.sections.forEach((section, i) => {
    const p = `$.sections[${i}]`;
    object(section, p, ['id', 'title', 'group', 'blocks']);
    if (section.group !== undefined) choice(section.group, `${p}.group`, ['overview', 'changes', 'design', 'review', 'details']);
    string(section.title, `${p}.title`);
    array(section.blocks, `${p}.blocks`, true);
    section.blocks.forEach((block, j) => {
      const b = `${p}.blocks[${j}]`;
      const fields = {
        text: ['text'], code: ['title', 'code', 'language'], compare: ['title', 'before', 'after'],
        details: ['title', 'text'], table: ['title', 'columns', 'rows'], finding: ['title', 'text', 'status'], check: ['title', 'text', 'status'],
        diagram: ['id', 'title', 'text', 'direction', 'nodes', 'edges', 'baseline'],
        inventory: ['title', 'text', 'data', 'links', 'omissions'],
        diff: ['title', 'text', 'path', 'before', 'after', 'scope', 'verification'],
        proposal: ['title', 'text', 'kind', 'current', 'suggested'],
        prompt: ['title', 'text', 'instructions'],
        'linked-work': ['id', 'title', 'text', 'root', 'checkedAt', 'scope', 'analysis', 'complete', 'limits', 'notes', 'nodes', 'edges'],
      };
      if (!block || !Object.hasOwn(fields, block.type)) fail(`${b}.type`, `expected one of ${Object.keys(fields).join(', ')}`);
      object(block, b, ['type', 'refs', ...fields[block.type]]);
      refs(block.refs, `${b}.refs`);
      if (block.type === 'inventory') {
        string(block.title, `${b}.title`); string(block.text, `${b}.text`); return;
      }
      if (block.type === 'table') {
        string(block.title, `${b}.title`);
        array(block.columns, `${b}.columns`, true);
        block.columns.forEach((column, k) => string(column, `${b}.columns[${k}]`));
        array(block.rows, `${b}.rows`, true);
        block.rows.forEach((row, k) => {
          array(row, `${b}.rows[${k}]`);
          if (row.length !== block.columns.length) fail(`${b}.rows[${k}]`, 'expected one cell per column');
          row.forEach((cell, l) => string(cell, `${b}.rows[${k}][${l}]`));
        });
        return;
      }
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
      for (const field of fields[block.type].filter(f => !['language', 'direction', 'nodes', 'edges', 'id', 'status', 'baseline'].includes(f))) string(block[field], `${b}.${field}`);
      if (block.language !== undefined) string(block.language, `${b}.language`);
      if (block.type === 'finding') choice(block.status, `${b}.status`, ['verified', 'suggestion', 'question', 'unverified']);
      if (block.type === 'check') choice(block.status, `${b}.status`, ['passed', 'failed', 'unverified']);
      if (block.type !== 'diagram') return;
      identifier(block.id, `${b}.id`);
      if (graphIds.has(block.id)) fail(`${b}.id`, `duplicate diagram id ${block.id}`);
      graphIds.add(block.id);
      if (block.direction !== undefined) choice(block.direction, `${b}.direction`, ['LR', 'TB']);
      checkGraph(block, b);
      if (block.baseline !== undefined) {
        const p = `${b}.baseline`;
        object(block.baseline, p, ['revision', 'scope', 'direction', 'nodes', 'edges', 'refs']);
        if (block.baseline.revision !== (doc.review.diffBase ?? doc.review.base)) fail(`${p}.revision`, 'baseline must match the reviewed diff base');
        string(block.baseline.scope, `${p}.scope`); refs(block.baseline.refs, `${p}.refs`);
        checkGraph(block.baseline, p);
        const baseRefs = [...(block.baseline.refs ?? []), ...block.baseline.nodes.flatMap(node => node.refs ?? []), ...block.baseline.edges.flatMap(edge => edge.refs ?? [])];
        const repoPath = new URL(doc.review.url).pathname.split('/').slice(1, 3).join('/').toLowerCase();
        for (const id of baseRefs) {
          const source = new URL(doc.sources.find(source => source.id === id).url);
          const parts = source.pathname.split('/');
          if (source.hostname === 'github.com' && parts.slice(1, 3).join('/').toLowerCase() === repoPath && ['blob', 'raw'].includes(parts[3]) && parts[4] !== block.baseline.revision) fail(`${p}.refs`, 'baseline code links must use the baseline revision');
        }
      }
    });
  });
  unique(doc.sections, '$.sections');
  if (doc.sections.some(section => section.group) && doc.sections.some(section => !section.group)) fail('$.sections', 'set group on every section or leave all groups unset');
  const blocks = doc.sections.flatMap(section => section.blocks);
  const inventories = blocks.filter(block => block.type === 'inventory');
  if (inventories.length > 1) fail('$', 'use one inventory per review');
  const graphs = new Map(blocks.filter(block => block.type === 'diagram').map(graph => [graph.id, graph]));
  inventories.forEach(block => validateInventory(block, doc.review, graphs, 'inventory'));
  return doc;
}

// Labels must not become Mermaid syntax.
const label = text => [...text].map(c => /[a-zA-Z0-9 ]/.test(c) ? c : `#${c.codePointAt(0)};`).join('');

export function toMermaid(graph) {
  const ids = new Map(graph.nodes.map((node, i) => [node.id, `n${i}`]));
  const lines = [`flowchart ${graph.direction ?? 'LR'}`];
  graph.nodes.forEach(node => {
    const text = `"${label(`${node.kind}: ${changeLabel(node)}`)}"`;
    const shape = ['function', 'method', 'macro'].includes(node.kind) ? `(${text})` : node.kind === 'value' ? `{{${text}}}` : `[${text}]`;
    lines.push(`  ${ids.get(node.id)}${shape}${node.change && node.change !== 'unchanged' ? `:::${node.change}` : ''}`);
  });
  graph.edges.forEach(edge => {
    const arrow = edge.status === 'possible' ? '-.->' : '-->';
    lines.push(`  ${ids.get(edge.from)} ${arrow}|"${label(edgeChangeLabel(edge))}"| ${ids.get(edge.to)}`);
  });
  if (graph.nodes.some(node => node.change)) lines.push('classDef added fill:#e5f2e7,stroke:#286a3a', 'classDef changed fill:#fff4d8,stroke:#8c6200', 'classDef removed fill:#f9e8e6,stroke:#9c3e35');
  graph.edges.forEach((edge, i) => { if (edge.change && edge.change !== 'unchanged') lines.push(`linkStyle ${i} stroke:${({ added: '#286a3a', changed: '#8c6200', removed: '#9c3e35' })[edge.change]},stroke-width:2px`); });
  return lines.join('\n');
}
