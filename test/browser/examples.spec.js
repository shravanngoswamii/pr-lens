import { test, expect } from '@playwright/test';
import { mkdtemp, readFile, writeFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { pathToFileURL } from 'node:url';
import { render } from '../../src/render.js';

test('renders both shipped reviews with offline node selection', async ({ page, context }) => {
  const dir = await mkdtemp(join(tmpdir(), 'reviary-examples-'));
  try {
    await context.setOffline(true);
    for (const name of ['dynamicppl-1529', 'abstractmcmc-222']) {
      const doc = JSON.parse(await readFile(new URL(`../../examples/${name}.json`, import.meta.url), 'utf8'));
      await writeFile(join(dir, `${name}.html`), await render(doc));
      await page.goto(pathToFileURL(join(dir, `${name}.html`)).href);
      await page.waitForFunction(() => document.documentElement.dataset.ready === 'true');
      for (const figure of await page.locator('figure').all()) {
        const id = await figure.getAttribute('id');
        await page.goto(pathToFileURL(join(dir, `${name}.html`)).href + '#' + id);
        await expect(figure).toHaveAttribute('data-ready', 'true');
        const select = figure.locator('select');
        for (let i = 0; i < await select.locator('option').count(); i++) {
          await select.selectOption(String(i));
          expect((await figure.locator('.selection').innerText()).trim()).not.toBe('');
        }
      }
      await page.setViewportSize({ width: 768, height: 1024 });
      await page.goto(pathToFileURL(join(dir, `${name}.html`)).href + '#graph-' + doc.sections.flatMap(section => section.blocks).find(block => block.type === 'diagram').id);
      await page.waitForFunction(() => document.documentElement.dataset.ready === 'true');
      await expect.poll(() => page.locator('figure:visible .viewport svg').evaluate(svg => {
        const label = svg.querySelector('.nodeLabel') ?? svg.querySelector('.node');
        return parseFloat(getComputedStyle(label).fontSize) * svg.getScreenCTM().a;
      })).toBeGreaterThanOrEqual(12);
      await page.setViewportSize({ width: 1440, height: 1000 });
    }
  } finally { await rm(dir, { recursive: true, force: true }); }
});
