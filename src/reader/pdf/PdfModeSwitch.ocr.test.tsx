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
  expect(host.querySelector<HTMLButtonElement>('[aria-label="OCR next"]')!.disabled).toBe(true);
  expect(host.querySelector<HTMLButtonElement>('.pdf-mode-switch button')!.disabled).toBe(false);
  await act(() => host.querySelector<HTMLButtonElement>('.pdf-reading-options-toggle')!.click());
  expect(host.querySelector('[role="status"]')?.textContent).toContain('Trang 7: 42%');
  expect(host.querySelector('[role="status"]')?.textContent).toContain('1/6');
  await act(() => render(null, host));
});
