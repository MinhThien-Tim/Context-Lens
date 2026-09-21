import { defineConfig, devices } from '@playwright/test';
export default defineConfig({
  testDir: './e2e', timeout: 120_000, workers: 1,
  webServer: { command: process.env.QA_BASELINE ? 'node node_modules/vite/bin/vite.js tmp/pdf-baseline --host 127.0.0.1 --port 5174' : process.env.QA_PRODUCTION ? 'npm run preview -- --host 127.0.0.1 --port 5173' : 'npm run dev -- --host 127.0.0.1', url: process.env.QA_BASE_URL ?? 'http://127.0.0.1:5173', reuseExistingServer: true },
  use: { baseURL: process.env.QA_BASE_URL ?? 'http://127.0.0.1:5173', channel: 'chrome', screenshot: 'only-on-failure', trace: 'retain-on-failure' },
  projects: [
    { name: 'laptop', use: { viewport: { width: 1366, height: 900 } } },
    { name: 'mobile-chromium', use: { ...devices['Pixel 7'], defaultBrowserType: 'chromium' } },
  ],
  reporter: [['list'], ['json', { outputFile: 'tmp/pdf-browser-results.json' }]],
});
