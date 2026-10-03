/**
 * T0c execution tiers for browser tests.
 *
 * WHY A SEPARATE CONFIG: `workers` is a global Playwright option, not a per-project
 * one. `--project` scopes which specs run but cannot change the worker count, so
 * expressing tiers as separate configs is the only way to give each tier its own
 * timeout, actionTimeout and worker count without a custom framework.
 *
 * The tier is chosen with the PW_TIER environment variable. Project names are
 * inherited unchanged from the base config, so `--project=laptop` and
 * `--project=mobile-chromium` keep working as documented in docs/testing.md.
 *
 * USAGE
 *   FAST        $env:PW_TIER='fast';       npx playwright test --config playwright.tiers.config.ts
 *   PDF-NORMAL  $env:PW_TIER='pdf-normal'; npx playwright test --config playwright.tiers.config.ts
 *   HEAVY       $env:PW_TIER='heavy';      npx playwright test --config playwright.tiers.config.ts
 *
 * TIER RULES (fixed values; never raised to hide a slow or failing test)
 *   FAST        timeout 30s   actionTimeout 10s  workers 1  retries 0
 *   PDF-NORMAL  timeout 90s   actionTimeout 10s  workers 1  retries 0
 *   HEAVY       timeout 240s  actionTimeout 10s  workers 1  retries 0
 *
 * `workers` stays 1 in every tier: the PDF and OCR workers plus the
 * service-worker build are not safe to run in parallel, and parallelism is never
 * a fix for a slow test.
 */
import { defineConfig } from '@playwright/test';
import base from './playwright.config';

const TIER = (process.env.PW_TIER ?? 'fast').toLowerCase();

const TIERS = {
  fast: { timeout: 30_000, actionTimeout: 10_000 },
  'pdf-normal': { timeout: 90_000, actionTimeout: 10_000 },
  heavy: { timeout: 240_000, actionTimeout: 10_000 },
} as const satisfies Record<string, { timeout: number; actionTimeout: number }>;

if (!(TIER in TIERS)) {
  throw new Error(`unknown PW_TIER "${TIER}"; expected one of: ${Object.keys(TIERS).join(', ')}`);
}

const tier = TIERS[TIER as keyof typeof TIERS];

export default defineConfig({
  ...base,
  // Retries stay 0 in every tier: a failing test is a failing test.
  timeout: tier.timeout,
  expect: { timeout: 5_000 },
  use: { ...base.use, actionTimeout: tier.actionTimeout },
  // `workers` is global and cannot vary per project, so it is set once here.
  workers: 1,
});
