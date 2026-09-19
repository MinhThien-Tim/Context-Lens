import { seedDictionary } from './seedDictionary';
import type { DictionaryMatch, DictionaryProvider } from './types';

class DictionaryRegistry {
  private providers: DictionaryProvider[] = [seedDictionary];

  register(provider: DictionaryProvider): () => void {
    this.providers = [provider, ...this.providers.filter((item) => item.id !== provider.id)];
    return () => { this.providers = this.providers.filter((item) => item !== provider); };
  }

  unregister(id: string): void {
    if (id === seedDictionary.id) return;
    this.providers = this.providers.filter((provider) => provider.id !== id);
  }

  lookup(surface: string): DictionaryMatch | null {
    for (const provider of this.providers) {
      const match = provider.lookup(surface);
      if (match) return match;
    }
    return null;
  }

  versions(): string[] {
    return this.providers.map((provider) => `${provider.id}@${provider.version}`);
  }
}

export const dictionaryRegistry = new DictionaryRegistry();
