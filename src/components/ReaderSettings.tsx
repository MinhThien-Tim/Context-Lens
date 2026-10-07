import { useDialog } from './useDialog';
import type { AppPreferences } from '../db/database';

const readingPresets = {
  book: { fontSize: 20, lineHeight: 1.85, fontFamily: 'serif', readingMargin: 'comfortable', theme: 'system' },
  news: { fontSize: 18, lineHeight: 1.65, fontFamily: 'sans', readingMargin: 'narrow', theme: 'light' },
  academic: { fontSize: 19, lineHeight: 1.75, fontFamily: 'serif', readingMargin: 'wide', theme: 'system' }
} as const satisfies Record<string, Pick<AppPreferences, 'fontSize' | 'lineHeight' | 'fontFamily' | 'readingMargin' | 'theme'>>;

function selectedPreset(value: AppPreferences): keyof typeof readingPresets | null {
  return (Object.keys(readingPresets) as (keyof typeof readingPresets)[]).find(key =>
    Object.entries(readingPresets[key]).every(([field, presetValue]) => value[field as keyof AppPreferences] === presetValue)
  ) ?? null;
}

export function ReaderSettings({ value, onChange, onClose }: { value: AppPreferences; onChange: (value: AppPreferences) => void; onClose: () => void }) {
  const ref = useDialog(onClose, true, false);
  const set = <K extends keyof AppPreferences>(key: K, next: AppPreferences[K]) => onChange({ ...value, [key]: next });
  const preset = selectedPreset(value);
  const applyPreset = (key: keyof typeof readingPresets) => onChange({ ...value, ...readingPresets[key] });
  return (
    <section ref={ref} role="dialog" class="popover settings-popover" aria-label="Reader settings">
      <div class="popover-title"><strong>Reading and appearance</strong><button class="icon-button" onClick={onClose} aria-label="Close reader settings">×</button></div>
      <fieldset class="settings-group reader-presets"><legend>Reading preset</legend><div class="segmented" role="group" aria-label="Reading preset">
        {(Object.keys(readingPresets) as (keyof typeof readingPresets)[]).map(key => <button aria-pressed={preset === key} class={preset === key ? 'active' : ''} onClick={() => applyPreset(key)}>{key === 'academic' ? 'Academic' : key.charAt(0).toUpperCase() + key.slice(1)}</button>)}
      </div></fieldset>
      <fieldset class="settings-group"><legend>Interface</legend><div class="segmented">
        {/* ARCH-2: the Simple/Advanced density control is gone with `interfaceMode`. The group is
            kept so the panel keeps its "Interface" heading slot until P3 replaces this panel with
            Appearance, Colours and Font (APP-6); Theme owns this panel from P2b (THEME-1). */}
      </div></fieldset>
      <div class="reader-range"><label htmlFor="reader-font-size">Text size</label><output aria-live="polite">{value.fontSize}px</output><input id="reader-font-size" aria-label="Text size" type="range" min="16" max="26" value={value.fontSize} onInput={(event) => set('fontSize', Number(event.currentTarget.value))} /></div>
      <div class="reader-range"><label htmlFor="reader-line-height">Line height</label><output aria-live="polite">{value.lineHeight.toFixed(2)}</output><input id="reader-line-height" aria-label="Line height" type="range" min="1.4" max="2.1" step="0.05" value={value.lineHeight} onInput={(event) => set('lineHeight', Number(event.currentTarget.value))} /></div>
      <fieldset class="settings-group"><legend>Page margin</legend><div class="segmented">
        {(['narrow', 'comfortable', 'wide'] as const).map(margin => <button aria-pressed={value.readingMargin === margin} class={value.readingMargin === margin ? 'active' : ''} onClick={() => set('readingMargin', margin)}>{margin === 'narrow' ? 'Narrow' : margin === 'wide' ? 'Wide' : 'Comfort'}</button>)}
      </div></fieldset>
      <fieldset class="settings-group"><legend>Font</legend><div class="segmented">
        <button aria-pressed={value.fontFamily === 'serif'} class={value.fontFamily === 'serif' ? 'active' : ''} onClick={() => set('fontFamily', 'serif')}>Serif</button>
        <button aria-pressed={value.fontFamily === 'sans'} class={value.fontFamily === 'sans' ? 'active' : ''} onClick={() => set('fontFamily', 'sans')}>Sans</button>
      </div></fieldset>
      <fieldset class="settings-group"><legend>Appearance</legend><div class="segmented">
        {(['system', 'light', 'dark'] as const).map(theme => <button key={theme} aria-pressed={value.theme === theme} class={value.theme === theme ? 'active' : ''} onClick={() => set('theme', theme)}>{theme.charAt(0).toUpperCase() + theme.slice(1)}</button>)}
      </div></fieldset>
    </section>
  );
}
