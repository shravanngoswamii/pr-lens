import { test, expect } from '@playwright/test';
import { mkdtemp, writeFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { pathToFileURL } from 'node:url';
import { render } from '../../src/render.js';
import { document } from '../fixture.js';

test('shows the decision and hold reasons before the explanation offline at both widths', async ({ page, context }) => {
  const dir = await mkdtemp(join(tmpdir(), 'reviary-conclusion-'));
  await context.setOffline(true);
  try {
    for (const decision of ['approve', 'hold']) {
      const doc = document();
      doc.sections.unshift({ id: 'intro', title: 'Overview', blocks: [{ type: 'text', text: 'The explanation follows the decision.' }] });
      doc.conclusion = { decision, summary: decision === 'hold' ? 'Check replay before merging.' : 'No blocker in the reviewed scope.', reasons: decision === 'hold' ? [{ text: 'Verify a second input.', refs: ['code'], code: 'f(2) # <script>unsafe()</script>', language: 'julia' }] : [] };
      const path = join(dir, `${decision}.html`);
      await writeFile(path, await render(doc));
      for (const width of [1440, 390]) {
        await page.setViewportSize({ width, height: 900 });
        await page.goto(pathToFileURL(path).href);
        await page.waitForFunction(() => document.documentElement.dataset.ready === 'true');
        const conclusion = page.locator('.review-conclusion');
        await expect(conclusion).toBeVisible();
        await expect(conclusion).toContainText(`Recommendation: ${decision === 'hold' ? 'Hold' : 'Approve'}`);
        if (decision === 'hold') {
          await expect(conclusion.locator('code.language-julia')).toHaveText('f(2) # <script>unsafe()</script>');
          await expect(conclusion.locator('script')).toHaveCount(0);
        }
        expect(await conclusion.evaluate(node => node.getBoundingClientRect().top)).toBeLessThan(250);
        expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
      }
    }
    const legacy = document(); delete legacy.conclusion;
    const path = join(dir, 'legacy.html'); await writeFile(path, await render(legacy));
    await page.goto(pathToFileURL(path).href);
    await expect(page.locator('.review-conclusion')).toContainText('Not assessed');
  } finally { await rm(dir, { recursive: true, force: true }); }
});
