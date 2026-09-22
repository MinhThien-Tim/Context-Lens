import type { LanguageMode, LookupResponse } from '../lookup/types';
import { compactDictionarySenses, pairDictionarySenses } from './dictionaryDisplay';

export function QuickExplain({ result, mode, expanded = false }: { result: LookupResponse; mode: LanguageMode; expanded?: boolean }) {
  const showEn = mode !== 'vi', showVi = mode !== 'en';
  const senses = pairDictionarySenses(result.dictionary?.senses ?? []);
  const visible = compactDictionarySenses(senses);
  return <div class={`quick-explanation${expanded ? ' is-expanded' : ''}`}>
    <header class="lookup-heading"><div><div class="word-line"><strong>{result.selection.surface}</strong>
      {result.selection.part_of_speech && <span class="pos-chip">{result.selection.part_of_speech}</span>}</div>
      {result.selection.ipa_uk && <p class="ipa-line">{result.selection.ipa_uk}</p>}</div></header>
    {result.lens?.selection.status === 'base-form' && <p class="lookup-note">Base form: <strong>{result.selection.lemma}</strong></p>}
    {result.lens?.selection.status === 'reconstructed' && <p class="lookup-note">Detected as part of: <strong>{result.lens.selection.reconstructedToken}</strong></p>}
    {result.lens?.selection.status === 'fragment-or-unknown' && <p class="lookup-note">This selection may be part of another word.</p>}
    {['subphrase', 'head'].includes(result.lens?.selection.matchType ?? '') && <p class="lookup-note">Meaning shown for: <strong>{result.lens?.selection.matchedText}</strong></p>}
    {result.dictionary?.contextPos && <p class={`context-hint${visible.some(sense => sense.contextMatch) ? ' matched' : ''}`}>
      {visible.some(sense => sense.contextMatch) ? '✓ Context' : 'Context'} · {shortPos(result.dictionary.contextPos)}</p>}
    {visible.length ? <div class="sense-list">{visible.map(sense => <div class={`sense-row${sense.contextMatch ? ' context-match' : ''}`} key={sense.id}>
      <span class="sense-pos">{shortPos(sense.pos)}</span>{sense.source !== 'local' && <span class="web-badge">.web</span>}
      <div class="sense-bilingual">
        {showEn && sense.definitionEn && <span class="sense-definition">{sense.definitionEn}</span>}
        {showVi && sense.meaningsVi.length > 0 && <span class="sense-vi">{sense.meaningsVi.join('; ')}</span>}
      </div>
    </div>)}</div> : <LegacyMeanings result={result} showEn={showEn} showVi={showVi} />}
    {senses.length > visible.length && <p class="more-meanings">Còn {senses.length - visible.length} nghĩa ở tầng mở rộng</p>}
    {result.quick.lexical_unit && <div class="lexical-unit"><span class="lexical-label">In this sentence</span>
      <strong>{result.quick.lexical_unit.text}</strong><p>→ {showVi ? result.quick.lexical_unit.meaning_vi : result.quick.lexical_unit.meaning_en}</p></div>}
  </div>;
}

function LegacyMeanings({ result, showEn, showVi }: { result: LookupResponse; showEn: boolean; showVi: boolean }) {
  return <>{showEn && <p class="meaning-en">{result.quick.definition_en || 'Not found in the local dictionary.'}</p>}
    {showVi && <p class="meaning-vi">{result.quick.meaning_vi.length ? result.quick.meaning_vi.join(' · ') : 'No definition found.'}</p>}</>;
}

function shortPos(pos: string): string {
  const value = pos.toLocaleLowerCase();
  return value.includes('verb') ? 'v.' : value.includes('noun') ? 'n.' : value.includes('adjective') ? 'adj.' : value.includes('adverb') ? 'adv.' : pos;
}
