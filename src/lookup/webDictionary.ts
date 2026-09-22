import { db } from '../db/database';
import { SharedRequests } from '../core/requests';
import type { DictionaryResult, DictionarySenseResult } from './types';

const VERSION = 'wiktionary-web-v2';
const SUCCESS_TTL = 30 * 24 * 60 * 60 * 1000;
const MISS_TTL = 6 * 60 * 60 * 1000;
const FAILURE_TTL = 5 * 60 * 1000;
const requests = new SharedRequests<DictionaryResult | null>();

export async function lookupWebDictionary(lemma: string, surfaceForm: string, timeoutMs: number, signal?: AbortSignal): Promise<DictionaryResult | null> {
  const normalized = lemma.toLocaleLowerCase().trim();
  const key = `dictionary:web:${normalized}:en-vi`;
  const row = await db.settings.get(key).catch(() => undefined);
  const cached = row?.value as { version?: string; result?: DictionaryResult | null; expiresAt?: number } | undefined;
  if (cached?.version === VERSION && (cached.expiresAt ?? 0) > Date.now()) return cached.result ? { ...cached.result, surfaceForm } : null;
  if (typeof navigator !== 'undefined' && navigator.onLine === false) return null;
  const result = await requests.run(key, async sharedSignal => {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), Math.max(300, timeoutMs));
    const abort = () => controller.abort(); sharedSignal.addEventListener('abort', abort, { once: true });
    try {
      const encoded = encodeURIComponent(normalized);
      const definitionResponse = await fetch(`https://en.wiktionary.org/api/rest_v1/page/definition/${encoded}`, { signal: controller.signal });
      if (!definitionResponse.ok) {
        await cacheResult(key, null, definitionResponse.status === 404 ? MISS_TTL : FAILURE_TTL);
        return null;
      }
      const definitions = await definitionResponse.json() as Record<string, Array<{ partOfSpeech?: string; definitions?: Array<{ definition?: string }> }>>;
    const senses: DictionarySenseResult[] = Object.values(definitions).flat().flatMap((group, groupIndex) =>
      (group.definitions ?? []).slice(0, 5).map((definition, index) => ({ id: `wiktionary:${normalized}:${groupIndex}:${index}`,
        pos: normalizePos(group.partOfSpeech), definitionEn: stripHtml(definition.definition ?? ''), meaningsVi: [],
        source: 'wiktionary' as const, contextScore: 0, contextMatch: false }))).filter(sense => sense.definitionEn);
      if (!senses.length) {
        await cacheResult(key, null, MISS_TTL);
        return null;
      }
      const found: DictionaryResult = { word: normalized, surfaceForm, lemma: normalized, pronunciation: null, contextConfidence: 0, senses };
      await cacheResult(key, found, SUCCESS_TTL);
      return found;
    } catch (error) {
      if (sharedSignal.aborted) throw error;
      await cacheResult(key, null, FAILURE_TTL);
      return null;
    } finally { clearTimeout(timer); sharedSignal.removeEventListener('abort', abort); }
  }, signal);
  return result ? { ...result, surfaceForm } : null;
}

async function cacheResult(key: string, result: DictionaryResult | null, ttl: number): Promise<void> {
  await db.settings.put({ key, value: { version: VERSION, result, expiresAt: Date.now() + ttl } }).catch(() => {});
}

function stripHtml(value: string): string { return value.replace(/<[^>]+>/g, '').replace(/\s+/g, ' ').trim(); }
function normalizePos(value?: string): string {
  const pos = value?.toLocaleLowerCase() ?? 'other';
  return pos === 'adj' ? 'adjective' : pos === 'adv' ? 'adverb' : pos;
}
