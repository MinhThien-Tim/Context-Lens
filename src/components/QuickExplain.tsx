import { useState } from 'preact/hooks';
import type { LanguageMode, LookupResponse } from '../lookup/types';
import { compactDictionarySenses, pairDictionarySenses, prioritizeDictionarySenses } from './dictionaryDisplay';

export function QuickExplain({ result, mode, expanded = false }: { result: LookupResponse; mode: LanguageMode; expanded?: boolean }) {
  const selectionKey = `${result.selection.surface}\n${result.context.sentence}`;
  const [meaningExpansion, setMeaningExpansion] = useState({ key: selectionKey, open: false });
  const showAllMeanings = meaningExpansion.key === selectionKey && meaningExpansion.open;
  const showEn = mode !== 'vi', showVi = mode !== 'en';
  const senses = prioritizeDictionarySenses(pairDictionarySenses(result.dictionary?.senses ?? []), result.dictionary?.contextPos);
  const compact = compactDictionarySenses(senses, result.dictionary?.contextPos);
  const visible = showAllMeanings && !expanded ? senses : compact;
  const matched = senses.find(sense => sense.contextMatch);
  const summaryText = result.lens?.phrase?.canonical ?? result.selection.surface;
  const unpaired = result.dictionary?.unpairedMeaningsVi ?? [];
  const senseStatus = result.dictionary?.senseStatus ?? (matched ? 'context' : 'ambiguous');
  const senseConfidence = result.dictionary?.senseConfidence ?? matched?.contextScore;
  return <div class={`quick-explanation${expanded ? ' is-expanded' : ''}`}>
    <header class="lookup-heading"><div><div class="word-line"><strong>{result.selection.surface}</strong>
      {result.selection.part_of_speech && <span class="pos-chip">{result.selection.part_of_speech}</span>}</div>
      {result.selection.ipa_uk && <p class="ipa-line">{result.selection.ipa_uk}</p>}</div></header>
    {result.lens?.selection.status === 'base-form' && <p class="lookup-note">Base form: <strong>{result.selection.lemma}</strong></p>}
    {result.lens?.selection.status === 'reconstructed' && <p class="lookup-note">Detected as part of: <strong>{result.lens.selection.reconstructedToken}</strong></p>}
    {result.lens?.selection.status === 'fragment-or-unknown' && <p class="lookup-note">This selection may be part of another word.</p>}
    {['subphrase', 'head'].includes(result.lens?.selection.matchType ?? '') && <p class="lookup-note">Meaning shown for: <strong>{result.lens?.selection.matchedText}</strong></p>}
    {matched?.meaningsVi.length && showVi && <p class="context-summary"><strong>{summaryText}</strong><span>→</span><strong>{matched.meaningsVi[0]}</strong></p>}
    {result.dictionary?.contextPos && <p class={`context-hint${matched ? ' matched' : ''}`}>
      {senseStatus === 'context' ? <><span>✓</span>{senseConfidence !== undefined && Number.isFinite(senseConfidence) &&
        <span class="context-confidence" title="Độ tin cậy về nghĩa">{Math.round(Math.max(0, Math.min(1, senseConfidence)) * 100)}%</span>} Nghĩa trong câu</>
        : senseStatus === 'common' ? 'Nghĩa thường dùng' : 'Có nhiều cách hiểu'} · {shortPos(result.dictionary.contextPos)}</p>}
    {visible.length ? <div class={`bilingual-sense-layout${showEn && showVi && unpaired.length ? ' has-unpaired' : ''}`}>
      <div class="sense-list">{visible.map(sense => <div class={`sense-row${sense.contextMatch ? ' context-match' : ''}`} key={sense.id}>
        <span class="sense-pos">{shortPos(sense.pos)}</span>{sense.source !== 'local' && <span class="web-badge">.web</span>}
        <div class="sense-bilingual">
          {showEn && sense.definitionEn && <span class="sense-definition">{sense.definitionEn}</span>}
          {showVi && sense.meaningsVi.length > 0 && <span class="sense-vi">{sense.meaningsVi.join('; ')}</span>}
        </div>
      </div>)}</div>
      {showVi && unpaired.length > 0 && <section class="unpaired-meanings" aria-label="Nghĩa tiếng Việt">
        <span class="unpaired-label">Nghĩa tiếng Việt</span>
        <ul>{unpaired.slice(0, showAllMeanings || expanded ? undefined : 4).map(meaning => <li key={meaning}>{meaning}</li>)}</ul>
        {!showAllMeanings && !expanded && unpaired.length > 4 && <span class="unpaired-more">+{unpaired.length - 4} nghĩa Việt</span>}
      </section>}
    </div> : <LegacyMeanings result={result} showEn={showEn} showVi={showVi} />}
    {!expanded && senses.length > compact.length && <button class="more-meanings" aria-expanded={showAllMeanings} onClick={() => setMeaningExpansion({ key: selectionKey, open: !showAllMeanings })}>
      {showAllMeanings ? 'Thu gọn nghĩa' : `Mở thêm ${senses.length - compact.length} nghĩa`}
    </button>}
    {expanded && senses.length > compact.length && <p class="more-meanings">Còn {senses.length - compact.length} nghĩa ở tầng mở rộng</p>}
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
