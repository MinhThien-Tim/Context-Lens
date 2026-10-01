import { expect, type Page } from '@playwright/test';

export type InterfaceMode = 'simple' | 'advanced';

const label = (mode: InterfaceMode) => (mode === 'simple' ? 'Simple' : 'Advanced');

/**
 * Switch an already-loaded shell into `mode`, clicking the density toggle only when the
 * current mode differs. The toggle buttons are idempotent setters
 * (`setPreferences({ ...preferences, interfaceMode })`), so an already-correct mode costs
 * zero clicks. This keeps specs honest about the real default instead of blindly toggling.
 */
export async function useInterfaceMode(page: Page, mode: InterfaceMode) {
  const shell = page.locator('.home-shell');
  await expect(shell).toHaveAttribute('data-interface-mode', /.+/);
  if (await shell.getAttribute('data-interface-mode') !== mode) {
    await page.getByRole('group', { name: 'Interface density' })
      .getByRole('button', { name: label(mode), exact: true })
      .click();
  }
  await expect(shell).toHaveAttribute('data-interface-mode', mode);
}