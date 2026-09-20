import type { LanguageMode, LookupResponse } from '../lookup/types';
export function ExpandedExplain({ result, deep, mode, loading, contextResult }: { result: LookupResponse; deep: LookupResponse; mode: LanguageMode; loading: boolean; contextResult?: LookupResponse | null }) {
  const showEn = mode !== 'vi', showVi = mode !== 'en';
  return (<div class="deep-explanation" aria-busy={loading}>
              {loading && <p role="status">Finding context…</p>}
              {contextResult && <p class="source-pill">{contextResult.source === 'ai' ? 'AI' : contextResult.source === 'cache' ? 'Cached' : 'Local'}</p>}
              <h3 data-context tabIndex={-1}>Original sentence</h3><p>{result.context.sentence}</p>
              {result.lens && <><p>Local confidence: {Math.round(result.lens.confidence * 100)}%</p>{result.lens.context.needsPreviousSentence && <p>{result.lens.context.previousSentence ? `Previous sentence: ${result.lens.context.previousSentence}` : 'The previous sentence may be needed to understand this reference.'}</p>}
                {result.lens.sense?.reasons.length ? <p>{result.lens.sense.reasons.join(' · ')}</p> : null}
                {showEn && result.lens.english?.synonyms?.length ? <p>Related words: {result.lens.english.synonyms.join(', ')}</p> : null}
                {showEn && result.lens.english?.examples?.[0] && <p>Example: {result.lens.english.examples[0]}</p>}
                {showEn && result.lens.context.simpleEnglish && <p>Simpler wording: {result.lens.context.simpleEnglish}</p>}</>}
              {showVi && deep.deep.sentence_analysis.translation_vi && <><h3>Vietnamese</h3><p class="meaning-vi">{deep.deep.sentence_analysis.translation_vi}</p></>}
              {showEn && deep.deep.context_explanation_en && <p>{deep.deep.context_explanation_en}</p>}
              {showVi && deep.deep.context_explanation_vi && <p>{deep.deep.context_explanation_vi}</p>}
              {deep.deep.sentence_analysis.chunks.length > 0 && <><h3>Structure</h3><dl>{deep.deep.sentence_analysis.chunks.map((chunk) => <div><dt>{chunk.text}</dt><dd>{showVi ? chunk.meaning_vi : chunk.role}</dd></div>)}</dl></>}
              {!deep.deep.grammar && <p data-grammar tabIndex={-1}>No local grammar detail is available. Use the AI task menu for an optional explanation.</p>}
              {deep.deep.grammar && <><h3 data-grammar tabIndex={-1}>Grammar</h3><strong>{deep.deep.grammar.pattern}</strong><p>{showVi ? deep.deep.grammar.explanation_vi : deep.deep.grammar.explanation_en}</p></>}
              {deep.deep.contrast.length > 0 && <><h3>Useful contrast</h3><p>{deep.deep.contrast[0].meaning} · {showVi ? deep.deep.contrast[0].meaning_vi : deep.deep.contrast[0].reason_not_selected}</p></>}
            </div>);
}
