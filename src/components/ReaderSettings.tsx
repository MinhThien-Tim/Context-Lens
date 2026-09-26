import { useDialog } from './useDialog';
import type { AppPreferences } from '../db/database';

export function ReaderSettings({ value, onChange, onClose }: { value: AppPreferences; onChange: (value: AppPreferences) => void; onClose: () => void }) {
  const ref = useDialog(onClose, true, false);
  const set = <K extends keyof AppPreferences>(key: K, next: AppPreferences[K]) => onChange({ ...value, [key]: next });
  return (
    <section ref={ref} role="dialog" class="popover settings-popover" aria-label="Reader settings">
      <div class="popover-title"><strong>Reading and appearance</strong><button class="icon-button" onClick={onClose} aria-label="Close reader settings">×</button></div>
      <fieldset class="settings-group"><legend>Interface</legend><div class="segmented">
        {(['simple', 'advanced'] as const).map(mode => <button aria-pressed={value.interfaceMode === mode} class={value.interfaceMode === mode ? 'active' : ''} onClick={() => set('interfaceMode', mode)}>{mode === 'simple' ? 'Simple' : 'Advanced'}</button>)}
      </div></fieldset>
      <label>Text size <input type="range" min="16" max="26" value={value.fontSize} onInput={(event) => set('fontSize', Number(event.currentTarget.value))} /></label>
      <label>Line height <input type="range" min="1.4" max="2.1" step="0.05" value={value.lineHeight} onInput={(event) => set('lineHeight', Number(event.currentTarget.value))} /></label>
      <div class="segmented">
        <button aria-pressed={value.fontFamily === 'serif'} class={value.fontFamily === 'serif' ? 'active' : ''} onClick={() => set('fontFamily', 'serif')}>Serif</button>
        <button aria-pressed={value.fontFamily === 'sans'} class={value.fontFamily === 'sans' ? 'active' : ''} onClick={() => set('fontFamily', 'sans')}>Sans</button>
      </div>
      <fieldset class="settings-group"><legend>Appearance</legend><div class="segmented">
        {(['system', 'light', 'dark'] as const).map((theme) => <button key={theme} aria-pressed={value.theme === theme} class={value.theme === theme ? 'active' : ''} onClick={() => set('theme', theme)}>{theme.charAt(0).toUpperCase() + theme.slice(1)}</button>)}
      </div></fieldset>
    </section>
  );
}
