import { render } from 'preact';
import { act } from 'preact/test-utils';
import { expect, it, vi } from 'vitest';
import { LookupBottomSheet } from './LookupBottomSheet';
import { validLookup } from '../test/fixtures';

it('does not substitute a Vietnamese translation for a missing English definition', () => {
  const host = document.createElement('div');
  document.body.append(host);
  const noop = vi.fn();
  const result = { ...validLookup, source: 'offline' as const,
    quick: { ...validLookup.quick, definition_en: '', meaning_vi: ['xảy ra'], lexical_unit: null } };
  try {
    act(() => render(<LookupBottomSheet open result={result} loading={false} error={null} mode="en"
      onModeChange={noop} onClose={noop} onOpenSettings={noop} onSpeak={noop} onToggleSave={noop} saved={false} />, host));
    expect(host.textContent).toContain('Not found in the local dictionary.');
    expect(host.querySelector('.meaning-vi')).toBeNull();
  } finally { act(() => render(null, host)); host.remove(); }
});

it('requests context only on action and keeps quick text when a deep result arrives', () => {
  const host = document.createElement('div'); document.body.append(host);
  const onExplain = vi.fn(); const noop = vi.fn();
  const props = { open: true, result: validLookup, loading: false, error: null, mode: 'bilingual' as const, onModeChange: noop, onClose: noop, onOpenSettings: noop, onSpeak: noop, onToggleSave: noop, saved: false, onExplain };
  try {
    act(() => render(<LookupBottomSheet {...props} />, host));
    expect(onExplain).not.toHaveBeenCalled();
    act(() => (host.querySelector('.explain-button') as HTMLButtonElement).click());
    expect(onExplain).not.toHaveBeenCalled();
    act(() => (host.querySelector('.ai-explain-button') as HTMLButtonElement).click());
    expect(onExplain).toHaveBeenCalledWith('meaning-in-context');
    const contextResult = { ...validLookup, request_id: 'new', quick: { ...validLookup.quick, definition_en: 'MUST NOT REPLACE QUICK' }, deep: { ...validLookup.deep, context_explanation_en: 'A deeper explanation.' } };
    act(() => render(<LookupBottomSheet {...props} contextResult={contextResult} />, host));
    expect(host.querySelector('.deep-explanation')?.textContent).toContain('A deeper explanation.');
    expect(host.querySelector('.meaning-en')?.textContent).toBe(validLookup.quick.definition_en);
  } finally { act(() => render(null, host)); host.remove(); }
});

it('keeps Quick minimal, resets expansion on selection, and handles Escape in two steps', () => {
  const host = document.createElement('div'); document.body.append(host);
  const noop = vi.fn(); const close = vi.fn();
  const props = { open: true, result: validLookup, loading: false, error: null, mode: 'bilingual' as const, onModeChange: noop, onClose: close, onOpenSettings: noop, onSpeak: noop, onToggleSave: noop, onAddNote: noop, onTranslateSentence: noop, saved: false, debug: true };
  try {
    act(() => render(<LookupBottomSheet {...props} selectionKey="first" />, host));
    expect(host.querySelector('.context-actions,.language-tabs,.engine-debug,select')).toBeNull();
    expect(host.querySelector('[aria-label="Save word"]')).not.toBeNull();
    act(() => (host.querySelector('.explain-button') as HTMLButtonElement).click());
    expect(host.querySelector('[aria-label="Save word"]')?.textContent).toBe('Save');
    act(() => render(<LookupBottomSheet {...props} selectionKey="first" loading error="Unavailable" />, host));
    expect(host.querySelector('.meaning-en')?.textContent).toBe(validLookup.quick.definition_en);
    act(() => { document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', cancelable: true })); });
    expect(close).not.toHaveBeenCalled();
    expect(host.querySelector('.language-tabs')).toBeNull();
    act(() => (host.querySelector('.explain-button') as HTMLButtonElement).click());
    host.querySelector<HTMLSelectElement>('select')?.focus();
    act(() => render(<LookupBottomSheet {...props} selectionKey="second" />, host));
    expect(host.querySelector('.language-tabs')).toBeNull();
    expect(document.activeElement).toBe(host.querySelector('.explain-button'));
    act(() => { document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', cancelable: true })); });
    expect(close).toHaveBeenCalledOnce();
  } finally { act(() => render(null, host)); host.remove(); }
});

it.each([false, true])('only traps focus when mobile is modal (desktop=%s)', desktop => {
  vi.stubGlobal('matchMedia', () => ({ matches: desktop, addEventListener: vi.fn(), removeEventListener: vi.fn() }));
  const host = document.createElement('div'); document.body.append(host);
  const previous = document.createElement('button'); document.body.append(previous); previous.focus();
  const noop = vi.fn();
  try {
    act(() => render(<LookupBottomSheet open result={validLookup} loading={false} error={null} mode="en" onModeChange={noop} onClose={noop} onOpenSettings={noop} onSpeak={noop} onToggleSave={noop} saved={false} />, host));
    expect(host.querySelector('[aria-modal="true"]') !== null).toBe(!desktop);
    expect(host.querySelector('.sheet-backdrop') !== null).toBe(!desktop);
    const buttons = host.querySelectorAll<HTMLButtonElement>('.lookup-sheet button');
    buttons[buttons.length - 1].focus();
    const event = new KeyboardEvent('keydown', { key: 'Tab', cancelable: true });
    act(() => { document.dispatchEvent(event); });
    expect(event.defaultPrevented).toBe(!desktop);
    if (!desktop) expect(document.activeElement).toBe(buttons[0]);
  } finally { act(() => render(null, host)); host.remove(); previous.remove(); vi.unstubAllGlobals(); }
});

it('offers explicit controls for switching between word popup and side panel', () => {
  vi.stubGlobal('matchMedia', () => ({ matches: true, addEventListener: vi.fn(), removeEventListener: vi.fn() }));
  const host = document.createElement('div'); document.body.append(host);
  const onDisplayModeChange = vi.fn(); const noop = vi.fn();
  try {
    act(() => render(<LookupBottomSheet open displayMode="popup" onDisplayModeChange={onDisplayModeChange} result={validLookup} loading={false} error={null} mode="en" onModeChange={noop} onClose={noop} onOpenSettings={noop} onSpeak={noop} onToggleSave={noop} saved={false} />, host));
    expect(host.querySelector('.word-popup')).not.toBeNull();
    expect(host.querySelector('.deep-explanation')).toBeNull();
    const panelButton = Array.from(host.querySelectorAll<HTMLButtonElement>('.lookup-view-switch button')).find(button => button.textContent === 'Bảng bên phải');
    act(() => panelButton?.click());
    expect(onDisplayModeChange).toHaveBeenCalledWith('panel');
  } finally { act(() => render(null, host)); host.remove(); vi.unstubAllGlobals(); }
});

it('shows a subtle AI caution in the lookup surface', () => {
  const host = document.createElement('div'); document.body.append(host);
  const noop = vi.fn();
  try {
    act(() => render(<LookupBottomSheet open result={validLookup} loading={false} error={null} mode="bilingual" onModeChange={noop} onClose={noop} onOpenSettings={noop} onSpeak={noop} onToggleSave={noop} saved={false} />, host));
    expect(host.querySelector('.ai-caution')?.textContent).toContain('AI có thể mắc lỗi');
  } finally { act(() => render(null, host)); host.remove(); }
});
