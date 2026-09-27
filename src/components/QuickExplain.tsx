import { useState } from 'preact/hooks';
import type { LanguageMode, LookupResponse } from '../lookup/types';
import { compactDictionarySenses, pairDictionarySenses, prioritizeDictionarySenses, unpairedVietnameseMeanings } from './dictionaryDisplay';

export function QuickExplain({ result, mode, expanded = false }: { result: LookupResponse; mode: LanguageMode; expanded?: boolean }) {
  const selectionKey = `${result.selection.surface}\n${result.context.sentence}`;
  const [meaningExpansion, setMeaningExpansion] = useState({ key: selectionKey, open: false });
  const more = meaningExpansion.key === selectionKey && meaningExpansion.open;
  const showEn = mode !== 'vi', showVi = mode !== 'en';
  const all = prioritizeDictionarySenses(pairDictionarySenses(result.dictionary?.senses ?? []), result.dictionary?.contextPos);
  const matched = all.find(sense => sense.contextMatch && !['common', 'ambiguous'].includes(result.dictionary?.senseStatus ?? 'context'));
  const diagnostics = result.lens?.sense?.diagnostics ?? [];
  const samePos = all.filter(sense => sense.pos && sense.pos === result.dictionary?.contextPos);
  const scores = samePos.map(sense => diagnostics.find(item => item.senseId === sense.id)).filter(item => item !== undefined);
  const topScore = Math.max(0, ...scores.map(item => item.semanticScore));
  const closeMeanings = result.dictionary?.senseStatus === 'ambiguous'
    && scores.filter(item => item.semanticScore >= topScore - 1 && !item.reasons.includes('Explicit grammar pattern: HARD_CONFLICT')).length > 1;
  const ordinary = all.filter(sense => sense !== matched && ((showEn && sense.definitionEn) || (showVi && sense.meaningsVi.length)));
  const compact = compactDictionarySenses(ordinary, result.dictionary?.contextPos);
  const longMeanings = compact.some(sense => (showEn && sense.definitionEn.length > 180) || (showVi && sense.meaningsVi.join('; ').length > 180));
  const canExpand = ordinary.length > compact.length || longMeanings;
  const visible = expanded ? [] : more ? ordinary : compact;
  const unpaired = unpairedVietnameseMeanings(result);
  const entryGlossColumn = showEn && showVi && unpaired.length > 0 && visible.some(sense => sense.definitionEn) && !all.some(sense => sense.meaningsVi.length > 0);
  const renderSense = (sense: typeof all[number]) => <div class={`sense-bilingual ${showEn && showVi && sense.definitionEn && sense.meaningsVi.length > 0 ? 'paired-columns' : ''}`}>
    {showEn && sense.definitionEn && <span class={`sense-definition${sense.definitionEn.length > 180 ? ' long-meaning' : ''}`}>{sense.definitionEn}</span>}
    {showVi && sense.meaningsVi.length > 0 && <span class={`sense-vi${sense.meaningsVi.join('; ').length > 180 ? ' long-meaning' : ''}`}>{sense.meaningsVi.join('; ')}</span>}
  </div>;
  return <div class={`quick-explanation${expanded ? ' is-expanded' : ''}${!more ? ' is-compact' : ''}`} data-language={mode}>
    {result.lens?.selection.status === 'reconstructed' && <p class="lookup-note">Detected as part of: <strong>{result.lens.selection.reconstructedToken}</strong></p>}
    {result.lens?.selection.status === 'fragment' && <p class="lookup-note">This selection is only part of a longer word.</p>}
    {['subphrase', 'head'].includes(result.lens?.selection.matchType ?? '') && <p class="lookup-note">Meaning shown for: <strong>{result.lens?.selection.matchedText}</strong></p>}
    {closeMeanings && <p class="lookup-note" role="note">{showEn && <span>Context is not strong enough to distinguish these closely related meanings.</span>}{showEn && showVi && <br />}{showVi && <span>Ngữ cảnh chưa đủ để phân biệt chắc chắn các nghĩa gần nhau.</span>}</p>}
    {matched && ((showEn && matched.definitionEn) || (showVi && matched.meaningsVi.length > 0)) && <section class="inspector-context" aria-label="Context meaning"><h3>Context <span class="sense-pos">{matched.pos}</span></h3>{renderSense(matched)}</section>}
    {!expanded && (visible.length > 0 || (showVi && unpaired.length > 0)) && <section class="inspector-meanings">
      {matched ? <h3>Other meanings</h3> : <p class="quick-sense-status">{result.dictionary?.senseStatus === 'common' ? 'Common meaning' : 'Multiple possible meanings'}{result.dictionary?.contextPos && <> {'\u00b7'} {result.dictionary.contextPos}</>}</p>}
      <div class={`quick-meaning-table ${entryGlossColumn ? 'has-entry-glosses' : ''} ${showEn && showVi && (visible.some(sense => sense.meaningsVi.length > 0) || unpaired.length > 0) ? 'has-bilingual-content' : ''}`}>
        {visible.length > 0 && <div class="sense-list">{[...new Set(visible.map(sense => sense.pos))].map(pos => <section class="quick-pos-group" key={pos}><h4 class="sense-pos">{pos}</h4>{visible.filter(sense => sense.pos === pos).map(sense => <div class="sense-row" key={sense.id}>{renderSense(sense)}</div>)}</section>)}
          {canExpand && <button class="quick-more-meanings" aria-expanded={more} onClick={() => setMeaningExpansion({ key: selectionKey, open: !more })}>{more ? 'Fewer meanings' : `More meanings${ordinary.length > compact.length ? ` (${ordinary.length - compact.length})` : ''}`}</button>}
        </div>}
        {showVi && unpaired.length > 0 && <section class="entry-glosses unpaired-meanings" aria-label="Entry-level Vietnamese meanings"><h4>Vietnamese meanings <small>Entry level · chưa ghép nghĩa Anh</small></h4><ul>{unpaired.map(meaning => <li key={meaning}>{meaning}</li>)}</ul></section>}
      </div>
    </section>}
    {!expanded && all.length > 0 && !visible.length && !((showEn && matched?.definitionEn) || (showVi && matched?.meaningsVi.length)) && !(showVi && unpaired.length) && <p class="lookup-note">No definition available in this language.</p>}
    {!all.length && <div class="legacy-meanings">
      {showVi && result.quick.meaning_vi.length > 0 && <p class="meaning-vi">{result.quick.meaning_vi.join('; ')}</p>}
      {showEn && result.quick.definition_en && <p class="meaning-en">{result.quick.definition_en}</p>}
      {!(showEn && result.quick.definition_en) && !(showVi && result.quick.meaning_vi.length) && !(showVi && unpaired.length) && <p class="lookup-note">No definition available in this language.</p>}
    </div>}

    {result.quick.lexical_unit && <section class="lexical-unit"><h3>In this sentence</h3><strong>{result.quick.lexical_unit.text}</strong>
      {showVi && result.quick.lexical_unit.meaning_vi && <p class="sense-vi">{result.quick.lexical_unit.meaning_vi}</p>}
      {showEn && result.quick.lexical_unit.meaning_en && <p class="sense-definition">{result.quick.lexical_unit.meaning_en}</p>}
    </section>}
    {showVi && result.dictionary?.vietnameseReferences?.some(ref => ref.status === 'unresolved') && <p class="lookup-note">Vietnamese dictionary reference could not be resolved.</p>}
  </div>;
}
