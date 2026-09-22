import type { LanguageMode, LookupResponse } from '../lookup/types';

export function QuickExplain({ result, mode, expanded = false }: { result: LookupResponse; mode: LanguageMode; expanded?: boolean }) {
  const showEn = mode !== 'vi', showVi = mode !== 'en';
  return <div class={`quick-explanation${expanded ? ' is-expanded' : ''}`}>
    <header class="lookup-heading">
      <div>
        <div class="word-line">
          <strong>{result.selection.surface}</strong>
          {result.selection.part_of_speech && <span class="pos-chip">{result.selection.part_of_speech}</span>}
        </div>
        {result.selection.ipa_uk && <p class="ipa-line">{result.selection.ipa_uk}</p>}
      </div>
    </header>
    {result.lens?.selection.status === 'base-form' && <p class="lookup-note">Base form: <strong>{result.selection.lemma}</strong></p>}
    {result.lens?.selection.status === 'reconstructed' && <p class="lookup-note">Detected as part of: <strong>{result.lens.selection.reconstructedToken}</strong></p>}
    {result.lens?.selection.status === 'fragment-or-unknown' && <p class="lookup-note">This selection may be part of another word.</p>}
    {['subphrase', 'head'].includes(result.lens?.selection.matchType ?? '') && <p class="lookup-note">Meaning shown for: <strong>{result.lens?.selection.matchedText}</strong></p>}
    {showEn && <div class="definition-block"><small>English definition</small><p class="meaning-en">{result.quick.definition_en || 'Not found in the local dictionary.'}</p></div>}
    {showVi && <div class="definition-block"><small>{result.lens?.vietnamese?.senseAligned === false ? 'Vietnamese dictionary meanings' : 'Vietnamese'}</small><p class="meaning-vi">{result.quick.meaning_vi.length ? result.quick.meaning_vi.join(' · ') : 'No local meaning found.'}</p></div>}
    {result.quick.lexical_unit && <div class="lexical-unit">
      <span class="lexical-label">In this sentence</span>
      <strong>{result.quick.lexical_unit.text}</strong>
      <p>→ {showVi ? result.quick.lexical_unit.meaning_vi : result.quick.lexical_unit.meaning_en}</p>
    </div>}
  </div>;
}
