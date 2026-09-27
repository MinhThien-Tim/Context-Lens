import type { LanguageMode, LookupResponse } from '../lookup/types';
import { pairDictionarySenses, prioritizeDictionarySenses, unpairedVietnameseMeanings } from './dictionaryDisplay';

export function ExpandedExplain({ result, deep, mode, loading }: { result: LookupResponse; deep: LookupResponse; mode: LanguageMode; loading: boolean; contextResult?: LookupResponse | null }) {
  const showEn = mode !== 'vi', showVi = mode !== 'en';
  const dictionary = deep.dictionary ?? result.dictionary;
  const unpaired = unpairedVietnameseMeanings(result, deep);
  const initialCount = showEn ? 2 : 4;
  const senses = prioritizeDictionarySenses(pairDictionarySenses(dictionary?.senses ?? []), dictionary?.contextPos)
    .filter(sense => (showEn && sense.definitionEn) || (showVi && sense.meaningsVi.length));
  const groups = [...new Set(senses.map(sense => sense.pos))].map(pos => ({ pos, senses: senses.filter(sense => sense.pos === pos) }));
  const translation = deep.deep.sentence_analysis.translation_vi || deep.lens?.context.sentenceTranslation;
  const examples = [...new Set([...(deep.lens?.english?.examples ?? []), ...deep.deep.contrast.map(item => item.example)].filter(Boolean))];
  const phrase = deep.quick.lexical_unit;
  return <div class="deep-explanation" data-language={mode} aria-busy={loading}>
    {(result.context.sentence || (showVi && translation) || (showEn && deep.deep.context_explanation_en) || (showVi && deep.deep.context_explanation_vi)) && <section class="inspector-sentence">
      <h3 data-context tabIndex={-1}>Sentence context</h3>
      {result.context.sentence && (result.context.sentence.length > 280
        ? <details class="inspector-disclosure"><summary>Original sentence</summary><p class="original-sentence">{result.context.sentence}</p></details>
        : <p class="original-sentence">{result.context.sentence}</p>)}
      {showVi && translation && (translation.length > 280
        ? <details class="inspector-disclosure"><summary>Sentence translation</summary><p class="sentence-translation">{translation}</p></details>
        : <p class="sentence-translation">{translation}</p>)}
      {showVi && deep.deep.context_explanation_vi && <p>{deep.deep.context_explanation_vi}</p>}
      {showEn && deep.deep.context_explanation_en && <p>{deep.deep.context_explanation_en}</p>}
    </section>}
    {groups.length > 0 && <section class="expanded-senses"><h3>Dictionary meanings</h3>{groups.map((group, index) => <details class="sense-group" open={index === 0} key={`${result.selection.surface}:${group.pos}`}>
      <summary>{group.pos} <small>{group.senses.length}</small></summary>
      <ol class="expanded-sense-list">{group.senses.slice(0, initialCount).map(sense => <li class={`sense-bilingual${showEn && showVi && sense.definitionEn && sense.meaningsVi.length ? ' paired-columns' : ''}${sense.contextMatch ? ' context-match' : ''}`} key={sense.id}>
        {showEn && sense.definitionEn && <span class="sense-definition">{sense.definitionEn}</span>}
        {showVi && sense.meaningsVi.length > 0 && <span class="sense-vi">{sense.meaningsVi.join('; ')}</span>}
      </li>)}</ol>
      {group.senses.length > initialCount && <details class="more-group-meanings"><summary>More meanings ({group.senses.length - initialCount})</summary><ol start={initialCount + 1} class="expanded-sense-list">{group.senses.slice(initialCount).map(sense => <li class={`sense-bilingual${showEn && showVi && sense.definitionEn && sense.meaningsVi.length ? ' paired-columns' : ''}`} key={sense.id}>
        {showEn && sense.definitionEn && <span class="sense-definition">{sense.definitionEn}</span>}
        {showVi && sense.meaningsVi.length > 0 && <span class="sense-vi">{sense.meaningsVi.join('; ')}</span>}
      </li>)}</ol></details>}
    </details>)}</section>}
    {showVi && unpaired.length > 0 && <section class="unpaired-meanings"><h3>Unmatched Vietnamese meanings</h3><p>Nghĩa tiếng Việt chưa ghép với nghĩa tiếng Anh</p><ul>{unpaired.map(text => <li key={text}>{text}</li>)}</ul></section>}
    {showEn && examples.length > 0 && <details class="inspector-disclosure examples-section"><summary>Examples <small>{examples.length}</small></summary>{examples.map(text => <p class="inspector-example" key={text}>{text}</p>)}</details>}
    {(phrase || deep.lens?.phrase) && <details class="inspector-disclosure phrases-section"><summary>Phrases</summary><div class="inspector-phrase"><strong>{phrase?.text || deep.lens?.phrase?.canonical}</strong>{showVi && phrase?.meaning_vi && <p class="sense-vi">{phrase.meaning_vi}</p>}{showEn && phrase?.meaning_en && <p class="sense-definition">{phrase.meaning_en}</p>}</div></details>}
    {showEn && Boolean(deep.lens?.english?.synonyms?.length) && <details class="inspector-disclosure related-section"><summary>Related words</summary><p class="related-words">{deep.lens!.english!.synonyms!.join(', ')}</p></details>}
    {(deep.deep.grammar || (showEn && deep.lens?.context.simpleEnglish) || deep.lens?.context.needsPreviousSentence || deep.deep.sentence_analysis.chunks.length > 0 || deep.deep.contrast.length > 0) && <details class="inspector-disclosure"><summary>Usage &amp; sentence structure</summary>
      {deep.lens?.context.needsPreviousSentence && <p>{deep.lens.context.previousSentence || 'The previous sentence may be needed to understand this reference.'}</p>}
      {showEn && deep.lens?.context.simpleEnglish && <p>{deep.lens.context.simpleEnglish}</p>}
      {deep.deep.grammar && <section><h3 data-grammar tabIndex={-1}>Grammar</h3><strong>{deep.deep.grammar.pattern}</strong><p>{showVi ? deep.deep.grammar.explanation_vi : deep.deep.grammar.explanation_en}</p></section>}
      {deep.deep.sentence_analysis.chunks.length > 0 && <dl class="structure-list">{deep.deep.sentence_analysis.chunks.map(chunk => <div key={`${chunk.text}:${chunk.role}`}><dt>{chunk.text}</dt><dd>{showVi ? chunk.meaning_vi : chunk.role}</dd></div>)}</dl>}
      {deep.deep.contrast.map(item => <p key={item.meaning}>{showVi ? item.meaning_vi : `${item.meaning}: ${item.reason_not_selected}`}</p>)}
    </details>}
  </div>;
}
