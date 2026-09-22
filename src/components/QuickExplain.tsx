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
            {result.lens?.selection.status === 'base-form' && <p>Base form: <strong>{result.selection.lemma}</strong></p>}
            {result.lens?.selection.status === 'reconstructed' && <p>Detected as part of: <strong>{result.lens.selection.reconstructedToken}</strong></p>}
            {result.lens?.selection.status === 'fragment-or-unknown' && <p>This selection may be part of another word.</p>}
            {['subphrase', 'head'].includes(result.lens?.selection.matchType ?? '') && <p>Meaning shown for: <strong>{result.lens?.selection.matchedText}</strong></p>}
            {showEn && <div><small>English definition</small><p class="meaning-en">{result.quick.definition_en || 'Not found in the local dictionary.'}</p></div>}
            {showVi && <div><small>{result.lens?.vietnamese?.senseAligned === false ? 'Vietnamese dictionary meanings' : 'Vietnamese'}</small><p class="meaning-vi">{result.quick.meaning_vi.length ? result.quick.meaning_vi.join(' · ') : 'No local meaning found.'}</p></div>}
            {result.quick.lexical_unit && (
              <div class="lexical-unit">
                <span>In this sentence</span>
                <strong>{result.quick.lexical_unit.text}</strong>
                <p>→ {showVi ? result.quick.lexical_unit.meaning_vi : result.quick.lexical_unit.meaning_en}</p>
              </div>
            )}
  </>;
}
