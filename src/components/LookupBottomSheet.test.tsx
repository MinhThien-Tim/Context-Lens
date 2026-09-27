import { QuickExplain } from './QuickExplain';
import { render } from 'preact';
import { act } from 'preact/test-utils';
import { expect, it, vi } from 'vitest';
import { LookupBottomSheet } from './LookupBottomSheet';
import type { LookupResponse } from '../lookup/types';
import { validLookup } from '../test/fixtures';

it.each([false, true])('shows local Vietnamese glosses immediately in Full even when context omits them (desktop=%s)', desktop => {
  vi.stubGlobal('matchMedia', () => ({ matches: desktop, addEventListener: vi.fn(), removeEventListener: vi.fn() }));
  const host = document.createElement('div'); document.body.append(host);
  const noop = vi.fn();
  const result = { ...validLookup, dictionary: { word: 'movement', surfaceForm: 'movement', lemma: 'movement', pronunciation: null, contextConfidence: 0,
    senses: Array.from({ length: 11 }, (_, index) => ({ id: `movement-${index}`, pos: 'noun', definitionEn: `Movement meaning ${index}`, meaningsVi: [], source: 'wordnet' as const, contextScore: 0, contextMatch: false })),
    unpairedMeaningsVi: ['sự chuyển động', 'phong trào'] } };
  try {
    act(() => render(<LookupBottomSheet open displayMode="panel" result={result} contextResult={{ ...validLookup, dictionary: undefined }} loading={false} error={null} mode="bilingual" onModeChange={noop} onClose={noop} onOpenSettings={noop} onSpeak={noop} onToggleSave={noop} saved={false} />, host));
    const glosses = host.querySelector('.deep-explanation>.unpaired-meanings')!;
    expect(glosses.closest('details')).toBeNull();
    expect(glosses.textContent).toContain('sự chuyển động');
    expect(glosses.textContent).toContain('phong trào');
    expect(host.querySelectorAll('.sense-group>ol>li')).toHaveLength(2);
    expect(host.querySelector('.more-group-meanings>summary')?.textContent).toBe('More meanings (9)');
    expect(host.querySelector<HTMLDetailsElement>('.more-group-meanings')?.open).toBe(false);
  } finally { act(() => render(null, host)); host.remove(); vi.unstubAllGlobals(); }
});

it('keeps all POS and important Vietnamese meanings in Quick and reveals long definitions through More meanings', () => {
  const host = document.createElement('div'); document.body.append(host);
  const definition = 'A long English explanation with detail that is useful to the reader. '.repeat(8);
  const result = { ...validLookup, dictionary: { word: 'on', surfaceForm: 'on', lemma: 'on', pronunciation: null, contextConfidence: 0, contextPos: 'adjective',
    senses: ['adjective', 'adjective', 'adjective', 'adverb', 'preposition'].map((pos, index) => ({ id: `on-${index}`, pos, definitionEn: index === 0 ? definition : `Meaning ${index}`, meaningsVi: [], source: 'wordnet' as const, contextScore: 0, contextMatch: false })),
    unpairedMeaningsVi: ['trên', 'vào', 'với'] } };
  try {
    act(() => render(<QuickExplain result={result} mode="bilingual" />, host));
    expect([...host.querySelectorAll('.quick-pos-group h4')].map(el => el.textContent)).toEqual(['adjective', 'adverb', 'preposition']);
    expect(host.querySelectorAll('.sense-row')).toHaveLength(4);
    expect(host.querySelector('.entry-glosses')?.closest('details')).toBeNull();
    expect(host.querySelector('.entry-glosses')?.textContent).toContain('trên');
    expect(host.querySelector('.quick-explanation')?.classList.contains('is-compact')).toBe(true);
    expect(host.querySelector('.long-meaning')?.textContent).toBe(definition);
    act(() => host.querySelector<HTMLButtonElement>('.quick-more-meanings')!.click());
    expect(host.querySelectorAll('.sense-row')).toHaveLength(5);
    expect(host.querySelector('.quick-explanation')?.classList.contains('is-compact')).toBe(false);
  } finally { act(() => render(null, host)); host.remove(); }
});

it('honors the saved view across selection changes and allows switching it without requesting providers', () => {
  const host = document.createElement('div'); document.body.append(host);
  const noop = vi.fn(); const explain = vi.fn(); const translate = vi.fn(); const changed = vi.fn();
  let display: 'popup' | 'panel' = 'panel'; let selectionKey = 'first';
  const draw = () => render(<LookupBottomSheet open displayMode={display} preferredView={display === 'panel' ? 'full' : 'quick'} selectionKey={selectionKey}
    onDisplayModeChange={next => { changed(next); display = next; draw(); }} result={validLookup} loading={false} error={null} mode="bilingual"
    onModeChange={noop} onClose={noop} onOpenSettings={noop} onSpeak={noop} onToggleSave={noop} onExplain={explain} onTranslateSentence={translate} saved={false} />, host);
  try {
    act(draw);
    expect(host.querySelector('.lookup-sheet.expanded')).not.toBeNull();
    selectionKey = 'second'; act(draw);
    expect(host.querySelector('.lookup-sheet.expanded')).not.toBeNull();
    const selector = host.querySelector<HTMLSelectElement>('[aria-label="Default lookup view"]')!;
    expect(selector.value).toBe('full');
    act(() => { selector.value = 'quick'; selector.dispatchEvent(new Event('change', { bubbles: true })); });
    expect(changed).toHaveBeenLastCalledWith('popup');
    selectionKey = 'third'; act(draw);
    expect(host.querySelector('.lookup-sheet.quick')).not.toBeNull();
    expect(explain).not.toHaveBeenCalled(); expect(translate).not.toHaveBeenCalled();
  } finally { act(() => render(null, host)); host.remove(); }
});

