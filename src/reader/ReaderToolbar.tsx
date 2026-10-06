import { useEffect, useLayoutEffect, useRef, useState } from 'preact/hooks';
import type { ComponentChildren } from 'preact';
import { createPortal } from 'preact/compat';
import { useDesktop } from '../components/useDesktop';
import { useDialog } from '../components/useDialog';
import type { PdfZoomMode } from './pdf/navigation';
import type { MarkupTool } from './MarkupPalette';

/** docs/desktop-reader.md §3.1: the five fixed selector choices. */
const FIXED_ZOOM_PERCENTS = [75, 100, 125, 150] as const;
/** The modes behind the select's single "Automatic" entry. */
const AUTOMATIC_ZOOM_MODES: PdfZoomMode[] = ['natural', 'fit-width', 'fit-page'];

function BackIcon() {
  return <svg aria-hidden="true" viewBox="0 0 24 24"><path d="M15 5l-7 7 7 7" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" /></svg>;
}

export function MoreIcon() {
  return <svg aria-hidden="true" viewBox="0 0 24 24" fill="currentColor"><circle cx="5" cy="12" r="1.6"/><circle cx="12" cy="12" r="1.6"/><circle cx="19" cy="12" r="1.6"/></svg>;
}

export function PrevPageIcon() {
  return <svg aria-hidden="true" viewBox="0 0 24 24"><path d="M15 18l-6-6 6-6" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" /></svg>;
}

export function NextPageIcon() {
  return <svg aria-hidden="true" viewBox="0 0 24 24"><path d="M9 6l6 6-6 6" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" /></svg>;
}

export function ZoomOutIcon() {
  return <svg aria-hidden="true" viewBox="0 0 24 24"><circle cx="12" cy="12" r="10" fill="none" stroke="currentColor" stroke-width="1.8" /><path d="M8 12h8" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" /></svg>;
}

export function ZoomInIcon() {
  return <svg aria-hidden="true" viewBox="0 0 24 24"><circle cx="12" cy="12" r="10" fill="none" stroke="currentColor" stroke-width="1.8" /><path d="M8 12h8M12 8v8" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" /></svg>;
}

export function ContentsIcon() {
  return <svg aria-hidden="true" viewBox="0 0 24 24"><path d="M4 6h16M4 12h16M4 18h10" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" /></svg>;
}

export function NotesIcon() {
  return <svg aria-hidden="true" viewBox="0 0 24 24"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" fill="none" stroke="currentColor" stroke-width="1.8" /><path d="M14 2v6h6" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" /><path d="M10 12h8M10 16h5" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" /></svg>;
}

export function MarkupIcon() {
  return <svg aria-hidden="true" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M4 15c2.5-6 4.5 2 7-3s4.5 1 9-5"/><path d="M4 20h16"/></svg>;
}

export function PrintIcon() {
  return <svg aria-hidden="true" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M7 9V3h10v6"/><path d="M7 17H5a2 2 0 0 1-2-2v-4a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2v4a2 2 0 0 1-2 2h-2"/><path d="M7 14h10v7H7z"/></svg>;
}

export function HighlightIcon() {
  return <svg aria-hidden="true" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M15 4.5l4.5 4.5-7.5 7.5-4.5-4.5z"/><path d="M7.5 12L6 17.5 11.5 16"/><path d="M14 20.5h6"/></svg>;
}

/** docs/desktop-reader.md §2.1: renamed from `PenIcon`; the control sets the `underline` tool. */
export function UnderlineIcon() {
  return <svg aria-hidden="true" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M7 4v6a5 5 0 0 0 10 0V4"/><path d="M6 20h12"/><path d="M7 4h10"/></svg>;
}

export function EraseIcon() {
  return <svg aria-hidden="true" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M13.2 5.8a2 2 0 0 1 2.8 0l3.2 3.2a2 2 0 0 1 0 2.8L11.5 19.5H8l-3.2-3.2a2 2 0 0 1 0-2.8z"/><path d="M11.5 19.5H20"/></svg>;
}

export function ContextIcon() {
  return <svg aria-hidden="true" viewBox="0 0 24 24"><path d="M12 2a10 10 0 1 0 10 10A10 10 0 0 0 12 2z" fill="none" stroke="currentColor" stroke-width="1.8" /><path d="M12 8v4M12 16h.01" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" /></svg>;
}

export function TextThemeIcon() {
  return <svg aria-hidden="true" viewBox="0 0 24 24"><path d="M4 7h16M4 12h16M4 17h10" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" /></svg>;
}

export function LanguagesIcon() {
  return <svg aria-hidden="true" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="9"/><path d="M3 12h18M12 3c2.5 2.7 3.8 5.7 3.8 9s-1.3 6.3-3.8 9c-2.5-2.7-3.8-5.7-3.8-9S9.5 5.7 12 3z"/></svg>;
}

