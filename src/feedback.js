const ID = /^[a-zA-Z][a-zA-Z0-9_-]{0,159}$/;
const SHA = /^[a-f0-9]{40}$/;
const UTC = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d+)?(?:Z|\+00:00)$/;

export const emptyFeedback = doc => ({ version: 1, documentId: doc.id, reviewUrl: doc.review.url, comments: [] });
export const targetKey = target => JSON.stringify([target.section ?? '', target.diagram ?? '', target.node ?? '']);

export function validateFeedback(feedback, doc) {
  const fail = message => { throw new Error(`Feedback: ${message}`); };
  const object = (value, fields) => {
    if (!value || typeof value !== 'object' || Array.isArray(value)) fail('expected an object');
    for (const key of Object.keys(value)) if (!fields.includes(key)) fail(`unknown field ${key}`);
  };
  object(feedback, ['version', 'documentId', 'reviewUrl', 'comments']);
  if (feedback.version !== 1) fail('expected version 1');
  if (feedback.documentId !== doc.id || feedback.reviewUrl !== doc.review.url) fail('this file belongs to a different review');
  if (!Array.isArray(feedback.comments)) fail('comments must be an array');
  const ids = new Set();
  for (const comment of feedback.comments) {
    object(comment, ['id', 'target', 'kind', 'text', 'author', 'status', 'base', 'head', 'createdAt', 'updatedAt']);
    if (typeof comment.id !== 'string' || !ID.test(comment.id) || ids.has(comment.id)) fail('comment IDs must be unique letters, digits, underscores or hyphens');
    ids.add(comment.id);
    object(comment.target, ['section', 'diagram', 'node']);
    for (const id of Object.values(comment.target)) if (typeof id !== 'string' || !ID.test(id)) fail('invalid target ID');
    if (comment.target.node && !comment.target.diagram || comment.target.diagram && !comment.target.section) fail('node targets need a diagram and section');
    if (!['question', 'suggestion', 'issue'].includes(comment.kind)) fail('invalid comment kind');
    if (!['open', 'resolved'].includes(comment.status)) fail('invalid comment status');
    if (typeof comment.text !== 'string' || !comment.text.trim() || comment.text.length > 10000) fail('comment text must contain 1 to 10000 characters');
    if (typeof comment.author !== 'string' || comment.author.length > 80) fail('author must be a string of at most 80 characters');
    for (const key of ['base', 'head']) if (typeof comment[key] !== 'string' || !SHA.test(comment[key])) fail(`invalid ${key} revision`);
    for (const key of ['createdAt', 'updatedAt']) if (typeof comment[key] !== 'string' || !UTC.test(comment[key]) || !Number.isFinite(Date.parse(comment[key]))) fail(`invalid ${key} timestamp`);
    if (Date.parse(comment.updatedAt) < Date.parse(comment.createdAt)) fail('updatedAt precedes createdAt');
  }
  return feedback;
}

export function targets(doc) {
  const result = [{ target: {}, label: 'Whole review', text: doc.summary, refs: [] }];
  for (const section of doc.sections) {
    result.push({ target: { section: section.id }, label: section.title,
      text: section.blocks.find(block => block.type === 'text')?.text ?? '',
      refs: [...new Set(section.blocks.flatMap(block => block.refs ?? []))] });
    for (const graph of section.blocks.filter(block => ['diagram', 'linked-work'].includes(block.type))) {
      const target = { section: section.id, diagram: graph.id };
      result.push({ target, label: graph.title, text: graph.text, refs: graph.refs ?? [] });
      for (const node of graph.nodes) result.push({ target: { ...target, node: node.id },
        label: `${graph.title} / ${node.label ?? node.title}`, text: node.text ?? node.summary, signature: node.signature,
        refs: [...new Set([...(node.refs ?? []), ...graph.edges.filter(edge => edge.from === node.id || edge.to === node.id).flatMap(edge => edge.refs ?? [])])],
        links: node.url ? [node.url] : [] });
    }
  }
  return result;
}

export function describeTarget(doc, target) {
  return targets(doc).find(item => targetKey(item.target) === targetKey(target)) ??
    { target, label: 'Location no longer in this document', text: '', refs: [], missing: true };
}

