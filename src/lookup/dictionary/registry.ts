import { seedDictionary } from './seedDictionary';
import type { DictionaryMatch, DictionaryProvider, SourcedDictionaryMatch } from './types';

const qualityRank = { reviewed: 0, curated: 1, imported: 2 } as const;

class DictionaryRegistry {
  private providers: DictionaryProvider[] = [seedDictionary];

  register(provider: DictionaryProvider, fallback = false): () => void {
    const others = this.providers.filter((item) => item.id !== provider.id);
    this.providers = fallback ? [...others, provider] : [provider, ...others];
    return () => { this.providers = this.providers.filter((item) => item !== provider); };
  }

  unregister(id: string): void {
    if (id === seedDictionary.id) return;
    this.providers = this.providers.filter((provider) => provider.id !== id);
  }

  lookup(surface: string): DictionaryMatch | null {
    return this.lookupAll(surface)[0] ?? null;
  }

  lookupAll(surface: string): SourcedDictionaryMatch[] {
    return this.providers.flatMap(provider => {
      const match = provider.lookup(surface);
      return match ? [{ ...match, providerId: provider.id, providerVersion: provider.version, quality: provider.quality ?? 'imported' }] : [];
    }).sort((a, b) => qualityRank[a.quality] - qualityRank[b.quality]);
  }

  lookupReverse(surface: string): DictionaryMatch | null {
    const providers = [...this.providers].sort((a, b) => qualityRank[a.quality ?? 'imported'] - qualityRank[b.quality ?? 'imported']);
    for (const provider of providers) {
      const match = provider.lookupReverse?.(surface);
      if (match) return match;
    }
    return null;
  }

  versions(): string[] {
    return this.providers.map((provider) => `${provider.id}@${provider.version}:${provider.quality ?? 'imported'}`).sort();
  }
}

export const dictionaryRegistry = new DictionaryRegistry();
