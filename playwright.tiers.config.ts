/**
 * Playwright execution tiers.
 *
 * Mỗi tier quyết định: test nào được chạy (grep), timeout, số worker,
 * globalTimeout, và file báo cáo riêng.
 *
 * TAG TEST
 *   Gắn tag trong tên test hoặc bằng option `tag` (Playwright >= 1.42):
 *
 *     test('render trang 1 @pdf', async ({ page }) => { ... });
 *     test('OCR trang scan', { tag: ['@pdf', '@heavy'] }, async ({ page }) => { ... });
 *
 *   Quy ước:
 *     (không tag)      -> tier `fast`
 *     @pdf             -> tier `pdf-normal`
 *     @heavy           -> tier `heavy`  (OCR / render nặng; nên kèm @pdf nếu là PDF)
 *
 * USAGE (PowerShell)
 *
 *   $env:PW_TIER='fast';       npx playwright test --config playwright.tiers.config.ts
 *   $env:PW_TIER='pdf-normal'; npx playwright test --config playwright.tiers.config.ts
 *   $env:PW_TIER='heavy';      npx playwright test --config playwright.tiers.config.ts
 *
 * CHẾ ĐỘ SERVER (chọn một)
 *   (mặc định)       dev server        cổng 5173
 *   QA_PRODUCTION=1  vite preview      cổng 5173  (cần `npm run build` trước)
 *   QA_BASELINE=1    vite tmp/pdf-baseline  cổng 5174
 *   QA_BASE_URL=...  ghi đè hoàn toàn URL (khi đó tự quản lý server)
 *
 * BIẾN TÙY CHỌN
 *   PW_TIMEOUT_MS=...      ghi đè timeout từng test của tier
 *   PW_WORKERS=...         ghi đè số worker của tier
 *   PW_FULLY_PARALLEL=1    chạy song song cả các test trong cùng một file
 *                          (chỉ bật khi các test trong file độc lập nhau)
 *   PW_REUSE_SERVER=0      luôn tự khởi động server mới, không dùng server có sẵn
 *
 * GHI CHÚ
 *   - Timeout là wall-clock; test OCR/PDF là CPU-bound nên khi chạy nhiều worker
 *     sẽ chậm hơn lúc chạy riêng. Tier `heavy` giữ 2 worker và 180s cho tới khi
 *     có số đo thực tế. Test nào cần thêm thời gian: dùng `test.slow()`.
 *   - Tier `heavy` nên chạy với QA_PRODUCTION=1 để tránh dao động do dev server
 *     biên dịch theo yêu cầu.
 *   - Không có retry: test fail là fail.
 */

import { defineConfig } from '@playwright/test';
import base from './playwright.config';

const env: Record<string, string | undefined> =
  (globalThis as unknown as {
    process?: { env?: Record<string, string | undefined> };
  }).process?.env ?? {};

// ---------------------------------------------------------------------------
// Tiers
// ---------------------------------------------------------------------------

const TIERS = {
  /** UI/browser test thường: mọi test KHÔNG gắn @pdf hoặc @heavy. */
  fast: {
    timeout: 30_000,
    actionTimeout: 10_000,
    workers: 4,
    globalTimeout: 20 * 60_000,
    grep: undefined as RegExp | undefined,
    grepInvert: /@pdf|@heavy/,
  },

  /** Test PDF thường: có @pdf, không có @heavy. */
  'pdf-normal': {
    timeout: 90_000,
    actionTimeout: 10_000,
    workers: 2,
    globalTimeout: 45 * 60_000,
    grep: /@pdf/,
    grepInvert: /@heavy/,
  },

  /** OCR / render nặng: có @heavy. */
  heavy: {
    timeout: 180_000,
    actionTimeout: 10_000,
    workers: 2,
    globalTimeout: 60 * 60_000,
    grep: /@heavy/,
    grepInvert: undefined as RegExp | undefined,
  },
} as const;