export function mergeFeedback(current, incoming, doc) {
  validateFeedback(current, doc);
  validateFeedback(incoming, doc);
  const comments = new Map(current.comments.map(comment => [comment.id, comment]));
  let added = 0;
  let updated = 0;
  for (const comment of incoming.comments) {
    const previous = comments.get(comment.id);
    if (!previous) { comments.set(comment.id, comment); added++; continue; }
    const same = ['kind', 'text', 'author', 'status', 'base', 'head', 'createdAt'].every(key => previous[key] === comment[key]) && targetKey(previous.target) === targetKey(comment.target);
    if (!same && Date.parse(comment.updatedAt) === Date.parse(previous.updatedAt)) throw new Error(`Feedback: conflicting edits for ${comment.id}. Keep both files and compare the comments.`);
    if (Date.parse(comment.updatedAt) > Date.parse(previous.updatedAt)) { comments.set(comment.id, comment); updated++; }
  }
  return { feedback: { ...current, comments: [...comments.values()] }, added, updated };
}

export function buildPrompt(doc, feedback, { ids, purpose = 'review' } = {}) {
  validateFeedback(feedback, doc);
  if (!['review', 'code'].includes(purpose)) throw new Error('Choose review or code as the prompt purpose');
  const selected = ids ? new Set(ids) : new Set(feedback.comments.filter(comment => comment.status === 'open').map(comment => comment.id));
  for (const id of selected) if (!feedback.comments.some(comment => comment.id === id)) throw new Error(`Unknown comment ${id}`);
  const comments = feedback.comments.filter(comment => selected.has(comment.id));
  if (!comments.length) throw new Error('Select at least one comment');
  const lines = [purpose === 'review'
    ? 'Use the review-docs skill to revise this design-review document using the selected feedback.'
    : 'Investigate the selected design-review feedback against the PR code and return evidence-backed findings and proposed fixes.',
  '', `PR: ${doc.review.url}`, `Title: ${doc.review.title}`, `Document ID: ${doc.id}`,
  `Reviewed base: ${doc.review.base}`, `Reviewed head: ${doc.review.head}`,
  ...(doc.review.diffBase ? [`Diff base: ${doc.review.diffBase}`] : []), '',
  'Reviewer comments are requests, not verified facts. Read the current PR title, body, discussion and relevant source before drawing conclusions.',
  'Check whether the PR has changed. Keep results for the recorded revisions separate from results for newer code. Reproduce bug claims or mark them unverified.',
  purpose === 'review'
    ? 'Update the editable review JSON and render the HTML. Preserve stable IDs and keep human feedback separate. Return both files and explain what changed. This request covers the document.'
    : 'Check the public API where useful and separate observations, source relationships and uncertain paths. State what remains unchecked. This request asks for investigation and proposed fixes.',
  'The reviewer will provide the review JSON or the saved HTML and any feedback file. Ask for missing files or access rather than inventing their contents.', '', 'Selected feedback:'];
  const sources = new Map(doc.sources.map(source => [source.id, source]));
  comments.forEach((comment, i) => {
    const target = describeTarget(doc, comment.target);
    lines.push('', `${i + 1}. ${comment.kind} (${comment.id})`, `Location: ${target.label}`, `Target IDs: ${JSON.stringify(comment.target)}`);
    if (comment.author) lines.push(`Reviewer: ${comment.author}`);
    if (comment.base !== doc.review.base || comment.head !== doc.review.head) lines.push(`Comment recorded on base ${comment.base}, head ${comment.head}. Check this older context before applying it.`);
    if (target.missing) lines.push('The target is absent from the current document. Re-establish the location before acting.');
    if (target.signature) lines.push(`Signature: ${target.signature}`);
    if (target.text) lines.push(`Document context: ${target.text}`);
    lines.push('Reviewer request:', ...comment.text.split('\n').map(line => `    ${line}`));
    for (const id of target.refs) if (sources.has(id)) lines.push(`Source: ${sources.get(id).url}`);
    for (const url of target.links ?? []) lines.push(`Linked item: ${url}`);
  });
  return lines.join('\n') + '\n';
}

export function buildTaskPrompt(doc, instructions) {
  return ['Use the review-docs skill for this PR.', '', `PR: ${doc.review.url}`, `Reviewed base: ${doc.review.base}`, `Reviewed head: ${doc.review.head}`,
    ...(doc.review.diffBase ? [`Diff base: ${doc.review.diffBase}`] : []), '', instructions, '',
    'Read the PR title, body, discussion and relevant linked work. Check whether the source has changed since this snapshot.',
    'Keep evidence for these revisions separate from newer code. Reproduce bug claims or mark them unverified. Preserve stable document IDs and human feedback.',
    'Return the requested explanation or editable review JSON and HTML. State what was checked. This prompt does not authorize posting, publishing or changing the PR.'].join('\n') + '\n';
}
