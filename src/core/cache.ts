import type { Table } from 'dexie';
export interface EngineCacheRecord<T = unknown> {
  key: string;
  result: T;
  provider: string;
  languagePair: string;
  version: string;
  createdAt: number;
  lastUsedAt: number;
  hits: number;
}
export interface ResultCache<T> {
  get(key: string): Promise<T | null>;
  put(key: string, result: T, provider: string, languagePair: string): Promise<void>;
}
const memories = new Set<WeakRef<Map<string, unknown>>>();
export function clearEngineMemory(): void {
  for (const reference of memories) {
    const memory = reference.deref();
    if (memory) memory.clear(); else memories.delete(reference);
  }
}
/** Keys preserve case and punctuation: US/us and sentence punctuation can change meaning. */
export function cacheKey(parts: unknown[]): string { return JSON.stringify(parts); }
export function normalizeText(text: string): string { return text.normalize('NFC').trim().replace(/\s+/g, ' '); }
export class EngineCache<T> implements ResultCache<T> {
  private memory = new Map<string, T>();
  private cleanupPending = false;
  constructor(private table: Table<EngineCacheRecord<T>, string>, private version: string, private maxRecords: number, private enabled = true, private memoryLimit = 128) {
    this.maxRecords = Number.isFinite(maxRecords) ? Math.max(1, Math.min(20_000, maxRecords)) : 1000;
    for (const reference of memories) if (!reference.deref()) memories.delete(reference);
    memories.add(new WeakRef(this.memory));
  }
  async get(key: string): Promise<T | null> {
    if (!this.enabled) return null;
    const memory = this.memory.get(key);
    if (memory) {
      this.remember(key, memory);
      void this.table.update(key, row => { row.lastUsedAt = Date.now(); row.hits++; }).catch(() => {});
      return structuredClone(memory);
    }
    try {
      const record = await this.table.get(key);
      if (!record || record.version !== this.version) return null;
      this.remember(key, record.result);
      void this.table.update(key, row => { row.lastUsedAt = Date.now(); row.hits++; }).catch(() => {});
      return structuredClone(record.result);
    } catch { return null; }
  }
  async put(key: string, result: T, provider: string, languagePair: string): Promise<void> {
    if (!this.enabled) return;
    this.remember(key, structuredClone(result));
    try {
      const now = Date.now();
      await this.table.put({ key, result, provider, languagePair, version: this.version, createdAt: now, lastUsedAt: now, hits: 1 });
      if (!this.cleanupPending) {
        this.cleanupPending = true;
        setTimeout(() => { void this.cleanup().catch(() => {}).finally(() => { this.cleanupPending = false; }); }, 0);
      }
    } catch { /* Storage limits never discard a useful response. */ }
  }
  async cleanup(): Promise<void> {
    await this.table.db.transaction('rw', this.table, async () => {
      const count = await this.table.count();
      if (count <= this.maxRecords) return;
      const candidates = await this.table.orderBy('lastUsedAt').limit(Math.min(count, (count - this.maxRecords) * 4)).toArray();
      candidates.sort((a, b) => (a.lastUsedAt + Math.min(a.hits, 30) * 86_400_000) - (b.lastUsedAt + Math.min(b.hits, 30) * 86_400_000));
      const keys = candidates.slice(0, count - this.maxRecords).map(row => row.key);
      await this.table.bulkDelete(keys);
      for (const key of keys) this.memory.delete(key);
    });
  }
  private remember(key: string, result: T): void {
    this.memory.delete(key); this.memory.set(key, result);
    if (this.memory.size > this.memoryLimit) this.memory.delete(this.memory.keys().next().value!);
  }
}
