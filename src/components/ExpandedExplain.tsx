import { useEffect, useState } from 'preact/hooks';
import type { LanguageMode, LookupResponse } from '../lookup/types';
import { compactDictionarySenses, pairDictionarySenses, prioritizeDictionarySenses } from './dictionaryDisplay';

export function ExpandedExplain({ result, deep, mode, loading, contextResult }: { result: LookupResponse; deep: LookupResponse; mode: LanguageMode; loading: boolean; contextResult?: LookupResponse | null }) {
  const [level, setLevel] = useState(0);
  const showEn = mode !== 'vi', showVi = mode !== 'en';
  const senses = prioritizeDictionarySenses(pairDictionarySenses(deep.dictionary?.senses ?? []));
  const primaryIds = new Set(compactDictionarySenses(senses).map(sense => sense.id));
  const additionalSenses = senses.filter(sense => !primaryIds.has(sense.id));
  const hasNotes = Boolean(result.lens?.context.needsPreviousSentence || result.lens?.sense?.reasons.length
    || result.lens?.context.simpleEnglish || deep.deep.grammar);
  const hasMeanings = additionalSenses.length > 0;
  const hasExtras = Boolean(result.lens || deep.deep.sentence_analysis.chunks.length || deep.deep.contrast.length || !deep.deep.grammar);
  const stages = [
    { level: 1, label: 'Lưu ý & cách dùng', available: hasNotes },
    { level: 2, label: `Nghĩa khác${hasMeanings ? ` (${additionalSenses.length})` : ''}`, available: hasMeanings },
    { level: 3, label: 'Ngoại lệ & chi tiết', available: hasExtras }
  ].filter(stage => stage.available);
  const next = stages.find(stage => stage.level > level);
  const previous = [...stages].reverse().find(stage => stage.level < level)?.level ?? 0;
  useEffect(() => setLevel(0), [result.selection.surface, result.context.sentence]);

  return <div class="deep-explanation" aria-busy={loading}>
    <div class="deep-meta">
      {loading && <p class="lookup-status" role="status">Finding context…</p>}
      {contextResult && <span class="source-pill">{contextResult.source === 'ai' ? 'AI' : contextResult.source === 'cache' ? 'Cached' : 'Local'}</span>}
    </div>

    <div class="context-card">
      <h3 data-context tabIndex={-1}>Original sentence</h3>
      <p>{result.context.sentence}</p>
    </div>
    {showVi && deep.deep.sentence_analysis.translation_vi && <div class="compact-block priority-detail"><small>Vietnamese</small><p class="meaning-vi">{deep.deep.sentence_analysis.translation_vi}</p></div>}
    {showEn && deep.deep.context_explanation_en && <div class="compact-block priority-detail"><p>{deep.deep.context_explanation_en}</p></div>}
    {showVi && deep.deep.context_explanation_vi && <div class="compact-block priority-detail"><p>{deep.deep.context_explanation_vi}</p></div>}
    {showVi && Boolean(deep.dictionary?.unpairedMeaningsVi?.length) && <div class="compact-block unpaired-meanings">
      <small>Nghĩa Việt chưa ghép với định nghĩa Anh</small><p>{deep.dictionary!.unpairedMeaningsVi!.join(' · ')}</p></div>}

    {level >= 1 && hasNotes && <section class="explain-level" aria-label="Lưu ý và cách dùng">
      <h3>Lưu ý & cách dùng</h3>
      {result.lens && <div class="compact-block compact-meta">
        {result.lens.context.needsPreviousSentence && <p>{result.lens.context.previousSentence ? `Previous sentence: ${result.lens.context.previousSentence}` : 'The previous sentence may be needed to understand this reference.'}</p>}
        {result.lens.sense?.reasons.length ? <p class="reasons-line">{result.lens.sense.reasons.join(' · ')}</p> : null}
      </div>}
      {showEn && result.lens?.context.simpleEnglish && <div class="compact-block"><small>Simpler wording</small><p>{result.lens.context.simpleEnglish}</p></div>}
      {deep.deep.grammar && <div class="compact-block"><small data-grammar tabIndex={-1}>Grammar</small><strong class="grammar-pattern">{deep.deep.grammar.pattern}</strong><p>{showVi ? deep.deep.grammar.explanation_vi : deep.deep.grammar.explanation_en}</p></div>}
    </section>}

    {level >= 2 && hasMeanings && <section class="explain-level expanded-senses" aria-label="Nghĩa khác">
      <h3>Nghĩa khác</h3>
      {groupSenses(additionalSenses).map(group => <section class="sense-group" key={`${group.pos}-${group.source}`}>
        <h3>{shortPos(group.pos)} {longPos(group.pos)}{group.source !== 'local' && <span class="web-badge">.web</span>}</h3>
        <div class="expanded-sense-list">{group.senses.map(sense => <p class={`sense-bilingual${sense.contextMatch ? ' context-match' : ''}`} key={sense.id}>
          {showEn && sense.definitionEn && <span class="sense-definition">{sense.definitionEn}</span>}
          {showVi && sense.meaningsVi.length > 0 && <span class="sense-vi">{sense.meaningsVi.join('; ')}</span>}
        </p>)}</div>
      </section>)}
    </section>}

    {level >= 3 && hasExtras && <section class="explain-level" aria-label="Ngoại lệ và chi tiết">
      <h3>Ngoại lệ & chi tiết</h3>
      {result.lens && <div class="compact-block compact-meta"><p class="confidence-line">Sense confidence: {Math.round(result.lens.confidence * 100)}% · Part-of-speech confidence: {Math.round((result.lens.posConfidence ?? 0) * 100)}%</p></div>}
      {showEn && result.lens?.english?.synonyms?.length ? <div class="compact-block"><small>Related words</small><p>{result.lens.english.synonyms.join(', ')}</p></div> : null}
      {showEn && result.lens?.english?.examples?.[0] && <div class="compact-block"><small>Example</small><p>{result.lens.english.examples[0]}</p></div>}
      {deep.deep.sentence_analysis.chunks.length > 0 && <div class="compact-block"><small>Structure</small><dl class="structure-list">{deep.deep.sentence_analysis.chunks.map(chunk => <div key={`${chunk.text}:${chunk.role}`}><dt>{chunk.text}</dt><dd>{showVi ? chunk.meaning_vi : chunk.role}</dd></div>)}</dl></div>}
      {!deep.deep.grammar && <p class="compact-block grammar-placeholder" data-grammar tabIndex={-1}>No local grammar detail is available. Use the AI task menu for an optional explanation.</p>}
      {deep.deep.contrast.length > 0 && <div class="compact-block"><small>Useful contrast</small><p>{deep.deep.contrast[0].meaning} · {showVi ? deep.deep.contrast[0].meaning_vi : deep.deep.contrast[0].reason_not_selected}</p></div>}
    </section>}

    {(next || level > 0) && <div class="explain-level-controls">
      {level > 0 && <button class="text-button" onClick={() => setLevel(previous)}>Thu gọn một tầng</button>}
      {next && <button class="secondary-button compact-action" onClick={() => setLevel(next.level)}>Mở thêm: {next.label}</button>}
    </div>}
  </div>;
}

function groupSenses<T extends { pos: string; source: string }>(senses: T[]): Array<{ pos: string; source: string; senses: T[] }> {
  const groups: Array<{ pos: string; source: string; senses: T[] }> = [];
  for (const sense of senses) {
    const group = groups.find(item => item.pos === sense.pos && item.source === sense.source);
    if (group) group.senses.push(sense); else groups.push({ pos: sense.pos, source: sense.source, senses: [sense] });
  }
  return groups;
}
function shortPos(pos: string): string { const value = pos.toLocaleLowerCase(); return value.includes('verb') ? 'v.' : value.includes('noun') ? 'n.' : value.includes('adjective') ? 'adj.' : value.includes('adverb') ? 'adv.' : pos; }
function longPos(pos: string): string { const value = pos.toLocaleLowerCase(); return value.includes('verb') ? 'Verb' : value.includes('noun') ? 'Noun' : value.includes('adjective') ? 'Adjective' : value.includes('adverb') ? 'Adverb' : ''; }