type TierName = keyof typeof TIERS;

const TIER = (env.PW_TIER ?? 'fast').toLowerCase();

if (!(TIER in TIERS)) {
  throw new Error(
    `unknown PW_TIER "${TIER}"; expected one of: ${Object.keys(TIERS).join(', ')}`
  );
}

const tier = TIERS[TIER as TierName];

function positiveInt(name: string): number | undefined {
  const raw = env[name];
  if (raw === undefined || raw === '') return undefined;
  const n = Number(raw);
  if (!Number.isInteger(n) || n <= 0) {
    throw new Error(`${name} must be a positive integer, got "${raw}"`);
  }
  return n;
}

// ---------------------------------------------------------------------------
// Server mode + port (nguồn sự thật duy nhất cho command, url và baseURL)
// ---------------------------------------------------------------------------

const HOST = '127.0.0.1';

type ServerMode = 'baseline' | 'production' | 'dev';

const mode: ServerMode = env.QA_BASELINE
  ? 'baseline'
  : env.QA_PRODUCTION
    ? 'production'
    : 'dev';

if (env.QA_BASELINE && env.QA_PRODUCTION) {
  throw new Error('QA_BASELINE and QA_PRODUCTION are mutually exclusive');
}

const PORT = mode === 'baseline' ? 5174 : 5173;

const SERVER_COMMANDS: Record<ServerMode, string> = {
  baseline: `node node_modules/vite/bin/vite.js tmp/pdf-baseline --host ${HOST} --port ${PORT} --strictPort`,
  production: `npm run preview -- --host ${HOST} --port ${PORT} --strictPort`,
  dev: `npm run dev -- --host ${HOST} --port ${PORT} --strictPort`,
};

const customBaseUrl = env.QA_BASE_URL;
const baseURL = customBaseUrl ?? `http://${HOST}:${PORT}`;

// Nếu người dùng tự đặt QA_BASE_URL, không đoán port: chỉ cảnh báo khi lệch
// với port mà chế độ hiện tại sẽ tự khởi động.
if (customBaseUrl) {
  const urlPort = new URL(customBaseUrl).port;
  if (urlPort && Number(urlPort) !== PORT) {
    // eslint-disable-next-line no-console
    console.warn(
      `[playwright.tiers] QA_BASE_URL port ${urlPort} != ${PORT} (mode "${mode}"). ` +
        `webServer sẽ khởi động ở ${PORT} nhưng test chạy vào ${customBaseUrl}.`
    );
  }
}

// ---------------------------------------------------------------------------
// Report riêng theo tier (và theo mode, để baseline không đè bản thường)
// ---------------------------------------------------------------------------

const reportSuffix = mode === 'dev' ? TIER : `${TIER}-${mode}`;
const jsonReport = `tmp/pw-results-${reportSuffix}.json`;

// ---------------------------------------------------------------------------
// Config
// ---------------------------------------------------------------------------

export default defineConfig({
  ...base,

  grep: tier.grep,
  grepInvert: tier.grepInvert,

  timeout: positiveInt('PW_TIMEOUT_MS') ?? tier.timeout,
  globalTimeout: tier.globalTimeout,

  expect: {
    timeout: 5_000,
  },

  workers: positiveInt('PW_WORKERS') ?? tier.workers,
  fullyParallel: env.PW_FULLY_PARALLEL === '1',

  // A failing test is a failing test.
  retries: 0,

  // Test mà mới được thêm .only trong CI sẽ làm hỏng cả tier mà không ai biết.
  forbidOnly: !!env.CI,

  webServer: {
    command: SERVER_COMMANDS[mode],
    url: baseURL,
    reuseExistingServer: env.PW_REUSE_SERVER !== '0',
    timeout: 120_000,
  },

  use: {
    ...base.use,
    baseURL,
    actionTimeout: tier.actionTimeout,
  },

  reporter: [
    ['list'],
    ['json', { outputFile: jsonReport }],
  ],
});