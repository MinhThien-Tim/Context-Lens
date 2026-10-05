import { defineConfig, devices } from '@playwright/test';

const HOST = '127.0.0.1';

type ServerMode = 'baseline' | 'production' | 'dev';

const mode: ServerMode = process.env.QA_BASELINE
  ? 'baseline'
  : process.env.QA_PRODUCTION
    ? 'production'
    : 'dev';

if (process.env.QA_BASELINE && process.env.QA_PRODUCTION) {
  throw new Error('QA_BASELINE and QA_PRODUCTION are mutually exclusive');
}

const PORT = mode === 'baseline' ? 5174 : 5173;

const SERVER_COMMANDS: Record<ServerMode, string> = {
  baseline: `node node_modules/vite/bin/vite.js tmp/pdf-baseline --host ${HOST} --port ${PORT} --strictPort`,
  production: `npm run preview -- --host ${HOST} --port ${PORT} --strictPort`,
  dev: `npm run dev -- --host ${HOST} --port ${PORT} --strictPort`,
};

const customBaseUrl = process.env.QA_BASE_URL;
const baseURL = customBaseUrl ?? `http://${HOST}:${PORT}`;

export default defineConfig({
  testDir: './e2e',
  testIgnore: 'vocabulary-handoff.spec.ts',

  // Baseline timeout. Tier config may override this.
  timeout: 120_000,

  // Never rerun a failing test automatically.
  retries: 0,

  // Allow multiple test files to progress independently.
  // A timed-out test only blocks its own worker.
  workers: 4,

  webServer: {
    command: SERVER_COMMANDS[mode],
    url: baseURL,
    reuseExistingServer: process.env.PW_REUSE_SERVER !== '0',
    timeout: 120_000,
  },

  use: {
    baseURL,
    channel: 'chrome',
    screenshot: 'only-on-failure',
    trace: 'retain-on-failure',
  },

  projects: [
    {
      name: 'laptop',
      use: {
        viewport: {
          width: 1366,
          height: 900,
        },
      },
    },

    {
      name: 'mobile-chromium',
      use: {
        ...devices['Pixel 7'],
        defaultBrowserType: 'chromium',
      },
    },
  ],

  reporter: [
    ['list'],
    [
      'json',
      {
        outputFile: 'tmp/pdf-browser-results.json',
      },
    ],
  ],
});