it('cycles desktop panel languages, exposes unpaired glosses and keeps Note beside Save without requesting data', () => {
  vi.stubGlobal('matchMedia', () => ({ matches: true, addEventListener: vi.fn(), removeEventListener: vi.fn() }));
  const host = document.createElement('div'); document.body.append(host);
  const noop = vi.fn(); const note = vi.fn(); const save = vi.fn(); const explain = vi.fn(); const translate = vi.fn();
  const result = { ...validLookup, dictionary: { word: 'maintain', surfaceForm: 'maintain', lemma: 'maintain', pronunciation: null, contextConfidence: 0,
    senses: [{ id: 'paired', pos: 'verb', definitionEn: 'Keep in good condition', meaningsVi: ['bảo dưỡng'], source: 'local' as const, contextScore: 0, contextMatch: false }],
    unpairedMeaningsVi: ['nghĩa Việt chưa ghép'] } };
  let mode: 'en' | 'vi' | 'bilingual' = 'bilingual';
  const draw = () => render(<LookupBottomSheet open result={result} loading={false} error={null} mode={mode}
    onModeChange={next => { mode = next; draw(); }} onClose={noop} onOpenSettings={noop} onSpeak={noop}
    onToggleSave={save} onAddNote={note} onExplain={explain} onTranslateSentence={translate} saved={false} />, host);
  try {
    act(draw);
    expect(host.querySelector('.language-cycle')).not.toBeNull();
    act(() => host.querySelector<HTMLButtonElement>('.explain-button')!.click());
    expect(host.querySelector('.language-tabs')).toBeNull();
    const noteButton = host.querySelector<HTMLButtonElement>('.inspector-header-actions .inspector-note')!;
    expect(noteButton.textContent).toBe('Note');
    expect(noteButton.nextElementSibling?.getAttribute('aria-label')).toBe('Save word');
    expect(host.querySelectorAll('[aria-label="Add note"]')).toHaveLength(1);
    act(() => noteButton.click());
    act(() => host.querySelector<HTMLButtonElement>('[aria-label="Save word"]')!.click());
    expect(note).toHaveBeenCalledOnce();
    expect(save).toHaveBeenCalledOnce();
    const cycle = [['bilingual', 'EN+VI'], ['en', 'EN'], ['vi', 'VI'], ['bilingual', 'EN+VI']] as const;
    for (const [index, [expectedMode, label]] of cycle.entries()) {
      expect(mode).toBe(expectedMode);
      expect(host.querySelector('.language-cycle')?.textContent).toContain(label);
      expect(host.querySelector('.language-cycle')?.getAttribute('title')).toMatch(/^Switch to /);
      const meaning = host.querySelector('.expanded-sense-list .sense-bilingual')!;
      expect(Boolean(meaning.querySelector('.sense-definition'))).toBe(expectedMode !== 'vi');
      expect(Boolean(meaning.querySelector('.sense-vi'))).toBe(expectedMode !== 'en');
      const unpaired = host.querySelector('.deep-explanation>.unpaired-meanings');
      expect(Boolean(unpaired)).toBe(expectedMode !== 'en');
      if (unpaired) {
        expect(unpaired.closest('details')).toBeNull();
        expect(unpaired.textContent).toContain('nghĩa Việt chưa ghép');
        expect(unpaired.querySelector('h3')?.textContent).toBe('Unmatched Vietnamese meanings');
      }
      expect(meaning.textContent).not.toContain('nghĩa Việt chưa ghép');
      if (index < cycle.length - 1) {
        act(() => host.querySelector<HTMLButtonElement>('.language-cycle')!.click());
      }
    }
    expect(explain).not.toHaveBeenCalled();
    expect(translate).not.toHaveBeenCalled();
    act(() => host.querySelector<HTMLButtonElement>('.explain-button')!.click());
    expect(host.querySelector('.language-cycle')).not.toBeNull();
    expect(host.querySelector('.language-tabs')).toBeNull();
    expect(host.querySelector('.inspector-header-actions [aria-label="Add note"]')).not.toBeNull();
  } finally { act(() => render(null, host)); host.remove(); vi.unstubAllGlobals(); }
});

