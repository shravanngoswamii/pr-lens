import { defineConfig } from '@playwright/test';

export default defineConfig({
  testDir: './test/browser',
  workers: 1,
  use: { browserName: 'chromium', viewport: { width: 1440, height: 1000 } },
});
