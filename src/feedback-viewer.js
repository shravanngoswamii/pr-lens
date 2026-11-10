import { validateFeedback, mergeFeedback, targets, targetKey, describeTarget, buildPrompt } from './feedback.js';

export function initFeedback(doc) {
  const panel = document.querySelector('#feedback-panel');
  const toggle = document.querySelector('#comments-toggle');
  toggle.setAttribute('aria-expanded', 'false');
  const choices = targets(doc);
  const storageKey = `review-docs:${doc.review.url}:${doc.id}:${doc.review.head}`;
  let feedback = validateFeedback(JSON.parse(document.querySelector('#feedback-data').textContent), doc);
  let storageNotice = 'Local comments. Save HTML to keep or share.';
  try {
    const cached = localStorage.getItem(storageKey);
    if (cached) feedback = mergeFeedback(feedback, JSON.parse(cached), doc).feedback;
  } catch { storageNotice = 'Storage unavailable. Save HTML to keep comments.'; }
  const selected = new Set(feedback.comments.filter(comment => comment.status === 'open').map(comment => comment.id));
  let editingId = null;
  let undo = null;
  let scrollPosition = 0;
  let returnFocus = toggle;
  panel.innerHTML = `<div class="feedback-heading"><h2 id="feedback-title">Comments</h2><button type="button" id="close-comments">Back to review</button></div>
    <p class="feedback-help" id="storage-notice"></p>
    <form id="comment-form"><label for="comment-target">About</label><select id="comment-target"></select>
    <div class="form-row"><div><label for="comment-kind">Kind</label><select id="comment-kind"><option value="question">Question</option><option value="suggestion">Suggestion</option><option value="issue">Issue</option></select></div>
    <div><label for="comment-author">Your name (optional)</label><input id="comment-author" maxlength="80" autocomplete="name"></div></div>
    <label for="comment-text">Comment</label><textarea id="comment-text" rows="4" maxlength="10000" required></textarea>
    <div class="form-actions"><button type="submit" class="primary" id="save-comment">Add comment</button><button type="button" id="cancel-edit" hidden>Cancel edit</button></div></form>
    <p id="feedback-status" class="feedback-help" role="status"></p><button type="button" id="undo-delete" hidden>Undo removal</button>
    <div id="comment-list"></div>
    <div class="prompt-area"><h3>Agent prompt</h3><p class="feedback-help" id="selection-count"></p>
    <label for="prompt-purpose">Ask the agent to</label><select id="prompt-purpose"><option value="review">Revise document</option><option value="code">Investigate code</option></select>
    <div class="form-actions"><button type="button" class="primary" id="copy-prompt">Copy agent prompt</button></div>
    <details id="prompt-preview"><summary>Preview prompt</summary><label class="sr-only" for="prompt-text">Agent prompt</label><textarea id="prompt-text" readonly rows="9"></textarea></details></div>`;
  const get = id => panel.querySelector(`#${id}`);
  const make = (tag, text, parent, className) => {
    const node = document.createElement(tag);
    if (text) node.textContent = text;
    if (className) node.className = className;
    parent.append(node);
    return node;
  };
  get('storage-notice').textContent = storageNotice;
  for (const choice of choices) get('comment-target').add(new Option(choice.label, targetKey(choice.target)));
  const say = text => { get('feedback-status').textContent = text; };
  const narrow = () => matchMedia('(max-width: 1200px)').matches;
  function openPanel() {
    if (!panel.hidden) return;
    returnFocus = document.activeElement;
    scrollPosition = scrollY;
    panel.hidden = false;
    document.body.classList.add('feedback-open');
    toggle.setAttribute('aria-expanded', 'true');
    if (narrow()) { document.querySelector('.skip').href = '#comment-form'; document.querySelector('.skip').textContent = 'Skip to comments'; }
    if (narrow()) scrollTo(0, 0);
    get('comment-target').focus();
  }
  function closePanel() {
    panel.hidden = true;
    document.body.classList.remove('feedback-open');
    toggle.setAttribute('aria-expanded', 'false');
    document.querySelector('.skip').href = '#content';
    document.querySelector('.skip').textContent = 'Skip to review';
    returnFocus?.focus({ preventScroll: true });
    if (narrow()) scrollTo(0, scrollPosition);
  }
  toggle.addEventListener('click', () => panel.hidden ? openPanel() : closePanel());
  get('close-comments').addEventListener('click', closePanel);
  document.addEventListener('review:navigate', () => { if (!panel.hidden) closePanel(); });
  panel.addEventListener('keydown', event => { if (event.key === 'Escape') closePanel(); });
  document.addEventListener('click', event => {
    const button = event.target.closest('[data-comment-target]');
    if (!button) return;
    openPanel();
    get('comment-target').value = targetKey(JSON.parse(button.dataset.commentTarget));
    get('comment-text').focus();
  });

  function persist() {
    try { localStorage.setItem(storageKey, JSON.stringify(feedback)); }
    catch { get('storage-notice').textContent = 'Storage unavailable. Save HTML to keep comments.'; }
  }
  function updatePrompt() {
    const count = selected.size;
    get('selection-count').textContent = `${count} selected`;
    get('copy-prompt').disabled = count === 0;
    get('prompt-text').value = count ? buildPrompt(doc, feedback, { ids: [...selected], purpose: get('prompt-purpose').value }) : '';
  }
  function resetForm() {
    editingId = null;
    get('comment-text').value = '';
    get('save-comment').textContent = 'Add comment';
    get('cancel-edit').hidden = true;
  }
  get('cancel-edit').addEventListener('click', resetForm);
  function changed(message) { persist(); renderComments(); say(message); }
  function renderComments() {
    const list = get('comment-list');
    list.replaceChildren();
    toggle.setAttribute('aria-label', `Comments (${feedback.comments.length})`);
    toggle.innerHTML = '<svg width=18 height=18 viewBox="0 0 24 24" aria-hidden="true"><path d="M5 4h14v12H9l-4 4z" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linejoin="round"/></svg><span class="action-label">Comments</span>';
    const count = make('span', String(feedback.comments.length), toggle, 'comment-count');
    count.hidden = !feedback.comments.length;
    if (!feedback.comments.length) make('p', 'No comments yet.', list, 'feedback-help');
    for (const comment of feedback.comments) {
      const row = make('article', '', list, 'comment');
      row.dataset.commentId = comment.id;
      const label = make('label', '', row, 'comment-select');
      const check = make('input', '', label);
      check.type = 'checkbox';
      check.checked = selected.has(comment.id);
      check.setAttribute('aria-label', `Include comment in agent prompt: ${comment.text.slice(0, 80)}`);
      check.addEventListener('change', () => { check.checked ? selected.add(comment.id) : selected.delete(comment.id); updatePrompt(); });
      make('span', `${comment.kind}${comment.author ? ` by ${comment.author}` : ''} · ${comment.status}`, label);
      const target = describeTarget(doc, comment.target);
      make('p', target.label, row, 'comment-location');
      if (target.missing) make('p', 'Location removed. Check its original context.', row, 'feedback-help');
      if (comment.base !== doc.review.base || comment.head !== doc.review.head) make('p', `Different revisions: base ${comment.base.slice(0, 7)}, head ${comment.head.slice(0, 7)}.`, row, 'feedback-help');
      make('p', comment.text, row, 'comment-body');
      const actions = make('div', '', row, 'comment-actions');
      const edit = make('button', 'Edit', actions);
      edit.type = 'button';
      edit.addEventListener('click', () => {
        editingId = comment.id;
        const key = targetKey(comment.target);
        if (![...get('comment-target').options].some(option => option.value === key)) get('comment-target').add(new Option(target.label, key));
        get('comment-target').value = key;
        get('comment-kind').value = comment.kind;
        get('comment-author').value = comment.author;
        get('comment-text').value = comment.text;
        get('save-comment').textContent = 'Save changes';
        get('cancel-edit').hidden = false;
        get('comment-text').focus();
      });
      const resolve = make('button', comment.status === 'open' ? 'Resolve' : 'Reopen', actions);
      resolve.type = 'button';
      resolve.addEventListener('click', () => {
        comment.status = comment.status === 'open' ? 'resolved' : 'open';
        comment.updatedAt = new Date().toISOString();
        comment.status === 'open' ? selected.add(comment.id) : selected.delete(comment.id);
        changed(comment.status === 'open' ? 'Comment reopened.' : 'Comment resolved.');
      });
      const remove = make('button', 'Remove', actions);
      remove.type = 'button';
      remove.addEventListener('click', () => {
        undo = { comment, index: feedback.comments.indexOf(comment) };
        feedback.comments = feedback.comments.filter(item => item.id !== comment.id);
        selected.delete(comment.id);
        if (editingId === comment.id) resetForm();
        get('undo-delete').hidden = false;
        changed('Comment removed.');
      });
    }
    updatePrompt();
  }
  get('undo-delete').addEventListener('click', () => {
    if (!undo) return;
    feedback.comments.splice(undo.index, 0, undo.comment);
    if (undo.comment.status === 'open') selected.add(undo.comment.id);
    undo = null;
    get('undo-delete').hidden = true;
    changed('Comment restored.');
  });
  get('comment-form').addEventListener('submit', event => {
    event.preventDefault();
    const text = get('comment-text').value.trim();
    if (!text) { get('comment-text').focus(); return; }
    const now = new Date().toISOString();
    const previous = feedback.comments.find(comment => comment.id === editingId);
    const [section, diagram, node] = JSON.parse(get('comment-target').value);
    const target = { ...(section ? { section } : {}), ...(diagram ? { diagram } : {}), ...(node ? { node } : {}) };
    const comment = { id: previous?.id ?? `comment-${crypto.randomUUID()}`, target, kind: get('comment-kind').value, text,
      author: get('comment-author').value.trim(), status: previous?.status ?? 'open', base: previous?.base ?? doc.review.base,
      head: previous?.head ?? doc.review.head, createdAt: previous?.createdAt ?? now, updatedAt: now };
    if (previous) feedback.comments[feedback.comments.indexOf(previous)] = comment;
    else { feedback.comments.push(comment); selected.add(comment.id); }
    validateFeedback(feedback, doc);
    const edited = Boolean(previous);
    resetForm();
    changed(edited ? 'Comment updated.' : 'Comment added.');
  });
  get('prompt-purpose').addEventListener('change', updatePrompt);
  get('copy-prompt').addEventListener('click', async () => {
    try { await navigator.clipboard.writeText(get('prompt-text').value); say('Prompt copied.'); }
    catch {
      get('prompt-preview').open = true;
      get('prompt-text').focus();
      get('prompt-text').select();
      say('Clipboard unavailable. Copy the selected text.');
    }
  });

  const download = (text, name, type) => {
    const url = URL.createObjectURL(new Blob([text], { type }));
    const link = document.createElement('a');
    link.href = url;
    link.download = name;
    document.body.append(link);
    link.click();
    link.remove();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  };
  document.querySelector('#export-feedback').addEventListener('click', () => download(JSON.stringify(feedback, null, 2) + '\n', `${doc.id}-feedback.json`, 'application/json'));
  document.querySelector('#save-review').addEventListener('click', () => {
    const copy = document.documentElement.cloneNode(true);
    copy.querySelector('#feedback-data').textContent = JSON.stringify(feedback).replace(/</g, '\\u003c');
    copy.querySelector('#feedback-panel').replaceChildren();
    copy.querySelector('#feedback-panel').hidden = true;
    copy.querySelector('body').classList.remove('feedback-open');
    copy.removeAttribute('data-ready');
    copy.querySelectorAll('figure[data-ready]').forEach(figure => { delete figure.dataset.ready; });
    copy.querySelectorAll('.viewport').forEach(viewport => viewport.replaceChildren());
    copy.querySelectorAll('details').forEach(details => { details.open = false; });
    download('<!doctype html>\n' + copy.outerHTML, `${doc.id}-review.html`, 'text/html');
  });
  const input = document.querySelector('#feedback-file');
  document.querySelector('#import-feedback').addEventListener('click', () => input.click());
  input.addEventListener('change', async () => {
    if (!input.files[0]) return;
    openPanel();
    try {
      const result = mergeFeedback(feedback, JSON.parse(await input.files[0].text()), doc);
      feedback = result.feedback;
      undo = null;
      get('undo-delete').hidden = true;
      for (const comment of feedback.comments) comment.status === 'open' ? selected.add(comment.id) : selected.delete(comment.id);
      changed(`Imported ${result.added} comments and updated ${result.updated}.`);
    } catch (error) { say(`Could not import feedback. ${error.message}`); }
    input.value = '';
  });
  document.querySelectorAll('[data-runtime]').forEach(node => { node.hidden = false; });
  renderComments();
}
