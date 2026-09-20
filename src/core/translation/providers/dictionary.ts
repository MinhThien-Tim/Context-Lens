import { db } from '../../../db/database';
import { dictionaryRegistry } from '../../../lookup/dictionary/registry';
import { EngineError } from '../../errors';
import type { TranslationInput, TranslationProvider } from '../types';
export class DictionaryTranslationProvider implements TranslationProvider {
  id = 'dictionary'; priority = 20; tier = 'stable' as const; network = false; timeoutMs = 90;
  isAvailable() { return true; }
  supports(source: string, target: string) { return (source === 'en' && ['en', 'vi'].includes(target)) || (source === 'vi' && target === 'en'); }
  async translate(input: TranslationInput) {
    const entry = input.sourceLang === 'en' ? dictionaryRegistry.lookup(input.text)?.entry : dictionaryRegistry.lookupReverse(input.text)?.entry;
    const text = input.sourceLang === 'en' && input.targetLang === 'en' ? entry?.definitionEn : input.sourceLang === 'en' ? entry?.meaningsVi.join('; ') : entry?.lemma;
    if (!text) throw new EngineError('UNSUPPORTED_LANGUAGE');
    return { text, sourceText: input.text, sourceLang: input.sourceLang, targetLang: input.targetLang, provider: this.id, offline: true,
      dictionary: entry ? { definition: entry.definitionEn, meanings: entry.meaningsVi, ipa: entry.ipa } : undefined };
  }
}
export class VocabularyTranslationProvider extends DictionaryTranslationProvider {
  id = 'vocabulary'; priority = 21;
  async translate(input: TranslationInput) {
    if (input.sourceLang !== 'en') throw new EngineError('UNSUPPORTED_LANGUAGE');
    const entry = await db.vocabulary.where('lemma').equals(input.text.toLowerCase().trim()).first();
    if (!entry?.meaningVi.length) throw new EngineError('UNSUPPORTED_LANGUAGE');
    return { text: entry.meaningVi.join('; '), sourceText: input.text, sourceLang: input.sourceLang, targetLang: input.targetLang, provider: this.id, offline: true, dictionary: undefined };
  }
}
