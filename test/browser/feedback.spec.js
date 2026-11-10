import { test, expect } from '@playwright/test';
import { mkdtemp, writeFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { pathToFileURL } from 'node:url';
import { render } from '../../src/render.js';
import { emptyFeedback } from '../../src/feedback.js';
import { document } from '../fixture.js';

let dir;
let url;
test.beforeAll(async () => {
  dir = await mkdtemp(join(tmpdir(), 'review-docs-feedback-'));
  await writeFile(join(dir, 'review.html'), await render(document()));
  url = pathToFileURL(join(dir, 'review.html')).href;
});
test.afterAll(async () => rm(dir, { recursive: true, force: true }));
const bytes = async download => {
  const chunks = [];
  for await (const chunk of await download.createReadStream()) chunks.push(chunk);
  return Buffer.concat(chunks);
};
async function save(page, label) {
  await page.locator('.save-menu > summary').click();
  const pending = page.waitForEvent('download');
  await page.getByRole('button', { name: label, exact: true }).click();
  await page.locator('.save-menu > summary').click();
  return bytes(await pending);
}

test('anchors comments, edits and resolves them, and copies selected requests with code context', async ({ page }) => {
  await page.addInitScript(() => Object.defineProperty(navigator, 'clipboard', { value: { writeText: async text => { window.copiedPrompt = text; } } }));
  await page.goto(url);
  await expect(page.locator('figure')).toHaveAttribute('data-ready', 'true');
  await page.getByRole('button', { name: 'Comment on this node' }).click();
  await expect(page.getByRole('button', { name: 'Copy agent prompt' })).toBeDisabled();
  expect(JSON.parse(await page.getByLabel('About', { exact: true }).inputValue())).toEqual(['design', 'calls', 'f']);
  await page.getByLabel('Your name (optional)').fill('Mentor');
  await page.getByLabel('Comment', { exact: true }).fill('Explain the Int overload.');
  await page.getByRole('button', { name: 'Add comment', exact: true }).click();
  await page.getByLabel('About', { exact: true }).selectOption({ label: 'Whole review' });
  await page.getByLabel('Kind', { exact: true }).selectOption('issue');
  await page.getByLabel('Comment', { exact: true }).fill('Separate issue.');
  await page.getByRole('button', { name: 'Add comment', exact: true }).click();
  const rows = page.locator('.comment');
  await rows.nth(1).getByRole('checkbox').uncheck();
  await page.getByRole('button', { name: 'Copy agent prompt' }).click();
  const prompt = await page.evaluate(() => window.copiedPrompt);
  expect(prompt).toContain('Explain the Int overload.');
  expect(prompt).toContain('f(x::Int)');
  expect(prompt).toContain(document().sources[0].url);
  expect(prompt).toContain(document().review.head);
  expect(prompt).not.toContain('Separate issue.');
  await page.getByLabel('Ask the agent to', { exact: true }).selectOption('code');
  await page.getByRole('button', { name: 'Copy agent prompt' }).click();
  expect(await page.evaluate(() => window.copiedPrompt)).toContain('proposed fixes');
  await rows.first().getByRole('button', { name: 'Edit', exact: true }).click();
  await page.getByLabel('Comment', { exact: true }).fill('Show the base and head overloads.');
  await page.getByRole('button', { name: 'Save changes' }).click();
  await expect(rows.first()).toContainText('Show the base and head overloads.');
  await rows.first().getByRole('button', { name: 'Resolve', exact: true }).click();
  await expect(page.getByRole('button', { name: 'Copy agent prompt' })).toBeDisabled();
  await rows.first().getByRole('button', { name: 'Reopen', exact: true }).click();
  await rows.nth(1).getByRole('button', { name: 'Remove', exact: true }).click();
  await expect(rows).toHaveCount(1);
  await page.getByRole('button', { name: 'Undo removal' }).click();
  await expect(rows).toHaveCount(2);
  await page.reload();
  await page.getByRole('button', { name: 'Comments (2)', exact: true }).click();
  await expect(page.locator('.comment').first()).toContainText('Show the base and head overloads.');
});

test('saves a portable offline HTML with inert comments when browser storage and clipboard are unavailable', async ({ page, browser }) => {
  await page.addInitScript(() => {
    Object.defineProperty(window, 'localStorage', { get() { throw new Error('Disabled'); } });
    Object.defineProperty(navigator, 'clipboard', { value: { writeText: async () => { throw new Error('Denied'); } } });
  });
  await page.goto(url);
  await page.getByRole('button', { name: 'Comment on Design', exact: true }).click();
  const text = '</script><img src=x onerror="window.pwned=1"> Keep this as text.';
  await page.getByLabel('Comment', { exact: true }).fill(text);
  await page.getByRole('button', { name: 'Add comment', exact: true }).click();
  await page.getByRole('button', { name: 'Copy agent prompt' }).click();
  await expect(page.getByText('Clipboard unavailable. Copy the selected text.')).toBeVisible();
  await expect(page.getByLabel('Agent prompt', { exact: true })).toBeFocused();
  await page.getByLabel('Comment', { exact: true }).fill('PRIVATE UNSAVED DRAFT');
  const html = await save(page, 'HTML with comments');
  expect(html.toString()).not.toContain('PRIVATE UNSAVED DRAFT');
  const feedback = JSON.parse((await save(page, 'Export feedback')).toString());
  expect(feedback.comments[0].text).toEqual(text);
  const path = join(dir, 'shared.html');
  await writeFile(path, html);
  const isolated = await browser.newContext({ offline: true });
  const reader = await isolated.newPage();
  await reader.addInitScript(() => Object.defineProperty(window, 'localStorage', { get() { throw new Error('Disabled'); } }));
  const requests = [];
  reader.on('request', request => { if (/^https?:/.test(request.url())) requests.push(request.url()); });
  await reader.goto(pathToFileURL(path).href);
  await expect(reader.locator('figure')).toHaveAttribute('data-ready', 'true');
  await reader.getByRole('button', { name: 'Comments (1)', exact: true }).click();
  await expect(reader.locator('.comment-body')).toHaveText(text);
  expect(await reader.locator('img').count()).toBe(0);
  expect(await reader.evaluate(() => window.pwned)).toBeUndefined();
  expect(requests).toEqual([]);
  await isolated.close();
});

test('imports reviewer files and preserves stale locations while rejecting unrelated reviews', async ({ page }) => {
  await page.goto(url);
  const doc = document();
  const incoming = { ...emptyFeedback(doc), comments: [{ id: 'external-note', target: { section: 'removed' }, kind: 'suggestion', author: 'Another reviewer',
    text: 'Check the previous explanation.', status: 'open', base: doc.review.base, head: 'c'.repeat(40), createdAt: '2026-11-10T00:00:00Z', updatedAt: '2026-11-10T00:00:00Z' }] };
  const upload = async feedback => {
    await page.locator('.save-menu > summary').click();
    const chooser = page.waitForEvent('filechooser');
    await page.getByRole('button', { name: 'Import feedback', exact: true }).click();
    await (await chooser).setFiles({ name: 'feedback.json', mimeType: 'application/json', buffer: Buffer.from(JSON.stringify(feedback)) });
    await page.locator('.save-menu > summary').click();
  };
  await upload(incoming);
  await expect(page.locator('.comment')).toContainText('Location no longer in this document');
  await expect(page.locator('.comment')).toContainText('base aaaaaaa, head ccccccc');
  await upload({ ...incoming, reviewUrl: 'https://github.com/other/repo/pull/1' });
  await expect(page.getByRole('status').filter({ hasText: 'Could not import feedback.' })).toContainText('different review');
  await expect(page.locator('.comment')).toHaveCount(1);
  await page.locator('.comment').getByRole('button', { name: 'Remove', exact: true }).click();
  await expect(page.getByRole('button', { name: 'Undo removal' })).toBeVisible();
  await upload(incoming);
  await expect(page.locator('.comment')).toHaveCount(1);
  await expect(page.getByRole('button', { name: 'Undo removal' })).not.toBeVisible();
});

test('comments replace the reading pane on a phone and return to the review', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto(url);
  await page.getByRole('button', { name: 'Comments (0)', exact: true }).click();
  await expect(page.locator('#content')).not.toBeVisible();
  await page.getByLabel('Comment', { exact: true }).fill('A phone comment.');
  await page.getByRole('button', { name: 'Add comment', exact: true }).click();
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  await page.getByRole('button', { name: 'Back to review', exact: true }).click();
  await expect(page.locator('h1')).toBeVisible();
  await expect(page.getByRole('button', { name: 'Comments (1)', exact: true })).toBeFocused();
});
