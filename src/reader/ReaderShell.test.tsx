import { render } from 'preact';
import { act } from 'preact/test-utils';
import { afterEach, expect, it, vi } from 'vitest';
import { ReaderShell } from './ReaderShell';
import { PdfModeSwitch } from './pdf/PdfModeSwitch';
import { ReaderToolbar } from './ReaderToolbar';
import { ContextPanel } from './ContextPanel';
import { ContentsPanel } from './ContentsPanel';

let host: HTMLDivElement;
afterEach(() => { if (host) act(() => render(null, host)); document.body.replaceChildren(); vi.unstubAllGlobals(); });
function mount(desktop = false, locked = false) {
  vi.stubGlobal('matchMedia', vi.fn(() => ({ matches: desktop, addEventListener: vi.fn(), removeEventListener: vi.fn() })));
  host = document.createElement('div'); document.body.append(host);
  act(() => render(<ReaderShell interfaceMode="simple" surface="reading" contentsOpen={false} contextOpen={false} controlsLocked={locked}><div class="pdf-reading-scroll"><button>Reading control</button></div></ReaderShell>, host));
  return host.querySelector<HTMLDivElement>('.pdf-reading-scroll')!;
}
it('quiets mobile chrome on reading scroll and restores it on interaction without moving content', () => {
  const scroll = mount();
  act(() => { scroll.dispatchEvent(new Event('wheel', { bubbles: true })); scroll.scrollTop = 100; scroll.dispatchEvent(new Event('scroll')); });
  expect(host.querySelector('.chrome-quiet')).not.toBeNull();
  act(() => (host.querySelector('.reader-reveal') as HTMLButtonElement).click());
  expect(host.querySelector('.chrome-quiet')).toBeNull();
  expect(scroll.scrollTop).toBe(100);
});
it.each([[true, false], [false, true]])('keeps controls visible on desktop or during an overlay (desktop=%s, locked=%s)', (desktop, locked) => {
  const scroll = mount(desktop, locked);
  act(() => { scroll.dispatchEvent(new Event('wheel', { bubbles: true })); scroll.scrollTop = 100; scroll.dispatchEvent(new Event('scroll')); });
  expect(host.querySelector('.chrome-quiet')).toBeNull();
});
it('closes the focused Context panel on Escape while keeping Document open', () => {
  mount(true);
  const closeDocument = vi.fn(), closeContext = vi.fn();
  act(() => render(<><ContentsPanel sections={[]} offset={0} onClose={closeDocument} onJump={vi.fn()} onGoTo={vi.fn()} onNotes={vi.fn()} /><ContextPanel onClose={closeContext} onNote={vi.fn()} /></>, host));
  act(() => { (host.querySelector('.context-panel button') as HTMLButtonElement).focus(); document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true })); });
  expect(closeContext).toHaveBeenCalledOnce();
  expect(closeDocument).not.toHaveBeenCalled();
});
it('supports keyboard menu navigation and restores focus on Escape', () => {
  mount(true);
  act(() => render(<ReaderToolbar interfaceMode="simple" title="Test" contentsOpen={false} contextOpen={false} onBack={vi.fn()} onContents={vi.fn()} onContext={vi.fn()} onNote={vi.fn()} onSettings={vi.fn()} onEngines={vi.fn()} />, host));
  const trigger = host.querySelector<HTMLButtonElement>('[aria-label="Reader menu"]')!;
  act(() => trigger.click());
  const items = host.querySelectorAll('[role="menuitem"]');
  expect(document.activeElement).toBe(items[0]);
  act(() => { items[0].dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowDown', bubbles: true })); });
  expect(document.activeElement).toBe(items[1]);
  act(() => { items[1].dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true })); });
  expect(host.querySelector('[role="menu"]')).toBeNull();
  expect(document.activeElement).toBe(trigger);
});

it('does not hide controls for a programmatic restore or page jump', () => {
  const scroll = mount();
  act(() => { scroll.scrollTop = 500; scroll.dispatchEvent(new Event('scroll')); });
  expect(host.querySelector('.chrome-quiet')).toBeNull();
});

it.each([false, true])('keeps primary actions reachable and invokes existing handlers (desktop=%s)', desktop => {
  mount(desktop);
  const contents = vi.fn(), markup = vi.fn(), next = vi.fn();
  act(() => render(<ReaderToolbar interfaceMode="simple" title="A long document title.pdf" contentsOpen={false} contextOpen={false} highlightAvailable onBack={vi.fn()} onContents={contents} onContext={vi.fn()} onNote={vi.fn()} onSettings={vi.fn()} onEngines={vi.fn()} onHighlight={markup} primaryActions={<button aria-label="OCR next" onClick={next}>OCR next</button>}><div>Original / Reading</div></ReaderToolbar>, host));
  expect(host.querySelector('.reader-header-leading h1')?.getAttribute('title')).toBe('A long document title.pdf');
  expect(host.querySelector('.reader-header-position')?.textContent).toBe('Original / Reading');
  for (const label of ['Contents', 'Markup', 'OCR next']) {
    const button = host.querySelector<HTMLButtonElement>(`.reader-primary-tools [aria-label="${label}"]`)!;
    expect(button).not.toBeNull();
    act(() => button.click());
  }
  expect(contents).toHaveBeenCalledOnce(); expect(markup).toHaveBeenCalledOnce(); expect(next).toHaveBeenCalledOnce();
});

it('OCR next invokes the existing action and can be moved into the toolbar without duplication', () => {
  mount(true);
  const next = vi.fn(), noop = vi.fn();
  const props = { mode: 'original' as const, uiLanguage: 'en' as const, canRead: true, hasPdfText: true, hasOcr: false, language: 'eng' as const, onOriginal: noop, onReading: noop, onSource: noop, onLanguage: noop, onRecognizeCurrent: noop, onRecognizeNext: next, queueStatus: null, onPause: noop, onContinue: noop, onCancel: noop, hasAnyOcr: false, onClear: noop };
  act(() => render(<PdfModeSwitch {...props} />, host));
  act(() => host.querySelector<HTMLButtonElement>('[aria-label="OCR next"]')!.click());
  expect(next).toHaveBeenCalledOnce();
  act(() => render(<PdfModeSwitch {...props} showNext={false} />, host));
  expect(host.querySelector('[aria-label="OCR next"]')).toBeNull();
  expect(host.querySelector('[aria-label="PDF view mode"]')).not.toBeNull();
  act(() => host.querySelector<HTMLButtonElement>('[aria-label="Document tools"]')!.click());
  const action = Array.from(host.querySelectorAll<HTMLButtonElement>('.pdf-reading-options button')).find(button => button.textContent?.includes('next 6'))!;
  act(() => action.click());
  expect(next).toHaveBeenCalledTimes(2);
});