export function DocumentToolsIcon() {
  return <svg aria-hidden="true" viewBox="0 0 24 24"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" fill="none" stroke="currentColor" stroke-width="1.8" /><path d="M14 2v6h6" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" /><path d="M16 13H8M16 17H8M10 9h6" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" /></svg>;
}

export function OcrIcon() {
  return <svg aria-hidden="true" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M4 8V5a1 1 0 0 1 1-1h3M16 4h3a1 1 0 0 1 1 1v3M20 16v3a1 1 0 0 1-1 1h-3M8 20H5a1 1 0 0 1-1-1v-3"/><path d="M8.5 16l3.5-8 3.5 8M9.8 13h4.4"/></svg>;
}

export function ClickLookupIcon() {
  return <svg aria-hidden="true" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><circle cx="11" cy="11" r="6.5"/><path d="M16 16l4.5 4.5M11 8.5v5M8.5 11h5"/></svg>;
}

// Contract §7.1: the Header owns exactly and only Back, the document title, and Original/Reading
// for PDF. No secondary action, no More trigger, no OCR control lives here (§7.2).
// DesktopReader extension: at ≥1024px the Header expands to a full document-reader toolbar
// with navigation, page/location, zoom, document tools, and More — all in one band.
export function ReaderToolbar({ 
  title, 
  onBack, 
  primaryActions,
  // Desktop toolbar props (≥1024px)
  page,
  totalPages,
  onPrevPage,
  onNextPage,
  onOpenGoTo,
  zoomLevel,
  zoomMode,
  onZoomOut,
  onZoomIn,
  onZoomSelect,
  onContents,
  onNotes,
  onMarkup,
  onPrint,
  onHighlight,
    onUnderline,
  onErase,
  moreItems,
    markupActive = false,
    activeMarkupTool = null
}: { 
  title: string; 
  onBack: () => void; 
  primaryActions?: ComponentChildren;
  // Desktop toolbar props
  page?: number;
  totalPages?: number;
  onPrevPage?: () => void;
  onNextPage?: () => void;
  /** docs/desktop-reader.md §2.2: the Header is the sole opener of `Go to location` at >=1024px. */
  onOpenGoTo?: () => void;
  zoomLevel?: number;
  /** docs/desktop-reader.md §3.1: the full `PdfZoomMode` union. The select only renders an
   *  "Automatic" entry for the automatic/fit modes; every other mode is a concrete scale. */
  zoomMode?: PdfZoomMode;
  onZoomOut?: () => void;
  onZoomIn?: () => void;
  onZoomSelect?: (mode: 'auto' | 'custom', value?: number) => void;
  onContents?: () => void;
  onNotes?: () => void;
  onMarkup?: () => void;
  onPrint?: () => void;
  onHighlight?: () => void;
    onUnderline?: () => void;
  onErase?: () => void;
  moreItems?: Array<{ label: string; onSelect: () => void; pressed?: boolean }>;
  markupActive?: boolean;
    /** docs/desktop-reader.md §2.1: pressed state per Markup tool (Highlight, Underline, Erase). */
    activeMarkupTool?: MarkupTool | null;
  }) {
  const desktop = useDesktop();
  // docs/desktop-reader.md §3.1: the displayed value is the actual rendering scale, which stepping
  // can move off the fixed list. One dynamic option carries it so the select never shows blank.
  const actualPercent = zoomLevel === undefined ? null : Math.round(zoomLevel);
  const isAutomatic = zoomMode !== undefined && AUTOMATIC_ZOOM_MODES.includes(zoomMode);
  const hasDynamicZoom = actualPercent !== null && !isAutomatic && !(FIXED_ZOOM_PERCENTS as readonly number[]).includes(actualPercent);

  // Only render desktop toolbar groups at ≥1024px
  const showDesktopToolbar = desktop && (page !== undefined && totalPages !== undefined);
    // Regression fix for the missing More trigger on text/EPUB at ≥1024px (task
    // 2026-10-05-desktop-text-document-has-no-more). `page`/`totalPages` are PDF-only, so gating the
    // whole toolbar on them also removed the single More disclosure. Mobile keeps Footer ownership via
    // App.tsx (moreTrigger is passed only when !desktop), so this is still one trigger per band.
    const showMore = desktop;
  
  return <header class="reader-header">
    <div class="reader-header-leading">
      <button class="icon-button reader-back" aria-label="Back to library" onClick={onBack}><BackIcon /></button>
      <div class="reader-document"><h1 title={title}>{title}</h1></div>
    </div>
    <div class="reader-header-actions">
      {primaryActions}
      {showDesktopToolbar && (
        <>
          {/* Page navigation group */}
          <nav class="page-navigation" aria-label="Page navigation">
            <button class="icon-button" aria-label="Previous page" disabled={page! <= 1} onClick={onPrevPage}><PrevPageIcon /></button>
            {/* docs/desktop-reader.md §2.2: the Header owns PDF page navigation alone at >=1024px.
                The accessible name is the stable 'Current PDF page' handle the Footer uses at
                <=1023px, so both bands expose one name for the same action; the full sentence
                moves to title/aria-description so nothing is lost from the old label.
                Activating it opens `Go to location` (not a direct jump): the Footer no longer
                navigates in this band, so this button is the only reachable opener there. */}
            <button class="text-button page-count" aria-label="Current PDF page" aria-description={`Page ${page} of ${totalPages}`} title={`Page ${page} of ${totalPages}`} onClick={onOpenGoTo}>{page} / {totalPages}</button>
            <button class="icon-button" aria-label="Next page" disabled={page! >= totalPages!} onClick={onNextPage}><NextPageIcon /></button>
          </nav>
          
          {/* Zoom group with selector */}
          <div class="pdf-zoom-stepper" role="group" aria-label="Zoom">
            <button class="icon-button" aria-label="Zoom out" onClick={onZoomOut}><ZoomOutIcon /></button>
            <div class="zoom-selector">
              <select 
                aria-label="Zoom level" 
                value={isAutomatic ? 'auto' : String(zoomLevel)}
                onChange={(e: Event) => {
                  const value = (e.target as HTMLSelectElement).value;
                  if (value === 'auto') {
                    onZoomSelect?.('auto');
                  } else {
                    onZoomSelect?.('custom', parseInt(value, 10));
                  }
                }}
              >
                <option value="auto">Automatic</option>
                <option value="75">75%</option>
                <option value="100">100%</option>
                <option value="125">125%</option>
                <option value="150">150%</option>
                {hasDynamicZoom && <option value={String(actualPercent)}>{actualPercent}%</option>}
              </select>
            </div>
            <button class="icon-button" aria-label="Zoom in" onClick={onZoomIn}><ZoomInIcon /></button>
          </div>
          
          {/* Document tools group */}
          <div class="reader-tools" role="group" aria-label="Document tools">
            <button class="icon-button" aria-label="Contents" onClick={onContents}><ContentsIcon /></button>
            <button class="icon-button" aria-label="Notes" onClick={onNotes}><NotesIcon /></button>
            <button class="icon-button" aria-label="Markup" onClick={onMarkup}><MarkupIcon /></button>
            <button class="icon-button" aria-label="Print" onClick={onPrint}><PrintIcon /></button>
          </div>
          
          {/* Markup tools group */}
          <div class="reader-markup-tools" role="group" aria-label="Markup tools">
            <button class="icon-button" aria-label="Highlight" aria-pressed={activeMarkupTool === 'highlight'} onClick={onHighlight}><HighlightIcon /></button>
                        <button class="icon-button" aria-label="Underline" aria-pressed={activeMarkupTool === 'underline'} onClick={onUnderline}><UnderlineIcon /></button>
                        <button class="icon-button" aria-label="Erase" aria-pressed={activeMarkupTool === 'eraser'} onClick={onErase}><EraseIcon /></button>
          </div>
                  </>
                )}
                {showMore && <ReaderMore items={moreItems ?? []} markupActive={markupActive} />}
              </div>
            </header>;
}

