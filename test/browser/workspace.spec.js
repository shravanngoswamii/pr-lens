import { test, expect } from '@playwright/test';
import { mkdtemp, writeFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { pathToFileURL } from 'node:url';
import { render } from '../../src/render.js';
import { document } from '../fixture.js';

let dir, url, plain;
test.beforeAll(async () => {
  dir = await mkdtemp(join(tmpdir(), 'review-docs-workspace-'));
  const doc = document();
  const second = structuredClone(doc.sections[0].blocks[0]);
  second.id = 'second'; second.title = 'Another call path';
  doc.sections[0].blocks.push(second);
  doc.sections.unshift({ id: 'overview', title: 'Overview', blocks: [{ type: 'text', text: 'Start with the diagram.' }] });
  await writeFile(join(dir, 'review.html'), await render(doc));
  url = pathToFileURL(join(dir, 'review.html')).href;
  doc.sections = [doc.sections[0]];
  await writeFile(join(dir, 'plain.html'), await render(doc));
  plain = pathToFileURL(join(dir, 'plain.html')).href;
});
test.afterAll(async () => rm(dir, { recursive: true, force: true }));

test('opens on a diagram and preserves zoom and selection through views and browser history', async ({ page }) => {
  await page.context().setOffline(true);
  await page.goto(url);
  await expect(page.locator('#graph-calls')).toHaveAttribute('data-ready', 'true');
  await expect(page.locator('#section-overview')).toBeHidden();
  await page.getByRole('button', { name: 'Zoom in', exact: true }).first().click();
  await page.locator('#graph-calls select').selectOption('1');
  await page.locator('.diagram-tabs a[data-view="graph-second"]').click();
  await expect(page.locator('#graph-second')).toHaveAttribute('data-ready', 'true');
  await expect(page.locator('#graph-calls')).toBeHidden();
  await page.getByRole('navigation', { name: 'Views', exact: true }).getByRole('link', { name: 'Overview', exact: true }).click();
  await expect(page.getByText('Start with the diagram.', { exact: true })).toBeVisible();
  await page.goBack();
  await expect(page.locator('#graph-second')).toBeVisible();
  await page.locator('.diagram-tabs a[data-view="graph-calls"]').click();
  await expect(page.locator('#graph-calls output')).toHaveText('125%');
  await expect(page.locator('#graph-calls select')).toHaveValue('1');
  await page.goto(url + '#graph-second');
  await expect(page.locator('#graph-second')).toHaveAttribute('data-ready', 'true');
  await expect(page.locator('#graph-calls')).toBeHidden();
  await page.locator('.save-menu > summary').click();
  const pending = page.waitForEvent('download');
  await page.getByRole('button', { name: 'HTML with comments', exact: true }).click();
  const parts = [];
  for await (const chunk of await (await pending).createReadStream()) parts.push(chunk);
  const saved = join(dir, 'saved.html');
  await writeFile(saved, Buffer.concat(parts));
  const reader = await page.context().newPage();
  await reader.goto(pathToFileURL(saved).href);
  await expect(reader.locator('#graph-second')).toHaveAttribute('data-ready', 'true');
  await expect(reader.locator('#graph-calls')).toBeHidden();
  await reader.close();
});

test('phone navigation closes with escape and opens the selected view without page overflow', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto(url);
  await expect(page.locator('#graph-calls')).toHaveAttribute('data-ready', 'true');
  await expect(page.locator('.sidebar')).toBeHidden();
  await page.getByRole('button', { name: 'Views', exact: true }).click();
  await expect(page.locator('.sidebar')).toBeVisible();
  expect(await page.locator('.workspace').evaluate(node => node.inert)).toBe(true);
  await page.keyboard.press('Escape');
  await expect(page.getByRole('button', { name: 'Views', exact: true })).toBeFocused();
  await page.getByRole('button', { name: 'Views', exact: true }).click();
  await page.getByRole('navigation', { name: 'Views', exact: true }).getByRole('link', { name: 'Overview', exact: true }).click();
  await expect(page.locator('.sidebar')).toBeHidden();
  await expect(page.getByText('Start with the diagram.', { exact: true })).toBeVisible();
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
});

test('supports prose-only reviews and a readable fallback without JavaScript', async ({ page, browser }) => {
  await page.goto(plain);
  await page.waitForFunction(() => document.documentElement.dataset.ready === 'true');
  await expect(page.getByText('Start with the diagram.', { exact: true })).toBeVisible();
  const context = await browser.newContext({ javaScriptEnabled: false });
  const fallback = await context.newPage();
  await fallback.goto(url);
  await expect(fallback.getByText('Start with the diagram.', { exact: true })).toBeVisible();
  await fallback.getByText('Nodes and relationships', { exact: true }).first().click();
  await expect(fallback.getByText('Calls itself.', { exact: true }).first()).toBeVisible();
  await context.close();
});
