import type { LanguageMode, LookupResponse } from '../lookup/types';

export function ExpandedExplain({ result, deep, mode, loading, contextResult }: { result: LookupResponse; deep: LookupResponse; mode: LanguageMode; loading: boolean; contextResult?: LookupResponse | null }) {
  const showEn = mode !== 'vi', showVi = mode !== 'en';
  return <div class="deep-explanation" aria-busy={loading}>
    <div class="deep-meta">
      {loading && <p class="lookup-status" role="status">Finding context…</p>}
      {contextResult && <span class="source-pill">{contextResult.source === 'ai' ? 'AI' : contextResult.source === 'cache' ? 'Cached' : 'Local'}</span>}
    </div>
    <div class="context-card">
      <h3 data-context tabIndex={-1}>Original sentence</h3>
      <p>{result.context.sentence}</p>
    </div>
    {result.lens && <>
      <div class="compact-block compact-meta">
        <p class="confidence-line">Local confidence: {Math.round(result.lens.confidence * 100)}%</p>
        {result.lens.context.needsPreviousSentence && <p>{result.lens.context.previousSentence ? `Previous sentence: ${result.lens.context.previousSentence}` : 'The previous sentence may be needed to understand this reference.'}</p>}
        {result.lens.sense?.reasons.length ? <p class="reasons-line">{result.lens.sense.reasons.join(' · ')}</p> : null}
      </div>
      {showEn && result.lens.english?.synonyms?.length ? <div class="compact-block"><small>Related words</small><p>{result.lens.english.synonyms.join(', ')}</p></div> : null}
      {showEn && result.lens.english?.examples?.[0] && <div class="compact-block"><small>Example</small><p>{result.lens.english.examples[0]}</p></div>}
      {showEn && result.lens.context.simpleEnglish && <div class="compact-block"><small>Simpler wording</small><p>{result.lens.context.simpleEnglish}</p></div>}
    </>}
    {showVi && deep.deep.sentence_analysis.translation_vi && <div class="compact-block"><small>Vietnamese</small><p class="meaning-vi">{deep.deep.sentence_analysis.translation_vi}</p></div>}
    {showEn && deep.deep.context_explanation_en && <div class="compact-block"><p>{deep.deep.context_explanation_en}</p></div>}
    {showVi && deep.deep.context_explanation_vi && <div class="compact-block"><p>{deep.deep.context_explanation_vi}</p></div>}
    {deep.deep.sentence_analysis.chunks.length > 0 && <div class="compact-block"><small>Structure</small><dl class="structure-list">{deep.deep.sentence_analysis.chunks.map((chunk) => <div><dt>{chunk.text}</dt><dd>{showVi ? chunk.meaning_vi : chunk.role}</dd></div>)}</dl></div>}
    {!deep.deep.grammar && <p class="compact-block grammar-placeholder" data-grammar tabIndex={-1}>No local grammar detail is available. Use the AI task menu for an optional explanation.</p>}
    {deep.deep.grammar && <div class="compact-block"><small data-grammar tabIndex={-1}>Grammar</small><strong class="grammar-pattern">{deep.deep.grammar.pattern}</strong><p>{showVi ? deep.deep.grammar.explanation_vi : deep.deep.grammar.explanation_en}</p></div>}
    {deep.deep.contrast.length > 0 && <div class="compact-block"><small>Useful contrast</small><p>{deep.deep.contrast[0].meaning} · {showVi ? deep.deep.contrast[0].meaning_vi : deep.deep.contrast[0].reason_not_selected}</p></div>}
  </div>;
}
