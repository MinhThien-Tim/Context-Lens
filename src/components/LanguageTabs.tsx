import type { LanguageMode } from '../lookup/types';

export function LanguageTabs({ value, onChange }: { value: LanguageMode; onChange: (mode: LanguageMode) => void }) {
  return (
    <div class="language-tabs" role="group" aria-label="Explanation language">
      {([['en', 'EN'], ['vi', 'VI'], ['bilingual', 'EN + VI']] as const).map(([mode, label]) => (
        <button key={mode} class={value === mode ? 'active' : ''} aria-pressed={value === mode} onClick={() => onChange(mode)}>{label}</button>
      ))}
    </div>
  );
}
