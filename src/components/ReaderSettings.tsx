import { useDialog } from './useDialog';
import type { AppPreferences } from '../db/database';

export function ReaderSettings({ value, onChange, onClose }: { value: AppPreferences; onChange: (value: AppPreferences) => void; onClose: () => void }) {
  const ref = useDialog(onClose, true, false);
  const set = <K extends keyof AppPreferences>(key: K, next: AppPreferences[K]) => onChange({ ...value, [key]: next });
  return (
    <section ref={ref} role="dialog" class="popover settings-popover" aria-label="Reader settings">
      <div class="popover-title"><strong>Text and theme</strong><button class="icon-button" onClick={onClose} aria-label="Close reader settings">×</button></div>
      <label>Text size <input type="range" min="16" max="26" value={value.fontSize} onInput={(event) => set('fontSize', Number(event.currentTarget.value))} /></label>
      <label>Line height <input type="range" min="1.4" max="2.1" step="0.05" value={value.lineHeight} onInput={(event) => set('lineHeight', Number(event.currentTarget.value))} /></label>
      <div class="segmented">
        <button aria-pressed={value.fontFamily === 'serif'} class={value.fontFamily === 'serif' ? 'active' : ''} onClick={() => set('fontFamily', 'serif')}>Serif</button>
        <button aria-pressed={value.fontFamily === 'sans'} class={value.fontFamily === 'sans' ? 'active' : ''} onClick={() => set('fontFamily', 'sans')}>Sans</button>
      </div>
      <div class="segmented">
        {(['light', 'system', 'dark'] as const).map((theme) => <button key={theme} aria-pressed={value.theme === theme} class={value.theme === theme ? 'active' : ''} onClick={() => set('theme', theme)}>{theme}</button>)}
      </div>
    </section>
  );
}
