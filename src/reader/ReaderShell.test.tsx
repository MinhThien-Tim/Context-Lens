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
// §1.1/§1.2 the viewport width drives the single responsive authority, so the stub answers the real
// min-width query instead of hard-coding a band. A tablet band cannot exist here: 768-1023 answers
// `min-width: 1024px` with false and therefore gets the Mobile presentation.
function stubViewport(width: number) {
  const queries: string[] = [];
  vi.stubGlobal('matchMedia', vi.fn((query: string) => {
    queries.push(query);
    return { media: query, matches: width >= Number(/min-width:\s*(\d+)px/.exec(query)?.[1] ?? 0), addEventListener: vi.fn(), removeEventListener: vi.fn() };
  }));
  return queries;
}
// The chrome fixtures use the production selectors because §6.4 makes focus scope a contract rule:
// only real Reader chrome reveals, the reading surface never does.
function mount(width = 390, locked = false, surface: 'text' | 'original' | 'reading' = 'reading') {
  if (host) act(() => render(null, host));
  const queries = stubViewport(width);
  host = document.createElement('div'); document.body.append(host);
  const body = surface === 'original'
    ? <div class="pdf-scroll"><div class="pdf-page"><button>Page control</button></div></div>
    : <div class="pdf-reading-scroll"><button>Reading control</button></div>;
  act(() => render(<ReaderShell interfaceMode="simple" surface={surface} contentsOpen={false} contextOpen={false} controlsLocked={locked}><header class="reader-header"><button>Back</button></header>{body}<footer class="reader-progress"><button>Zoom out</button></footer></ReaderShell>, host));
  return { scroll: host.querySelector<HTMLDivElement>(surface === 'original' ? '.pdf-scroll' : '.pdf-reading-scroll')!, queries };
}
// Real user scroll only (§5.2/§5.4): the wheel marks the following deltas as user travel, and the
// deltas are applied one at a time so §6.2 accumulation and §6.3 direction reset are exercised.
function scrollSteps(scroll: HTMLElement, tops: number[]) {
  act(() => { scroll.dispatchEvent(new Event('wheel', { bubbles: true })); });
  for (const top of tops) {
    act(() => { scroll.scrollTop = top; scroll.dispatchEvent(new Event('scroll')); });
  }
}
const isQuiet = () => host.querySelector('.chrome-quiet') !== null;
const revealControl = () => host.querySelector<HTMLButtonElement>('[aria-label="Show reading controls"]');

it('quiets mobile chrome after real accumulated travel and reveals it again without moving content', () => {
  const { scroll } = mount();
  scrollSteps(scroll, [20, 60]);
  expect(isQuiet()).toBe(true);
  act(() => revealControl()!.click());
  expect(isQuiet()).toBe(false);
  expect(scroll.scrollTop).toBe(60);
});

it('keeps 1024px as the sole responsive authority and never has a tablet band', () => {
  for (const width of [767, 768, 1023, 1024]) {
    const { scroll, queries } = mount(width);
        // The only responsive query the Reader ever issues is the 1024px authority, so no 768 tablet
        // query exists to give 768-1023 its own layout.
        expect([...new Set(queries)], `width ${width}`).toEqual(['(min-width: 1024px)']);
    scrollSteps(scroll, [60]);
    // 768-1023 is Mobile presentation: quiet chrome exists there. Only >=1024 has no quiet state.
    expect(isQuiet(), `width ${width} quiet state`).toBe(width < 1024);
  }
});

it('reveals chrome only after accumulated upward travel, not for a single small correction', () => {
  const { scroll } = mount();
  scrollSteps(scroll, [60, 200]);
  expect(isQuiet()).toBe(true);
  // §6.3 a single-event delta of any size never reveals, and §6.2 a direction change resets first.
  scrollSteps(scroll, [192]);
  expect(isQuiet()).toBe(true);
  scrollSteps(scroll, [180, 168]);
  expect(isQuiet()).toBe(false);
  expect(scroll.scrollTop).toBe(168);
});

it('never reveals or quiets chrome from a tap, and exposes only a reveal-only escape control', () => {
  const { scroll } = mount();
  scrollSteps(scroll, [60]);
  expect(isQuiet()).toBe(true);
  const control = revealControl()!;
  expect(control.getAttribute('aria-haspopup')).toBeNull();
  expect(control.getAttribute('aria-expanded')).toBeNull();
  act(() => scroll.querySelector('button')!.click());
  expect(isQuiet()).toBe(true);
  act(() => control.click());
  expect(isQuiet()).toBe(false);
  expect(revealControl()).toBeNull();
});