it.each(['en', 'vi', 'bilingual'] as const)('renders only available language rows and keeps header actions accessible (%s)', mode => {
  const host = document.createElement('div'); document.body.append(host);
  const noop = vi.fn(); const speak = vi.fn(); const save = vi.fn(); const close = vi.fn();
  const result = { ...validLookup, selection: { ...validLookup.selection, surface: 'A very long selected phrase without pronunciation', lemma: 'phrase', ipa_uk: null, ipa_us: null },
    quick: { ...validLookup.quick, lexical_unit: null }, lens: undefined };
  const props = { open: true, result, loading: false, error: null, mode, onModeChange: noop, onClose: close, onOpenSettings: noop, onSpeak: speak, onToggleSave: save, saved: false };
  try {
    act(() => render(<LookupBottomSheet {...props} />, host));
    expect(host.querySelector('.ipa-line')).toBeNull();
    expect(host.querySelector('.inspector-example')).toBeNull();
    expect(host.querySelector('.context-badge')).toBeNull();
    expect(host.querySelector('.inspector-word-meta')?.textContent).toContain('Base: phrase');
    expect(Boolean(host.querySelector('.meaning-en'))).toBe(mode !== 'vi');
    expect(Boolean(host.querySelector('.meaning-vi'))).toBe(mode !== 'en');
    act(() => host.querySelector<HTMLButtonElement>('[aria-label="Pronounce word"]')!.click());
    expect(speak).toHaveBeenCalledWith(result.selection.surface);
    act(() => host.querySelector<HTMLButtonElement>('[aria-label="Save word"]')!.click());
    expect(save).toHaveBeenCalledOnce();
    act(() => render(<LookupBottomSheet {...props} saved />, host));
    expect(host.querySelector('[aria-label="Remove saved word"]')?.getAttribute('aria-pressed')).toBe('true');
    act(() => host.querySelector<HTMLButtonElement>('.explain-close')!.click());
    expect(close).toHaveBeenCalledOnce();
  } finally { act(() => render(null, host)); host.remove(); }
});

it('discloses long sentence context without truncating it or hiding dictionary groups', () => {
  const host = document.createElement('div'); document.body.append(host);
  const noop = vi.fn();
  const sentence = 'A long sentence with useful context. '.repeat(30);
  const result = { ...validLookup, context: { ...validLookup.context, sentence } };
  try {
    act(() => render(<LookupBottomSheet open result={result} loading={false} error={null} mode="bilingual" onModeChange={noop} onClose={noop} onOpenSettings={noop} onSpeak={noop} onToggleSave={noop} saved={false} />, host));
    act(() => host.querySelector<HTMLButtonElement>('.explain-button')!.click());
    const disclosure = host.querySelector<HTMLDetailsElement>('.inspector-sentence details')!;
    expect(disclosure.open).toBe(false);
    expect(disclosure.querySelector('p')?.textContent).toBe(sentence);
    expect(host.querySelector('.inspector-sources')).not.toBeNull();
  } finally { act(() => render(null, host)); host.remove(); }
});

