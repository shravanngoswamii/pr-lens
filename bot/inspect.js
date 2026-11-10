import { chromium } from '@playwright/test';
import { pathToFileURL } from 'node:url';
import { chapters } from '../src/chapters.js';

export async function inspectHTML(file, doc) {
  const browser = await chromium.launch();
  try {
    const context = await browser.newContext({ offline: true });
    const page = await context.newPage();
    const errors = [];
    page.on('pageerror', error => errors.push(error.message));
    const views = [...chapters(doc).map(chapter => chapter.id), ...doc.sections.flatMap(section => section.blocks).filter(block => block.type === 'diagram').map(block => `graph-${block.id}`), 'sources'];
    for (const width of [1440, 390]) {
      await page.setViewportSize({ width, height: 1000 });
      for (const view of views) {
        await page.goto(pathToFileURL(file).href + '#' + view);
        await page.waitForFunction(() => document.documentElement.dataset.ready === 'true');
        if (await page.locator('[data-ready=error]').count() || errors.length) throw new Error('Report contains a browser or diagram error');
        if (!await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)) throw new Error(`Report overflows at ${width}px`);
      }
    }
  } finally { await browser.close(); }
}
