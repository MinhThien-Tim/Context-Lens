import type { LanguageMode } from '../lookup/types';

const languages = [['en', 'EN'], ['vi', 'VI'], ['bilingual', 'EN + VI']] as const;

export function LanguageTabs({ value, onChange, compact = false }: { value: LanguageMode; onChange: (mode: LanguageMode) => void; compact?: boolean }) {
  if (compact) {
    const index = languages.findIndex(([mode]) => mode === value);
    const next = languages[(index + 1) % languages.length];
    return <button class="language-cycle" title={`Switch to ${next[1]}`} aria-label={`Explanation language: ${languages[index][1]}. Switch to ${next[1]}`} onClick={() => onChange(next[0])}>
      {languages[index][1].replaceAll(' ', '')} <span aria-hidden="true">↻</span>
    </button>;
  }
  return (
    <div class="language-tabs" role="group" aria-label="Explanation language">
      {languages.map(([mode, label]) => (
        <button key={mode} class={value === mode ? 'active' : ''} aria-pressed={value === mode} onClick={() => onChange(mode)}>{label}</button>
      ))}
    </div>
  );
}