it('reveals chrome when focus enters chrome and not when focus enters the reading surface', () => {
  const { scroll } = mount();
  scrollSteps(scroll, [60]);
  expect(isQuiet()).toBe(true);
  act(() => scroll.querySelector('button')!.focus());
  expect(isQuiet()).toBe(true);
  act(() => host.querySelector<HTMLButtonElement>('.reader-header button')!.focus());
  expect(isQuiet()).toBe(false);
});

// §4.3 quiet exists only below 1024px; §4.4 an overlay or locked controls keep chrome shown.
it.each([[1024, false], [390, true]])('keeps controls visible on desktop or while controls are locked (width=%s, locked=%s)', (width, locked) => {
  const { scroll } = mount(width, locked);
  scrollSteps(scroll, [20, 60]);
  expect(isQuiet()).toBe(false);
});
it('closes the focused Context panel on Escape while keeping Document open', () => {
  mount(1024);
  const closeDocument = vi.fn(), closeContext = vi.fn();
  act(() => render(<><ContentsPanel sections={[]} offset={0} onClose={closeDocument} onJump={vi.fn()} onGoTo={vi.fn()} onNotes={vi.fn()} /><ContextPanel onClose={closeContext} onNote={vi.fn()} /></>, host));
  act(() => { (host.querySelector('.context-panel button') as HTMLButtonElement).focus(); document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true })); });
  expect(closeContext).toHaveBeenCalledOnce();
  expect(closeDocument).not.toHaveBeenCalled();
});
it('supports keyboard menu navigation and restores focus on Escape', () => {
  mount(1024);
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

// §5.0/§5.1/§5.2: restoration and page jumps are programmatic, so they never quiet or reveal.
it('does not hide controls for a programmatic restore or page jump', () => {
  const { scroll } = mount();
  act(() => { scroll.scrollTop = 500; scroll.dispatchEvent(new Event('scroll')); });
  expect(isQuiet()).toBe(false);
});

it.each([390, 1024])('keeps primary actions reachable and invokes existing handlers (width=%s)', width => {
  mount(width);
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

// §7.2/§9.x ownership: the retired Header/L1 entry point leaves, the action stays reachable in
// document tools, and exactly one button owns it.
it('OCR next leaves the Header entry point and keeps exactly one action in document tools', () => {
  mount(1024);
  const next = vi.fn(), noop = vi.fn();
  const props = { mode: 'original' as const, uiLanguage: 'en' as const, canRead: true, hasPdfText: true, hasOcr: false, language: 'eng' as const, onOriginal: noop, onReading: noop, onSource: noop, onLanguage: noop, onRecognizeCurrent: noop, onRecognizeNext: next, queueStatus: null, onPause: noop, onContinue: noop, onCancel: noop, hasAnyOcr: false, onClear: noop };
  act(() => render(<PdfModeSwitch {...props} />, host));
  act(() => host.querySelector<HTMLButtonElement>('[aria-label="OCR next"]')!.click());
  expect(next).toHaveBeenCalledOnce();
  act(() => render(<PdfModeSwitch {...props} showNext={false} />, host));
  expect(host.querySelector('[aria-label="OCR next"]')).toBeNull();
  expect(host.querySelector('[aria-label="PDF view mode"]')).not.toBeNull();
  act(() => host.querySelector<HTMLButtonElement>('[aria-label="Document tools"]')!.click());
    // Ownership is the product requirement: exactly one document-tools button performs the action.
    // OCR window copy is deliberately not asserted here; the 12-page wording is the PDF/OCR phase.
    const owners = Array.from(host.querySelectorAll<HTMLButtonElement>('.pdf-reading-options button')).filter(button => { next.mockClear(); button.click(); return next.mock.calls.length > 0; });
    expect(owners).toHaveLength(1);
  });

it('keeps reading chrome visible while a selection action surface is open', () => {
  const { scroll } = mount();
  act(() => { scroll.appendChild(Object.assign(document.createElement('div'), { className: 'pdf-reading-selection-actions' })); });
  scrollSteps(scroll, [20, 60]);
  expect(isQuiet()).toBe(false);
});

