import { afterEach, expect, it, vi } from 'vitest';
import { render } from 'preact';
import { act } from 'preact/test-utils';
import { PdfDocumentTools, PdfModeSwitch } from './PdfModeSwitch';
vi.mock('../../components/useDesktop', () => ({ useDesktop: () => false }));
afterEach(() => document.body.replaceChildren());

// U2/§7.2/§12.11: OCR Next is a document-tools action, not a Header action. The Header mode control
// owns Original/Reading only and is never disabled by an active OCR run.
it('keeps the Header mode control free of OCR actions while a run is active', async () => {
  const host = document.createElement('div'); document.body.append(host);
  await act(() => render(<PdfModeSwitch mode="reading" uiLanguage="vi" canRead onOriginal={vi.fn()} onReading={vi.fn()} />, host));
  expect(host.querySelector('[aria-label="PDF view mode"]')).not.toBeNull();
  expect(host.querySelector('[aria-label="OCR next"]')).toBeNull();
  expect(host.querySelector<HTMLButtonElement>('.pdf-mode-switch button')!.disabled).toBe(false);
  await act(() => render(null, host));
});

// §9.7/§12: document tools is the single canonical OCR status and control surface, opened from More.
it('reports page and batch progress inside the document-tools surface', async () => {
  const host = document.createElement('div'); document.body.append(host);
  const props = { uiLanguage: 'vi' as const, hasPdfText: true, hasOcr: true, language: 'eng' as const,
    onSource: vi.fn(), onLanguage: vi.fn(), onRecognizeCurrent: vi.fn(), onRecognizeNext: vi.fn(),
    queueStatus: { state: 'running' as const, completed: 1, total: 6, page: 7, progress: 42 },
    onPause: vi.fn(), onContinue: vi.fn(), onCancel: vi.fn(), hasAnyOcr: true, onClear: vi.fn() };
  await act(() => render(<PdfDocumentTools {...props} open onClose={vi.fn()} />, host));
  expect(host.querySelector<HTMLButtonElement>('[aria-label="OCR next"]')!.disabled).toBe(true);
  expect(host.querySelector('[role="status"]')?.textContent).toContain('Trang 7: 42%');
  expect(host.querySelector('[role="status"]')?.textContent).toContain('1/6');
  await act(() => render(null, host));
});

// A closed document-tools surface contributes no status or control to the Reader.
it('renders no OCR surface while closed', async () => {
  const host = document.createElement('div'); document.body.append(host);
  await act(() => render(<PdfDocumentTools uiLanguage="vi" hasPdfText={false} hasOcr={false} language="eng"
    onSource={vi.fn()} onLanguage={vi.fn()} onRecognizeCurrent={vi.fn()} onRecognizeNext={vi.fn()}
    queueStatus={null} onPause={vi.fn()} onContinue={vi.fn()} onCancel={vi.fn()} hasAnyOcr={false} onClear={vi.fn()}
    open={false} onClose={vi.fn()} />, host));
  expect(host.querySelector('[role="dialog"]')).toBeNull();
  expect(host.querySelector('[aria-label="OCR next"]')).toBeNull();
  await act(() => render(null, host));
});