it('does not substitute a Vietnamese translation for a missing English definition', () => {
  const host = document.createElement('div');
  document.body.append(host);
  const noop = vi.fn();
  const result = { ...validLookup, source: 'offline' as const,
    quick: { ...validLookup.quick, definition_en: '', meaning_vi: ['xảy ra'], lexical_unit: null } };
  try {
    act(() => render(<LookupBottomSheet open result={result} loading={false} error={null} mode="en"
      onModeChange={noop} onClose={noop} onOpenSettings={noop} onSpeak={noop} onToggleSave={noop} saved={false} />, host));
    expect(host.querySelector('.meaning-en')).toBeNull();
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
    expect(host.querySelector('.context-actions,select')).toBeNull();
    expect(host.querySelector('.inspector-sources')?.hasAttribute('open')).toBe(false);
    expect(host.querySelector('[aria-label="Save word"]')).not.toBeNull();
    expect(host.querySelector('.inspector-header .inspector-pronunciation .language-cycle')).not.toBeNull();
    expect(host.querySelector('.inspector-header .explain-button')?.textContent).toContain('Show more');
    expect(host.querySelectorAll('[aria-label="Add note"]')).toHaveLength(1);
    act(() => (host.querySelector('.explain-button') as HTMLButtonElement).click());
    expect(host.querySelector('.inspector-header .explain-button')?.getAttribute('aria-label')).toBe('Show less');
    expect(host.querySelectorAll('[aria-label="Add note"]')).toHaveLength(1);
    expect(host.querySelector('[aria-label="Save word"]')?.textContent).toBe('Save');
    act(() => render(<LookupBottomSheet {...props} selectionKey="first" loading error="Unavailable" />, host));
    expect(host.querySelector('.meaning-en')?.textContent).toBe(validLookup.quick.definition_en);
    act(() => { document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', cancelable: true })); });
    expect(close).not.toHaveBeenCalled();
    expect(host.querySelector('.inspector-pronunciation .language-cycle')).not.toBeNull();
    expect(host.querySelector('.lookup-sheet.quick')).not.toBeNull();
    act(() => (host.querySelector('.explain-button') as HTMLButtonElement).click());
    host.querySelector<HTMLSelectElement>('select')?.focus();
    act(() => render(<LookupBottomSheet {...props} selectionKey="second" />, host));
    expect(host.querySelector('.inspector-pronunciation .language-cycle')).not.toBeNull();
    expect(host.querySelector('.lookup-sheet.quick')).not.toBeNull();
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
    host.querySelector<HTMLElement>('.inspector-sources>summary')!.focus();
    const event = new KeyboardEvent('keydown', { key: 'Tab', cancelable: true });
    act(() => { document.dispatchEvent(event); });
    expect(event.defaultPrevented).toBe(!desktop);
    if (!desktop) expect(document.activeElement).toBe(buttons[0]);
  } finally { act(() => render(null, host)); host.remove(); previous.remove(); vi.unstubAllGlobals(); }
});

it('opens Full from the word popup without requesting new data', () => {
  vi.stubGlobal('matchMedia', () => ({ matches: true, addEventListener: vi.fn(), removeEventListener: vi.fn() }));
  const host = document.createElement('div'); document.body.append(host);
  const onDisplayModeChange = vi.fn(); const noop = vi.fn();
  try {
    act(() => render(<LookupBottomSheet open displayMode="popup" onDisplayModeChange={onDisplayModeChange} result={validLookup} loading={false} error={null} mode="en" onModeChange={noop} onClose={noop} onOpenSettings={noop} onSpeak={noop} onToggleSave={noop} saved={false} />, host));
    expect(host.querySelector('.word-popup')).not.toBeNull();
    expect(host.querySelector('.deep-explanation')).toBeNull();
    const panelButton = host.querySelector<HTMLButtonElement>('.explain-button');
    act(() => panelButton?.click());
    expect(onDisplayModeChange).toHaveBeenCalledWith('panel');
  } finally { act(() => render(null, host)); host.remove(); vi.unstubAllGlobals(); }
});

it('shows a subtle AI caution when AI context is present', () => {
  const host = document.createElement('div'); document.body.append(host);
  const noop = vi.fn();
  try {
    act(() => render(<LookupBottomSheet open result={validLookup} contextResult={{ ...validLookup, source: 'ai' }} loading={false} error={null} mode="bilingual" onModeChange={noop} onClose={noop} onOpenSettings={noop} onSpeak={noop} onToggleSave={noop} saved={false} />, host));
    expect(host.querySelector('.ai-caution')?.textContent).toContain('AI có thể mắc lỗi');
  } finally { act(() => render(null, host)); host.remove(); }
});

it('does not flash the previous result after the active selection changes', () => {
  const host = document.createElement('div'); document.body.append(host);
  const noop = vi.fn();
  try {
    act(() => render(<LookupBottomSheet open selectionText="another" result={validLookup} loading={false} error={null} mode="en" onModeChange={noop} onClose={noop} onOpenSettings={noop} onSpeak={noop} onToggleSave={noop} saved={false} />, host));
    expect(host.querySelector('.lookup-pending')).not.toBeNull();
    expect(host.querySelector('.lookup-pending')?.textContent).toContain('another');
    expect(host.textContent).not.toContain(validLookup.selection.surface);
  } finally { act(() => render(null, host)); host.remove(); }
});

it('shows available content immediately and enriches it inside the same sheet', () => {
  const host = document.createElement('div'); document.body.append(host);
  const noop = vi.fn();
  const initial = { ...validLookup, quick: { ...validLookup.quick, meaning_vi: [] } };
  try {
    act(() => render(<LookupBottomSheet open selectionText="maintain" result={initial} loading={false} error={null} mode="bilingual" onModeChange={noop} onClose={noop} onOpenSettings={noop} onSpeak={noop} onToggleSave={noop} saved={false} />, host));
    const sheet = host.querySelector('.lookup-sheet');
    const firstContent = host.querySelector('.quick-explanation');
    expect(host.querySelector('.lookup-pending')).toBeNull();
    expect(firstContent?.textContent).toContain(validLookup.quick.definition_en);

    act(() => render(<LookupBottomSheet open selectionText="maintain" result={validLookup} loading={false} error={null} mode="bilingual" onModeChange={noop} onClose={noop} onOpenSettings={noop} onSpeak={noop} onToggleSave={noop} saved={false} />, host));
    expect(host.querySelector('.lookup-sheet')).toBe(sheet);
    expect(host.querySelector('.quick-explanation')).toBe(firstContent);
    expect(host.querySelector('.meaning-vi')?.textContent).toContain(validLookup.quick.meaning_vi[0]);
  } finally { act(() => render(null, host)); host.remove(); }
});

it('keeps contextual POS first and exposes other groups independently in Full', () => {
  const host = document.createElement('div'); document.body.append(host);
  const noop = vi.fn();
  const senses = Array.from({ length: 8 }, (_, index) => ({ id: `sense-${index}`, pos: index === 1 ? 'noun' : 'verb', definitionEn: `Meaning ${index + 1}`, meaningsVi: [`VI ${index + 1}`], source: 'local' as const, contextScore: 8 - index, contextMatch: index === 0 }));
  const result = { ...validLookup, dictionary: { word: 'maintain', surfaceForm: 'maintain', lemma: 'maintain', pronunciation: null, contextConfidence: .9, contextPos: 'verb', senseStatus: 'context' as const, senses } };
  try {
    act(() => render(<LookupBottomSheet open result={result} loading={false} error={null} mode="bilingual" onModeChange={noop} onClose={noop} onOpenSettings={noop} onSpeak={noop} onToggleSave={noop} saved={false} />, host));
    expect(host.querySelector('.inspector-context')?.textContent).toContain('Meaning 1');
    expect(host.textContent).not.toContain('Meaning 8');
    act(() => host.querySelector<HTMLButtonElement>('.explain-button')!.click());
    const groups = host.querySelectorAll<HTMLDetailsElement>('.sense-group');
    expect(groups).toHaveLength(2);
    expect(groups[0].querySelector('summary')?.textContent).toContain('verb');
    expect(groups[0].open).toBe(true);
    expect(groups[1].open).toBe(false);
    expect(groups[0].textContent).toContain('Meaning 8');
    expect(groups[0].querySelector<HTMLDetailsElement>('.more-group-meanings')?.open).toBe(false);
    expect(host.querySelector('.inspector-sources')?.hasAttribute('open')).toBe(false);
    act(() => host.querySelector<HTMLButtonElement>('.explain-button')!.click());
    expect(host.querySelector('.deep-explanation')).toBeNull();
  } finally { act(() => render(null, host)); host.remove(); }
});

it('shows a short confirmed summary and keeps aggregate Vietnamese meanings explicitly unpaired', () => {
  const host = document.createElement('div'); document.body.append(host);
  const noop = vi.fn();
  const result = { ...validLookup, selection: { ...validLookup.selection, surface: 'still', part_of_speech: 'adverb' },
    lens: { selection: { surface: 'still', normalized: 'still', lemma: 'still' }, context: { sentence: 'But if you still question it.' },
      confidence: .9, posConfidence: .6, providers: {}, cached: false, offline: true },
    dictionary: { word: 'still', surfaceForm: 'still', lemma: 'still', pronunciation: null, contextPos: 'adverb', contextConfidence: .9,
      senses: [{ id: 'still.continuing', pos: 'adverb', definitionEn: 'continuing without interruption', meaningsVi: ['vẫn'],
        source: 'local' as const, contextScore: .9, contextMatch: true }], unpairedMeaningsVi: ['Hơn nữa.'] } };
  try {
    act(() => render(<LookupBottomSheet open result={result} loading={false} error={null} mode="bilingual"
      onModeChange={noop} onClose={noop} onOpenSettings={noop} onSpeak={noop} onToggleSave={noop} saved={false} />, host));
    expect(host.querySelector('.inspector-context')?.textContent).toContain('vẫn');
    expect(host.querySelector('.context-badge')?.textContent).toContain('Context');
    expect(host.querySelector('.context-confidence')).toBeNull();
    expect(host.querySelector('.inspector-context .sense-vi')?.textContent).toBe('vẫn');
    expect(host.querySelector('.unpaired-meanings')?.textContent).toContain('Hơn nữa');
    expect(host.querySelector('.inspector-context')?.textContent).not.toContain('Hơn nữa');
  } finally { act(() => render(null, host)); host.remove(); }
});

it('labels materially different same-POS meanings as multiple readings', () => {
  const host = document.createElement('div'); document.body.append(host);
  const noop = vi.fn();
  const result = { ...validLookup, dictionary: { word: 'zorp', surfaceForm: 'zorp', lemma: 'zorp', pronunciation: null,
    contextPos: 'verb', contextConfidence: .4, senses: [
      { id: 'one', pos: 'verb', definitionEn: 'first possible meaning', meaningsVi: ['nghĩa một'], source: 'local' as const, contextScore: .4, contextMatch: false },
      { id: 'two', pos: 'verb', definitionEn: 'second possible meaning', meaningsVi: ['nghĩa hai'], source: 'local' as const, contextScore: 0, contextMatch: false }
    ] } };
  try {
    act(() => render(<LookupBottomSheet open result={result} loading={false} error={null} mode="bilingual"
      onModeChange={noop} onClose={noop} onOpenSettings={noop} onSpeak={noop} onToggleSave={noop} saved={false} />, host));
    expect(host.querySelector('.context-badge')).toBeNull();
    expect(host.querySelector('.context-confidence')).toBeNull();
    expect(host.querySelector('.context-summary')).toBeNull();
  } finally { act(() => render(null, host)); host.remove(); }
});

it('retains English without a Vietnamese column and labels unresolved references separately', () => {
  const host = document.createElement('div');
  const result = { ...validLookup, dictionary: { word: 'fixture', surfaceForm: 'fixture', lemma: 'fixture', pronunciation: null, contextConfidence: 0,
    senses: [{ id: 'en:1', pos: 'verb', definitionEn: 'English stays visible', meaningsVi: [], source: 'wordnet' as const,
      pairingState: 'missing' as const, contextScore: 0, contextMatch: false }], unpairedMeaningsVi: ['Xem absentfixture'],
    vietnameseReferences: [{ text: 'Xem absentfixture', target: 'absentfixture', status: 'unresolved' as const, reason: 'missing' as const }] } };
  try {
    act(() => render(<QuickExplain result={result} mode="bilingual" />, host));
    expect(host.querySelector('.sense-definition')?.textContent).toBe('English stays visible');
    expect(host.querySelector('.sense-row .sense-vi')).toBeNull();
    expect(host.querySelector('.web-badge')).toBeNull();
    expect(host.querySelector('.unpaired-meanings')?.textContent).toContain('Xem absentfixture');
    expect(host.textContent).toContain('Vietnamese dictionary reference could not be resolved.');
  } finally { act(() => render(null, host)); }
});

it.each(['en', 'vi', 'bilingual'] as const)('preserves linked sense rows in Quick and Full (%s)', mode => {
  const host = document.createElement('div'); document.body.append(host);
  const noop = vi.fn();
  const senses = Array.from({ length: 6 }, (_, index) => ({ id: `paired-${index}`, pos: 'adjective', definitionEn: `English ${index}`, meaningsVi: [`Vietnamese ${index}`], source: 'local' as const, contextScore: 0, contextMatch: false }));
  const result = { ...validLookup, dictionary: { word: 'maintain', surfaceForm: 'maintain', lemma: 'maintain', pronunciation: null, contextConfidence: 0, senses, unpairedMeaningsVi: ['Unmatched gloss'] } };
  try {
    act(() => render(<LookupBottomSheet open result={result} loading={false} error={null} mode={mode} onModeChange={noop} onClose={noop} onOpenSettings={noop} onSpeak={noop} onToggleSave={noop} onAddNote={noop} onExplain={noop} saved={false} />, host));
    const quick = host.querySelector('.sense-row .sense-bilingual')!;
    expect(Boolean(quick.querySelector('.sense-definition'))).toBe(mode !== 'vi');
    expect(Boolean(quick.querySelector('.sense-vi'))).toBe(mode !== 'en');
    expect(quick.classList.contains('paired-columns')).toBe(mode === 'bilingual');
    expect(host.querySelectorAll('.quick-pos-group h4')).toHaveLength(1);
    act(() => host.querySelector<HTMLButtonElement>('.explain-button')!.click());
    const full = host.querySelector('.expanded-sense-list .sense-bilingual')!;
    expect(full.classList.contains('paired-columns')).toBe(mode === 'bilingual');
    if (mode === 'bilingual') {
      expect(full.children[0].textContent).toBe('English 0');
      expect(full.children[1].textContent).toBe('Vietnamese 0');
    }
    expect(full.textContent).not.toContain('Unmatched gloss');
    expect(host.querySelector('.inspector-controls .inspector-sources')).toBeNull();
    expect(host.querySelector('.inspector-body>.inspector-footer .inspector-sources')).not.toBeNull();
    expect(host.querySelector('.inspector-controls .ai-explain-button')).not.toBeNull();
    expect(host.querySelector('.inspector-header-actions [aria-label="Add note"]')).not.toBeNull();
  } finally { act(() => render(null, host)); host.remove(); }
});

it.each(['en', 'vi', 'bilingual'] as const)('shows entry-level Vietnamese glosses immediately without inventing pairs (%s)', mode => {
  const host = document.createElement('div'); document.body.append(host);
  const noop = vi.fn();
  const result = { ...validLookup, dictionary: { word: 'obvious', surfaceForm: 'obvious', lemma: 'obvious', pronunciation: null, contextConfidence: 0, contextPos: 'adjective', senseStatus: 'common' as const,
    senses: [{ id: 'obvious-en', pos: 'adjective', definitionEn: 'easily perceived by the senses', meaningsVi: [], source: 'wordnet' as const, contextScore: 0, contextMatch: false }], unpairedMeaningsVi: ['Vietnamese entry gloss'] } };
  try {
    act(() => render(<LookupBottomSheet open result={result} loading={false} error={null} mode={mode} onModeChange={noop} onClose={noop} onOpenSettings={noop} onSpeak={noop} onToggleSave={noop} saved={false} />, host));
    expect(Boolean(host.querySelector('.entry-glosses'))).toBe(mode !== 'en');
    if (mode !== 'en') {
      expect(host.querySelector('.entry-glosses')?.textContent).toContain('Vietnamese entry gloss');
      expect(host.querySelector('.entry-glosses')?.closest('details')).toBeNull();
    }
    expect(Boolean(host.querySelector('.has-entry-glosses'))).toBe(mode === 'bilingual');
    expect(host.querySelector('.sense-row .sense-vi')).toBeNull();
    const body = host.querySelector('.inspector-body')!;
    expect(body.lastElementChild?.classList.contains('inspector-footer')).toBe(true);
    expect(host.querySelector('.inspector-header .inspector-sources')).toBeNull();
    expect(host.querySelector('.explain-direction path')?.getAttribute('d')).toBe('M3 8h10m-4-4 4 4-4 4');
  } finally { act(() => render(null, host)); host.remove(); }
});

it.each(['ambiguous', 'common', undefined] as const)('shows the close-sense note only for analyzed ambiguity (%s)', senseStatus => {
  const host = document.createElement('div');
  const senses = ['a', 'b'].map(id => ({ id, pos: 'verb', definitionEn: id, meaningsVi: [], source: 'wordnet' as const, contextScore: 0, contextMatch: false }));
  const result = { ...validLookup, dictionary: { word: 'think', surfaceForm: 'think', lemma: 'think', pronunciation: null, contextConfidence: 0, contextPos: 'verb', senseStatus, senses },
    lens: { ...validLookup.lens, selection: validLookup.lens?.selection ?? { status: 'exact', surface: 'think', normalized: 'think', lemma: 'think', matchedText: 'think', matchType: 'exact', candidates: [] }, sense: { id: 'a', alternatives: ['b'], reasons: [], diagnostics: senses.map(sense => ({ senseId: sense.id, score: 1, semanticScore: 1, reasons: [] })) } } as NonNullable<LookupResponse['lens']> };
  try {
    act(() => render(<QuickExplain result={result} mode="en" />, host));
    expect(host.textContent?.includes('Context is not strong enough')).toBe(senseStatus === 'ambiguous');
    act(() => render(<QuickExplain result={{ ...result, lens: undefined }} mode="en" />, host));
    expect(host.textContent).not.toContain('Context is not strong enough');
  } finally { act(() => render(null, host)); }
});

it('pins only on completed handle drag and preserves placement across selections, Full and reopen', () => {
  vi.stubGlobal('matchMedia', () => ({ matches: true, addEventListener: vi.fn(), removeEventListener: vi.fn() }));
  const host = document.createElement('div'); document.body.append(host);
  const noop = vi.fn(); const savedPlacement = vi.fn();
  let placement: import('./lookupPopupPlacement').LookupPopupPlacement = { mode: 'auto' };
  let display: 'popup' | 'panel' = 'popup'; let open = true; let selectionKey = 'one';
  const draw = () => render(<LookupBottomSheet open={open} displayMode={display} selectionKey={selectionKey}
    placement={placement} onPlacementChange={next => { savedPlacement(next); placement = next; draw(); }}
    anchor={{ left: 100, right: 140, top: 200, bottom: 220 }} result={validLookup} loading={false} error={null} mode="bilingual"
    onModeChange={noop} onClose={noop} onOpenSettings={noop} onSpeak={noop} onToggleSave={noop} saved={false} />, host);
  const pointer = (element: Element, type: string, x: number, y: number) => {
    // jsdom lacks onpointerdown properties; Preact retains the prop event casing there.
    const event = new Event(type.replace('pointer', 'Pointer').replace('down', 'Down').replace('move', 'Move').replace('up', 'Up'), { bubbles: true, cancelable: true });
    Object.assign(event, { pointerId: 1, clientX: x, clientY: y, button: 0, isPrimary: true });
    act(() => { element.dispatchEvent(event); });
  };
  try {
    act(() => { draw(); });
    const handle = host.querySelector<HTMLElement>('.lookup-drag-handle')!;
    handle.setPointerCapture = vi.fn(); handle.hasPointerCapture = () => true; handle.releasePointerCapture = vi.fn();
    const sheet = host.querySelector<HTMLElement>('.lookup-sheet')!;
    vi.spyOn(sheet, 'getBoundingClientRect').mockReturnValue({ left: 152, top: 172, width: 340, height: 520 } as DOMRect);
    pointer(host.querySelector('.save-inline')!, 'pointerdown', 160, 180);
    expect(handle.setPointerCapture).not.toHaveBeenCalled();
    window.getSelection()?.removeAllRanges();
    pointer(handle, 'pointerdown', 160, 180);
    expect(handle.setPointerCapture).toHaveBeenCalled();
    pointer(handle, 'pointermove', 360, 250);
    expect(savedPlacement).not.toHaveBeenCalled();
    pointer(handle, 'pointerup', 360, 250);
    expect(savedPlacement).toHaveBeenCalledTimes(1); expect(placement.mode).toBe('pinned');
    const position = sheet.style.left;
    selectionKey = 'two'; act(draw); expect(sheet.style.left).toBe(position);
    display = 'panel'; act(draw); expect(host.querySelector('.lookup-drag-handle')).toBeNull();
    display = 'popup'; act(draw); expect(sheet.style.left).toBe(position);
    open = false; act(draw); open = true; act(draw);
    expect(host.querySelector<HTMLElement>('.lookup-sheet')!.style.left).toBe(position);
    const selector = host.querySelector<HTMLSelectElement>('[aria-label="Popup position"]')!;
    act(() => { selector.value = 'auto'; selector.dispatchEvent(new Event('change', { bubbles: true })); });
    expect(placement).toEqual({ mode: 'auto' });
    expect(host.querySelector<HTMLElement>('.lookup-sheet')!.style.left).toBe('152px');
  } finally { act(() => render(null, host)); host.remove(); vi.unstubAllGlobals(); }
});
it('ignores pinned placement and hides drag controls on mobile', () => {
  vi.stubGlobal('matchMedia', () => ({ matches: false, addEventListener: vi.fn(), removeEventListener: vi.fn() }));
  const host = document.createElement('div'); document.body.append(host); const noop = vi.fn();
  try {
    act(() => render(<LookupBottomSheet open placement={{ mode: 'pinned', xRatio: 1, yRatio: 1 }} onPlacementChange={noop}
      result={validLookup} loading={false} error={null} mode="bilingual" onModeChange={noop} onClose={noop}
      onOpenSettings={noop} onSpeak={noop} onToggleSave={noop} saved={false} />, host));
    expect(host.querySelector('.lookup-drag-handle')).toBeNull();
    expect(host.querySelector('[aria-label="Popup position"]')).toBeNull();
    expect(host.querySelector<HTMLElement>('.lookup-sheet')!.style.left).toBe('');
  } finally { act(() => render(null, host)); host.remove(); vi.unstubAllGlobals(); }
});

it.each([false, true])('shares Simple languages and preserves result, scroll and Full transition (desktop=%s)', desktop => {
  vi.stubGlobal('matchMedia', () => ({ matches: desktop, addEventListener: vi.fn(), removeEventListener: vi.fn() }));
  const host = document.createElement('div'); document.body.append(host);
  const fetchSpy = vi.fn(); vi.stubGlobal('fetch', fetchSpy);
  const noop = vi.fn(); const explain = vi.fn(); const translate = vi.fn();
  const result = { ...validLookup, dictionary: { word: 'maintain', surfaceForm: 'maintain', lemma: 'maintain', pronunciation: null, contextConfidence: 0, contextPos: 'verb',
    senses: ['verb', 'verb', 'verb', 'noun'].map((pos, i) => ({ id: String(i), pos, definitionEn: `English ${i}`, meaningsVi: [`Vietnamese ${i}`], source: 'local' as const, contextScore: 0, contextMatch: false })), unpairedMeaningsVi: ['fallback 1', 'fallback 2', 'fallback 3'] } };
  let quickMode: 'simple' | 'standard' = 'simple'; let mode: 'en' | 'vi' | 'bilingual' = 'bilingual';
  const draw = () => render(<LookupBottomSheet open result={result} quickMode={quickMode} onQuickModeChange={next => { quickMode = next; draw(); }}
    loading={false} error={null} mode={mode} onModeChange={next => { mode = next; draw(); }} onClose={noop} onOpenSettings={noop}
    onSpeak={noop} onAddNote={noop} onToggleSave={noop} onExplain={explain} onTranslateSentence={translate} saved={false} />, host);
  try {
    act(draw);
    for (const label of ['Pronounce word', 'Save word', 'Add note', 'Show more']) expect(host.querySelector(`[aria-label="${label}"]`)).not.toBeNull();
    expect(host.querySelector('.inspector-word-title strong')?.textContent).toBe(result.selection.surface);
    expect(host.querySelector('.pos-chip')?.textContent).toBe('verb');
    expect(host.querySelector('.language-cycle')?.closest('details')).not.toBeNull();
    for (const expected of ['bilingual', 'en', 'vi'] as const) {
      expect(mode).toBe(expected);
      expect(host.querySelectorAll('.sense-row')).toHaveLength(4);
      expect(host.querySelectorAll('.sense-row .sense-definition')).toHaveLength(expected === 'vi' ? 0 : 4);
      expect(host.querySelectorAll('.sense-row .sense-vi')).toHaveLength(expected === 'en' ? 0 : 4);
      expect(host.querySelector('.entry-glosses')).toBeNull();
      act(() => host.querySelector<HTMLButtonElement>('.language-cycle')!.click());
    }
    const body = host.querySelector<HTMLElement>('.inspector-body')!; body.scrollTop = 25;
    act(() => host.querySelector<HTMLButtonElement>('.quick-mode-toggle')!.click());
    expect(host.querySelector('.lookup-sheet')?.getAttribute('data-quick-mode')).toBe('standard');
    expect(host.querySelectorAll('.sense-row')).toHaveLength(3);
    expect(host.querySelector('.entry-glosses')?.textContent).toContain('fallback 3');
    expect(body.scrollTop).toBe(25);
    act(() => host.querySelector<HTMLButtonElement>('.quick-mode-toggle')!.click());
    act(() => host.querySelector<HTMLButtonElement>('[aria-label="Show more"]')!.click());
    expect(host.querySelector('.lookup-sheet.expanded')).not.toBeNull();
    expect(host.querySelector('.quick-mode-toggle')).toBeNull();
    act(() => host.querySelector<HTMLButtonElement>('[aria-label="Show less"]')!.click());
    expect(host.querySelector('.lookup-sheet.quick')?.getAttribute('data-quick-mode')).toBe('simple');
    expect(fetchSpy).not.toHaveBeenCalled(); expect(explain).not.toHaveBeenCalled(); expect(translate).not.toHaveBeenCalled();
  } finally { act(() => render(null, host)); host.remove(); vi.unstubAllGlobals(); }
});
it('limits truthful unpaired Simple fallback without losing Standard glosses', () => {
  const host = document.createElement('div');
  const result = { ...validLookup, dictionary: { word: 'word', surfaceForm: 'word', lemma: 'word', pronunciation: null, contextConfidence: 0, senses: [], unpairedMeaningsVi: ['one', 'two', 'three'] } };
  act(() => render(<QuickExplain result={result} mode="vi" presentation="simple" />, host));
  expect(host.querySelectorAll('.entry-glosses li')).toHaveLength(3);
  act(() => render(<QuickExplain result={result} mode="vi" presentation="standard" />, host));
  expect(host.querySelectorAll('.entry-glosses li')).toHaveLength(3);
  act(() => render(null, host));
});

it.each(['en', 'vi', 'bilingual'] as const)('adapts Simple coverage to visible text in %s', mode => {
  const host = document.createElement('div');
  for (const [length, count] of [[220, 3], [130, 4], [20, 6]]) {
    const result = { ...validLookup, dictionary: { ...validLookup.dictionary!, contextPos: 'verb', senseStatus: 'context' as const,
      senses: Array.from({ length: 9 }, (_, i) => ({ id: String(i), pos: i < 4 ? 'verb' : 'noun', definitionEn: `${i} ${'x'.repeat(length)}`, meaningsVi: [`${i} ${'y'.repeat(length)}`], source: 'local' as const, contextMatch: i === 0, contextScore: 0 })) } };
    act(() => render(<QuickExplain result={result} mode={mode} presentation="simple" />, host));
    expect(host.querySelectorAll('.sense-row')).toHaveLength(count - 1);
    expect(host.querySelector('.inspector-context')?.textContent).toContain('0 ');
    expect(host.querySelector('.quick-more-meanings')).toBeNull();
    if (count === 6) expect(host.querySelector('.sense-list')?.textContent).toContain('noun');
  }
  act(() => render(null, host));
});
