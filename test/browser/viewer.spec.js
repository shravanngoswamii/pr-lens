import { test, expect } from '@playwright/test';
import { mkdtemp, writeFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { pathToFileURL } from 'node:url';
import { render } from '../../src/render.js';
import { document } from '../fixture.js';

let dir;
let url;
test.beforeAll(async () => {
  dir = await mkdtemp(join(tmpdir(), 'review-docs-'));
  const doc = document();
  doc.sections[0].blocks.push(
    { type: 'compare', title: 'A comparison', before: 'Old behavior.', after: 'New behavior.' },
    { type: 'code', title: 'A public call', code: 'f(1)', language: 'julia' },
    { type: 'finding', status: 'suggestion', title: 'Explain this choice', text: 'Keep it small.' },
    { type: 'check', status: 'unverified', title: 'Other inputs', text: 'Only Int was inspected.' },
    { type: 'details', title: 'Supporting evidence', text: 'One selected signature.', refs: ['code'] },
    { type: 'table', title: 'Design choices', columns: ['Choice', 'Benefit', 'Cost'], rows: [['Shared storage', 'One representation for values.', 'Callers must retain its shape.']] },
  );
  await writeFile(join(dir, 'review.html'), await render(doc));
  url = pathToFileURL(join(dir, 'review.html')).href;
});
test.afterAll(async () => rm(dir, { recursive: true, force: true }));

test('opens offline, selects nodes, pans, zooms, fits and exports its editable source', async ({ page, context }) => {
  const errors = [];
  page.on('pageerror', e => errors.push(e.message));
  const requests = [];
  page.on('request', r => { if (/^https?:/.test(r.url())) requests.push(r.url()); });
  await context.setOffline(true);
  await page.goto(url);
  await expect(page.locator('figure')).toHaveAttribute('data-ready', 'true');
  const svg = page.locator('.viewport svg');
  const initial = await svg.getAttribute('viewBox');
  await page.getByRole('button', { name: 'Zoom in', exact: true }).click();
  await expect(page.locator('output')).toHaveText('125%');
  const viewport = page.locator('.viewport');
  await viewport.focus();
  await page.keyboard.press('ArrowRight');
  expect(await svg.getAttribute('viewBox')).not.toEqual(initial);
  await page.getByRole('button', { name: 'Fit to view', exact: true }).click();
  await expect(svg).toHaveAttribute('viewBox', initial);
  const box = await viewport.boundingBox();
  await page.mouse.move(box.x + 20, box.y + 20);
  await page.mouse.down();
  await page.mouse.move(box.x + 80, box.y + 60, { steps: 4 });
  await page.mouse.up();
  expect(await svg.getAttribute('viewBox')).not.toEqual(initial);
  await page.getByRole('button', { name: 'Fit to view', exact: true }).click();
  await page.getByRole('button', { name: 'type: Int', exact: true }).focus();
  await page.keyboard.press('Enter');
  await expect(page.locator('.selection h4').first()).toHaveText('Int');
  await page.getByRole('button', { name: 'method: f', exact: true }).click();
  await expect(page.locator('.selection code')).toHaveText('f(x::Int)');
  await expect(page.locator('.selection a').first()).toHaveAttribute('href', document().sources[0].url);
  const downloadPromise = page.waitForEvent('download');
  await page.locator('.save-menu > summary').click();
  await page.getByRole('button', { name: 'Save editable JSON' }).click();
  const download = await downloadPromise;
  const stream = await download.createReadStream();
  const parts = [];
  for await (const chunk of stream) parts.push(chunk);
  const saved = JSON.parse(Buffer.concat(parts).toString());
  expect(saved.sections[0].blocks[0]).toEqual(document().sections[0].blocks[0]);
  expect(requests).toEqual([]);
  expect(errors).toEqual([]);
});

test('keeps all content readable at a narrow width', async ({ page }) => {
  await page.setViewportSize({ width: 320, height: 844 });
  await page.goto(url);
  await expect(page.locator('figure')).toHaveAttribute('data-ready', 'true');
  await page.getByText('Supporting evidence', { exact: true }).click();
  await expect(page.getByText('One selected signature.', { exact: true })).toBeVisible();
  const table = page.getByRole('table');
  const header = await table.locator('tbody th').boundingBox();
  const cell = await table.locator('td').first().boundingBox();
  expect(cell.width).toBeGreaterThan(230);
  expect(cell.x).toEqual(header.x);
  expect(cell.y).toBeGreaterThan(header.y);
  await expect(table.getByRole('columnheader')).toHaveCount(3);
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
});

test('treats hostile prose, code and graph labels as text', async ({ page }) => {
  const doc = document();
  const hostile = '</script><img src=x onerror="window.pwned=1"> %%{init: {}}%%';
  doc.title = hostile;
  doc.sections[0].blocks[0].nodes[0].label = hostile;
  doc.sections[0].blocks[0].nodes[1].label = 'Literal &#58; & [x]';
  doc.sections[0].blocks[0].edges[0].label = 'calls: f(x[1]) & &#58;';
  doc.sections[0].blocks.push({ type: 'code', title: 'Literal text', code: hostile });
  doc.sections[0].blocks.push({ type: 'table', title: 'Literal cells', columns: ['Input', hostile], rows: [[hostile, 'Safe text']] });
  await writeFile(join(dir, 'hostile.html'), await render(doc));
  await page.goto(pathToFileURL(join(dir, 'hostile.html')).href);
  await expect(page.locator('figure')).toHaveAttribute('data-ready', 'true');
  await expect(page.locator('h1')).toHaveText(hostile);
  expect(await page.locator('img').count()).toBe(0);
  await expect(page.locator('.review-table tbody th')).toHaveText(hostile);
  await expect(page.locator('.edgeLabel text')).toHaveText('calls: f(x[1]) & &#58;');
  await expect(page.getByRole('button', { name: 'type: Literal &#58; & [x]', exact: true })).toBeVisible();
  expect(await page.evaluate(() => window.pwned)).toBeUndefined();
});

test('preserves labels on cycles and parallel edges', async ({ page }) => {
  const doc = document();
  const graph = doc.sections[0].blocks[0];
  for (const [id, from, to, label, status] of [
    ['uses', 'f', 't', 'uses: type', 'possible'],
    ['back', 't', 'f', 'selects overload', 'source'],
    ['stores', 'f', 't', 'stores result', 'observed'],
  ]) graph.edges.push({ id, from, to, label, status, text: 'Synthetic fixture relationship.' });
  await writeFile(join(dir, 'cycles.html'), await render(doc));
  await page.goto(pathToFileURL(join(dir, 'cycles.html')).href);
  await expect(page.locator('figure')).toHaveAttribute('data-ready', 'true');
  await expect(page.locator('.edgeLabel text')).toHaveText(graph.edges.map(edge => edge.label));
});
