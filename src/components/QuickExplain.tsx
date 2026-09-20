import type { LanguageMode, LookupResponse } from '../lookup/types';
export function QuickExplain({ result, mode, expanded = false }: { result: LookupResponse; mode: LanguageMode; expanded?: boolean }) {
  const showEn = mode !== 'vi', showVi = mode !== 'en';
  return <>
            <header class="lookup-heading">
              <div>
                <div class="word-line"><strong>{result.selection.surface}</strong></div>
                <p>{[result.selection.part_of_speech, result.selection.ipa_uk].filter(Boolean).join(' · ')}</p>
              </div>

            </header>
            {showEn && <div><small>English definition</small><p class="meaning-en">{result.quick.definition_en || 'No English definition is available for this selection yet.'}</p></div>}
            {showVi && <div><small>{result.lens?.vietnamese?.senseAligned === false ? 'Vietnamese dictionary meanings' : 'Vietnamese'}</small><p class="meaning-vi">{result.quick.meaning_vi.length ? result.quick.meaning_vi.join(' · ') : 'Chưa có nghĩa tiếng Việt cho lựa chọn này.'}</p></div>}
            {result.quick.lexical_unit && (
              <div class="lexical-unit">
                <span>In this sentence</span>
                <strong>{result.quick.lexical_unit.text}</strong>
                <p>→ {showVi ? result.quick.lexical_unit.meaning_vi : result.quick.lexical_unit.meaning_en}</p>
              </div>
            )}
  </>;
}
