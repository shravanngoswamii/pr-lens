import { test, expect } from '@playwright/test';
import { mkdtemp, writeFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { pathToFileURL } from 'node:url';
import { render } from '../../src/render.js';
import { suggestedDiff } from '../../src/diff.js';
import { document, linkedWork } from '../fixture.js';

let dir;
let url;
const change = { type: 'diff', title: 'Explain the extension hook', text: 'A proposed documentation edit.', path: 'docs/guide.md', before: 'Old sentence.\n', after: 'Clear sentence.\n', scope: 'suggestion', verification: 'source-checked' };
const title = 'Store values on Model';
const description = '\nA shorter description.\r\n\r\nKeep the migration link.\nLiteral </script><img src=x onerror="window.pwned=1">';
test.beforeAll(async () => {
  dir = await mkdtemp(join(tmpdir(), 'review-docs-report-'));
  const doc = document();
  doc.review.agent = { name: 'Claude Code', requestedModel: 'sonnet', models: ['claude-reported-model'] };
  doc.sections.push({ id: 'suggestions', title: 'Review actions', blocks: [change,
    { type: 'proposal', title: 'Use a direct title', text: 'Name the design change.', kind: 'title', current: 'Long old title', suggested: title },
    { type: 'proposal', title: 'Shorten the description', text: 'Retain the important migration.', kind: 'description', current: 'Original body', suggested: description },
    { type: 'prompt', title: 'Check the public example', text: 'Resolve the open question.', instructions: 'Run the same public example on both revisions.' }, linkedWork()] });
  await writeFile(join(dir, 'report.html'), await render(doc));
  url = pathToFileURL(join(dir, 'report.html')).href;
});
test.afterAll(async () => rm(dir, { recursive: true, force: true }));

test('copies literal suggestions, an applicable patch and a task with source context offline', async ({ page, context }) => {
  await context.setOffline(true);
  await page.addInitScript(() => Object.defineProperty(navigator, 'clipboard', { value: { writeText: async text => { window.copied = text; } } }));
  await page.goto(url);
  await page.getByText('About this review', { exact: true }).click();
  await page.getByText('Revisions', { exact: true }).click();
  await expect(page.getByText('claude-reported-model', { exact: true })).toBeVisible();
  await page.locator('.sidebar a[data-view="section-suggestions"]').click();
  await page.getByRole('button', { name: 'Copy title', exact: true }).click();
  expect(await page.evaluate(() => window.copied)).toBe(title);
  await page.getByRole('button', { name: 'Copy description', exact: true }).click();
  expect(await page.evaluate(() => window.copied)).toBe(description);
  await page.getByRole('button', { name: 'Copy patch', exact: true }).click();
  expect(await page.evaluate(() => window.copied)).toBe(suggestedDiff(change).patch);
  await page.getByRole('button', { name: 'Copy agent prompt', exact: true }).click();
  const prompt = await page.evaluate(() => window.copied);
  expect(prompt).toContain(document().review.head);
  expect(prompt).toContain('Run the same public example on both revisions.');
  await expect(page.locator('.diff .removed .line-code')).toHaveText('Old sentence.');
  await expect(page.locator('.diff .added .line-code')).toHaveText('Clear sentence.');
  expect(await page.locator('img').count()).toBe(0);
  expect(await page.evaluate(() => window.pwned)).toBeUndefined();
});

test('provides selectable copy text when clipboard access fails', async ({ page }) => {
  await page.addInitScript(() => Object.defineProperty(navigator, 'clipboard', { value: { writeText: async () => { throw new Error('Unavailable'); } } }));
  await page.goto(url);
  await page.locator('.sidebar a[data-view="section-suggestions"]').click();
  await page.getByRole('button', { name: 'Copy description', exact: true }).click();
  await expect(page.getByLabel('Copy description text')).toBeFocused();
  expect(await page.evaluate(() => document.activeElement.value.slice(document.activeElement.selectionStart, document.activeElement.selectionEnd))).toBe(description.replace(/\r\n/g, '\n'));
});

test('follows hierarchy branches, stops cycles and anchors comments to shared items', async ({ page }) => {
  await page.goto(url);
  await page.locator('.sidebar a[data-view="section-suggestions"]').click();
  const tree = page.locator('.linked-tree');
  await expect(tree.locator('.linked-item')).toHaveCount(3);
  await tree.getByText('replaces: Earlier approach', { exact: true }).click();
  await tree.getByText('mentions: The change', { exact: true }).click();
  await expect(tree.getByText('Already on this path.', { exact: false })).toBeVisible();
  await tree.getByText('mentions: Follow-up', { exact: true }).last().click();
  await expect(tree.getByText('Depth limit.', { exact: true })).toBeVisible();
  await expect(tree.getByText('Linked 2 times', { exact: false })).toBeVisible();
  await page.getByLabel('Search linked work').fill('unread');
  await expect(tree.locator('.linked-item')).toHaveCount(1);
  await tree.getByText('Follow-up', { exact: true }).click();
  await tree.getByRole('button', { name: 'Comment on this item' }).click();
  await expect(page.locator('#comment-target')).toHaveValue(JSON.stringify(['suggestions', 'links', 'unknown']));
  await page.getByLabel('Comment', { exact: true }).fill('Explain this issue before acting on it.');
  await page.getByRole('button', { name: 'Add comment', exact: true }).click();
  await expect(page.getByLabel('Agent prompt', { exact: true })).toHaveValue(/https:\/\/github.com\/owner\/repo\/issues\/3/);
  await page.getByRole('button', { name: 'Back to review' }).click();
  await page.setViewportSize({ width: 320, height: 844 });
  await page.getByLabel('Search linked work').fill('');
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  expect((await page.locator('.diff .line-code').first().boundingBox()).width).toBeGreaterThan(180);
});