export interface ReaderMoreItem {
  label: string;
  onSelect: () => void;
  pressed?: boolean;
  icon?: ComponentChildren;
  group?: string;
}

// Contract §9: exactly one More disclosure. One component, one menu element, one dismissal and
// focus path for both presentation forms — bottom sheet at <=1023px, popover at >=1024px (§9.2).
// Desktop popover opens downward from the Header trigger.
export function ReaderMore({ items, markupActive = false }: { items: ReaderMoreItem[]; markupActive?: boolean }) {
  const [open, setOpen] = useState(false);
  const root = useRef<HTMLDivElement>(null);
  const trigger = useRef<HTMLButtonElement>(null);
  const dialog = useRef<HTMLElement>(null);
  const desktop = useDesktop();
  const [pos, setPos] = useState<{ top: number; right: number; maxHeight: number } | null>(null);

  // Position the desktop popover using trigger's bounding rect
  useLayoutEffect(() => {
    if (!open || !desktop) { setPos(null); return; }
    const place = () => {
      const r = trigger.current!.getBoundingClientRect();
      setPos({
        top: r.bottom + 8,
        right: Math.max(8, window.innerWidth - r.right),
        maxHeight: window.innerHeight - r.bottom - 16
      });
    };
    place();
    window.addEventListener('resize', place);
    window.addEventListener('scroll', place, true);
    return () => { window.removeEventListener('resize', place); window.removeEventListener('scroll', place, true); };
  }, [open, desktop]);

  // Dismiss: check both root (trigger) and dialog (menu, which is in portal)
  useEffect(() => {
    if (!open) return;
    const dismiss = (event: PointerEvent) => {
      const target = event.target as Node;
      if (!root.current?.contains(target) && !dialog.current?.contains(target)) {
        setOpen(false);
      }
    };
    // Escape dismisses from the document, not just the menu: at <=1023px the bottom sheet keeps
    // focus on the trigger behind its backdrop (§9.5), so a section-level handler would never run.
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key !== 'Escape') return;
      event.preventDefault();
      setOpen(false);
      trigger.current?.focus({ preventScroll: true });
    };
    if (desktop) dialog.current?.querySelector<HTMLButtonElement>('button:not(:disabled)')?.focus({ preventScroll: true });
    document.addEventListener('pointerdown', dismiss);
    document.addEventListener('keydown', onKeyDown);
    return () => { document.removeEventListener('pointerdown', dismiss); document.removeEventListener('keydown', onKeyDown); };
  }, [open, desktop]);

  // Keyboard navigation inside menu
  const onMenuKeyDown = (event: KeyboardEvent) => {
    const keys = ['ArrowDown', 'ArrowUp', 'Home', 'End'];
    if (!keys.includes(event.key)) return;
    const items = Array.from(dialog.current?.querySelectorAll<HTMLButtonElement>('button:not(:disabled)') ?? []);
    if (!items.length) return;
    event.preventDefault();
    const index = items.indexOf(document.activeElement as HTMLButtonElement);
    const next = event.key === 'Home' ? 0
      : event.key === 'End' ? items.length - 1
      : (index + (event.key === 'ArrowDown' ? 1 : -1) + items.length) % items.length;
    (items[next] as HTMLElement)?.focus();
  };

  const select = (item: ReaderMoreItem) => { setOpen(false); trigger.current?.focus({ preventScroll: true }); item.onSelect(); };

  // Group items by their group property
  const groupedItems = items.reduce((acc, item) => {
    const group = item.group || 'actions';
    if (!acc[group]) acc[group] = [];
    acc[group].push(item);
    return acc;
  }, {} as Record<string, ReaderMoreItem[]>);

  // Guard: don't render empty menu
  if (!items.length) return null;

  // The layer is portaled to <body>, so it escapes .reader-shell entirely. That is deliberate:
  // the Footer is a position:fixed stacking context with z-index 16, and an in-shell menu could
  // never paint above the panels. `reader-more-layer` is therefore the single scoping hook for
  // every More rule — no rule may address .reader-more-menu by a bare or .reader-shell selector,
  // because a portal outside the shell silently loses both (see docs/reader-behavior-contract.md §9).
  const layer = open && (
    <div class={`reader-more-layer ${desktop ? 'desktop' : 'mobile'}`}>
      {!desktop && <button class="sheet-backdrop more-backdrop" tabIndex={-1} aria-label="Close reader menu" onClick={() => { setOpen(false); trigger.current?.focus({ preventScroll: true }); }} />}
      <section ref={dialog} class={`reader-more-menu ${desktop ? 'desktop' : 'mobile'}`} role="menu" aria-label="Reader actions" onKeyDown={onMenuKeyDown}
        style={desktop && pos ? { top: pos.top, right: pos.right, maxHeight: pos.maxHeight, overflowY: 'auto' } : undefined}
      >
        {Object.entries(groupedItems).map(([groupName, groupItems]) => (
          <div key={groupName} class="more-group">
            {groupName !== 'actions' && <div class="more-group-label">{groupName}</div>}
            <div class="more-group-items">
              {groupItems.map(item => (
                <button 
                  key={item.label} 
                  role="menuitem" 
                  type="button" 
                  aria-label={item.label} 
                  aria-pressed={item.pressed} 
                  onClick={() => select(item)}
                  class="more-item"
                >
                  {item.icon && <span class="more-item-icon">{item.icon}</span>}
                  <span class="more-item-label">{item.label}</span>
                </button>
              ))}
            </div>
          </div>
        ))}
      </section>
    </div>
  );

  return <div class="reader-more" ref={root}>
    <button ref={trigger} class={`icon-button ${markupActive ? 'markup-indicator' : ''}`} aria-label="Reader menu" aria-expanded={open} aria-haspopup="menu" onClick={() => setOpen(value => !value)}><MoreIcon /></button>
    {layer && createPortal(layer, document.body)}
  </div>;
}