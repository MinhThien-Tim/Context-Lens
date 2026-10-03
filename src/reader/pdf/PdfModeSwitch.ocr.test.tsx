import { afterEach, expect, it, vi } from 'vitest';
import { render } from 'preact';
import { act } from 'preact/test-utils';
import { PdfModeSwitch } from './PdfModeSwitch';
vi.mock('../../components/useDesktop', () => ({ useDesktop: () => false }));
vi.mock('../../components/useDialog', () => ({ useDialog: () => ({ current: null }) }));
afterEach(() => document.body.replaceChildren());

it('shows page and batch progress while OCR next is disabled and Original remains available', async () => {
  const host = document.createElement('div'); document.body.append(host);
  await act(() => render(<PdfModeSwitch mode="reading" uiLanguage="vi" canRead hasPdfText hasOcr language="eng"
    onOriginal={vi.fn()} onReading={vi.fn()} onSource={vi.fn()} onLanguage={vi.fn()} onRecognizeCurrent={vi.fn()} onRecognizeNext={vi.fn()}
    queueStatus={{ state: 'running', completed: 1, total: 6, page: 7, progress: 42 }}
    onPause={vi.fn()} onContinue={vi.fn()} onCancel={vi.fn()} hasAnyOcr onClear={vi.fn()} />, host));
  // OCR next button no longer exists in PdfModeSwitch (moved to ReaderToolbar More menu)
  expect(host.querySelector('[aria-label="OCR next"]')).toBeNull();
  // Original/Reading mode toggle buttons should still exist and Original should not be disabled
  const originalBtn = host.querySelector<HTMLButtonElement>('.pdf-mode-switch button[aria-pressed="false"]');
  const readingBtn = host.querySelector<HTMLButtonElement>('.pdf-mode-switch button[aria-pressed="true"]');
  expect(originalBtn).not.toBeNull();
  expect(readingBtn).not.toBeNull();
  expect(originalBtn!.disabled).toBe(false);
  // Document tools button should exist
  expect(host.querySelector<HTMLButtonElement>('.pdf-reading-options-toggle')).not.toBeNull();
  await act(() => host.querySelector<HTMLButtonElement>('.pdf-reading-options-toggle')!.click());
  expect(host.querySelector('[role="status"]')?.textContent).toContain('Trang 7: 42%');
  expect(host.querySelector('[role="status"]')?.textContent).toContain('1/6');
  await act(() => render(null, host));
});
