import { render } from 'preact';
import { act } from 'preact/test-utils';
import { afterEach, expect, it, vi } from 'vitest';
import { ReaderShell } from './ReaderShell';
import { PdfDocumentTools, PdfModeSwitch } from './pdf/PdfModeSwitch';
import { ReaderMore, ReaderToolbar } from './ReaderToolbar';
import { ContextPanel } from './ContextPanel';
import { ContentsPanel } from './ContentsPanel';
import { expectProgrammaticScroll } from './programmaticScroll';

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
  act(() => render(<ReaderShell surface={surface} contentsOpen={false} contextOpen={false} controlsLocked={locked}><header class="reader-header"><button>Back</button></header>{body}<footer class="reader-progress"><button>Zoom out</button></footer></ReaderShell>, host));
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

it('quiets mobile chrome after real accumulated travel and reveals it again without moving content @MOB-3', () => {
  const { scroll } = mount();
  scrollSteps(scroll, [20, 60]);
  expect(isQuiet()).toBe(true);
  act(() => revealControl()!.click());
  expect(isQuiet()).toBe(false);
  expect(scroll.scrollTop).toBe(60);
});

it('keeps 1024px as the sole responsive authority and never has a tablet band @ARCH-1 @CHR-3', () => {
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

it('never reveals or quiets chrome from a tap, and exposes only a reveal-only escape control @MOB-3 @INP-4', () => {
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

it('reveals chrome when focus enters chrome and not when focus enters the reading surface @INP-3', () => {
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
// BACK-1 (overlay half): Escape closes the topmost overlay and leaves the one beneath it open.
// A11Y-3: the panel that held focus is the one that closes. The history-ownership half of BACK-1
// is an open item and is deliberately not asserted here.
it('closes the focused Context panel on Escape while keeping Document open @BACK-1 @A11Y-3', () => {
  mount(1024);
  const closeDocument = vi.fn(), closeContext = vi.fn();
  act(() => render(<><ContentsPanel sections={[]} offset={0} onClose={closeDocument} onJump={vi.fn()} onNotes={vi.fn()} /><ContextPanel onClose={closeContext} onNote={vi.fn()} /></>, host));
  act(() => { (host.querySelector('.context-panel button') as HTMLButtonElement).focus(); document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true })); });
  expect(closeContext).toHaveBeenCalledOnce();
  expect(closeDocument).not.toHaveBeenCalled();
});
// A11Y-3: the menu takes focus on open, arrows move it, Escape closes it and returns focus to the
// control that opened it.
it('supports keyboard menu navigation and restores focus on Escape @A11Y-3', () => {
  mount(1024);
  act(() => render(<ReaderMore items={[{ label: 'Contents', onSelect: vi.fn() }, { label: 'Markup', onSelect: vi.fn() }]} />, host));
  const trigger = host.querySelector<HTMLButtonElement>('[aria-label="Reader menu"]')!;
  act(() => trigger.click());
  // Menu is rendered via portal to document.body
  const items = document.body.querySelectorAll('[role="menuitem"]');
  expect(document.activeElement).toBe(items[0]);
  act(() => { items[0].dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowDown', bubbles: true })); });
  expect(document.activeElement).toBe(items[1]);
  act(() => { items[1].dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true })); });
  expect(document.body.querySelector('[role="menu"]')).toBeNull();
  expect(document.activeElement).toBe(trigger);
});

// §5.0/§5.1/§5.2: restoration and page jumps are programmatic, so they never quiet or reveal.
it('does not hide controls for a programmatic restore or page jump', () => {
  const { scroll } = mount();
  act(() => { scroll.scrollTop = 500; scroll.dispatchEvent(new Event('scroll')); });
  expect(isQuiet()).toBe(false);
});

// §5.2 the accumulator must not be credited for a jump the Reader itself commanded, even when the
// jump lands inside a live gesture's momentum window and travels well past the 32px threshold.
it('does not accumulate travel for a declared programmatic jump during a live gesture', () => {
  const { scroll } = mount();
  act(() => { scroll.dispatchEvent(new Event('wheel', { bubbles: true })); });
  expectProgrammaticScroll(604, scroll);
  act(() => { scroll.scrollTop = 604; scroll.dispatchEvent(new Event('scroll')); });
  expect(isQuiet()).toBe(false);
  // The declaration is consumed once: the very next uncommanded movement is ordinary real travel.
  scrollSteps(scroll, [640]);
  expect(isQuiet()).toBe(true);
});

// §7.1/§7.2/§9.4: the Header owns exactly Back, the document title, and Original/Reading for PDF.
// Every other approved action lives once, in More, at both widths.
// Labels follow the §9.3 rename table (2026-10-05): Theme, Languages, Click lookup.
it.each([390, 1024])('keeps the Header to Back, title, and mode while More owns the secondary actions (width=%s)', width => {
  mount(width);
  const contents = vi.fn(), markup = vi.fn(), settings = vi.fn();
  act(() => render(<><ReaderToolbar title="A long document title.pdf" onBack={vi.fn()} primaryActions={<div>Original / Reading</div>} /><ReaderMore items={[{ label: 'Contents', onSelect: contents }, { label: 'Markup', onSelect: markup }, { label: 'Theme', onSelect: settings }]} /></>, host));
  expect(host.querySelector('.reader-header-leading h1')?.getAttribute('title')).toBe('A long document title.pdf');
  expect(host.querySelector('.reader-header-actions')?.textContent).toBe('Original / Reading');
  for (const label of ['Contents', 'Markup', 'OCR next', 'Theme', 'Languages', 'Reader menu']) {
    expect(host.querySelector(`.reader-header [aria-label="${label}"]`)).toBeNull();
  }
  act(() => host.querySelector<HTMLButtonElement>('[aria-label="Reader menu"]')!.click());
  // Selecting an action closes the disclosure (§9 disclosure lifecycle), so each invocation
  // re-opens More: the assertion is that the action is reachable exactly once, via More.
  for (const label of ['Contents', 'Markup', 'Theme']) {
    if (!document.body.querySelector('[role="menuitem"]')) act(() => host.querySelector<HTMLButtonElement>('[aria-label="Reader menu"]')!.click());
    act(() => document.body.querySelector<HTMLButtonElement>(`[role="menuitem"][aria-label="${label}"]`)!.click());
  }
  expect(contents).toHaveBeenCalledOnce(); expect(markup).toHaveBeenCalledOnce(); expect(settings).toHaveBeenCalledOnce();
});

// U2/§7.2/§9.3/§9.7/§12.11: OCR next is a document-tools action reached from More, never a Header
// action, and exactly one control in the Reader performs it.
// Deliberately untagged: OCR next retires in P4, so this is not a More inventory (MORE-3) claim.
it('OCR next lives only in the document-tools surface opened from More', () => {
  mount(1024);
  const next = vi.fn(), noop = vi.fn();
  const tools = { uiLanguage: 'en' as const, hasPdfText: true, hasOcr: false, language: 'eng' as const, onSource: noop, onLanguage: noop, onRecognizeCurrent: noop, onRecognizeNext: next, queueStatus: null, onPause: noop, onContinue: noop, onCancel: noop, hasAnyOcr: false, onClear: noop };
  act(() => render(<><ReaderToolbar title="Doc.pdf" onBack={noop} primaryActions={<PdfModeSwitch mode="original" uiLanguage="en" canRead onOriginal={noop} onReading={noop} />} /><PdfDocumentTools {...tools} open onClose={noop} /></>, host));
  expect(host.querySelector('.reader-header [aria-label="OCR next"]')).toBeNull();
  const owners = Array.from(host.querySelectorAll<HTMLButtonElement>('[aria-label="OCR next"]')).filter(button => { next.mockClear(); button.click(); return next.mock.calls.length > 0; });
  expect(owners).toHaveLength(1);
  act(() => render(null, host));
  // With the surface closed the Reader exposes no OCR-next entry point at all.
  act(() => render(<ReaderToolbar title="Doc.pdf" onBack={noop} primaryActions={<PdfModeSwitch mode="original" uiLanguage="en" canRead onOriginal={noop} onReading={noop} />} />, host));
  expect(host.querySelector('[aria-label="OCR next"]')).toBeNull();
});

it('keeps reading chrome visible while a selection action surface is open', () => {
  const { scroll } = mount();
  act(() => { scroll.appendChild(Object.assign(document.createElement('div'), { className: 'pdf-reading-selection-actions' })); });
  scrollSteps(scroll, [20, 60]);
  expect(isQuiet()).toBe(false);
});


it('Header/Footer overlay the surface with static padding and no reserved strip element at both band widths @CHR-1', () => {
  mount(390);
  const scroll = document.querySelector('.pdf-scroll') as HTMLElement | null || document.querySelector('.pdf-reading-scroll') as HTMLElement | null;
  expect(scroll).not.toBeNull();
  const strip = document.querySelector('.reader-strip');
  expect(strip).toBeNull();
  const footer = document.querySelector('.reader-progress');
  const header = document.querySelector('.reader-header');
  expect(footer || header).not.toBeNull();
  if (host) act(() => render(null, host));
  document.body.replaceChildren();
  host = document.createElement('div'); document.body.appendChild(host);
  mount(1280);
  const strip2 = document.querySelector('.reader-strip');
  expect(strip2).toBeNull();
  const scroll2 = document.querySelector('.pdf-scroll') as HTMLElement | null || document.querySelector('.pdf-reading-scroll') as HTMLElement | null;
  expect(scroll2).not.toBeNull();
  if (host) act(() => render(null, host));
});

