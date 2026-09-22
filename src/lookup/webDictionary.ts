import { db } from '../db/database';
import type { DictionaryResult, DictionarySenseResult } from './types';

const VERSION = 'wiktionary-mymemory-v1';
const TTL = 30 * 24 * 60 * 60 * 1000;

export async function lookupWebDictionary(lemma: string, surfaceForm: string, timeoutMs: number, signal?: AbortSignal): Promise<DictionaryResult | null> {
  const normalized = lemma.toLocaleLowerCase().trim();
  const key = `dictionary:web:${normalized}:en-vi`;
  const row = await db.settings.get(key).catch(() => undefined);
  const cached = row?.value as { version?: string; result?: DictionaryResult; updatedAt?: number } | undefined;
  if (cached?.result && cached.version === VERSION && Date.now() - (cached.updatedAt ?? 0) < TTL) return { ...cached.result, surfaceForm };
  if (typeof navigator !== 'undefined' && navigator.onLine === false) return cached?.result ? { ...cached.result, surfaceForm } : null;
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), Math.max(300, timeoutMs));
  const abort = () => controller.abort(); signal?.addEventListener('abort', abort, { once: true });
  try {
    const encoded = encodeURIComponent(normalized);
    const [definitionResponse, translationResponse] = await Promise.all([
      fetch(`https://en.wiktionary.org/api/rest_v1/page/definition/${encoded}`, { signal: controller.signal }),
      fetch(`https://api.mymemory.translated.net/get?q=${encoded}&langpair=en%7Cvi`, { signal: controller.signal })
    ]);
    const definitions = definitionResponse.ok ? await definitionResponse.json() as Record<string, Array<{ partOfSpeech?: string; definitions?: Array<{ definition?: string }> }>> : {};
    const translation = translationResponse.ok ? await translationResponse.json() as { responseData?: { translatedText?: string } } : {};
    const meanings = cleanMeanings(translation.responseData?.translatedText, normalized);
    const senses: DictionarySenseResult[] = Object.values(definitions).flat().flatMap((group, groupIndex) =>
      (group.definitions ?? []).slice(0, 5).map((definition, index) => ({ id: `wiktionary:${normalized}:${groupIndex}:${index}`,
        pos: normalizePos(group.partOfSpeech), definitionEn: stripHtml(definition.definition ?? ''), meaningsVi: index === 0 ? meanings : [],
        source: 'wiktionary' as const, contextScore: 0, contextMatch: false }))).filter(sense => sense.definitionEn);
    if (!senses.length && meanings.length) senses.push({ id: `web:${normalized}`, pos: 'other', definitionEn: '', meaningsVi: meanings, source: 'web', contextScore: 0, contextMatch: false });
    if (!senses.length) return null;
    const result: DictionaryResult = { word: normalized, surfaceForm, lemma: normalized, pronunciation: null, contextConfidence: 0, senses };
    await db.settings.put({ key, value: { version: VERSION, result, updatedAt: Date.now() } }).catch(() => {});
    return result;
  } catch (error) {
    if (signal?.aborted) throw error;
    return cached?.result ? { ...cached.result, surfaceForm } : null;
  } finally { clearTimeout(timer); signal?.removeEventListener('abort', abort); }
}

function stripHtml(value: string): string { return value.replace(/<[^>]+>/g, '').replace(/\s+/g, ' ').trim(); }
function normalizePos(value?: string): string {
  const pos = value?.toLocaleLowerCase() ?? 'other';
  return pos === 'adj' ? 'adjective' : pos === 'adv' ? 'adverb' : pos;
}
function cleanMeanings(value: string | undefined, lemma: string): string[] {
  if (!value || value.toLocaleLowerCase().trim() === lemma) return [];
  return [...new Set(value.split(/[;,]/).map(item => item.trim()).filter(Boolean))];
}
