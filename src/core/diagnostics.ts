export type DiagnosticEvent = 'quickLookup' | 'localStop' | 'wiktionary' | 'mymemoryAccept' | 'mymemoryUncertain' | 'mymemoryReject' | 'googleFallback' | 'geminiAction' | 'geminiRequest' | 'contextCacheHit' | 'geminiCacheHit' | 'cacheHit';
export interface DiagnosticDetail { event: DiagnosticEvent; text?: string; normalizedText?: string; provider?: string; mode?: string; latencyMs?: number; status?: string; timestamp: number }
export interface DiagnosticSnapshot { counters: Record<DiagnosticEvent, number>; recent: Array<{ event: DiagnosticEvent; provider?: string; latencyMs?: number; status?: string }>; details: DiagnosticDetail[] }
export interface DiagnosticGroup { detail: DiagnosticDetail; count: number; items: DiagnosticDetail[] }

const names: DiagnosticEvent[] = ['quickLookup', 'localStop', 'wiktionary', 'mymemoryAccept', 'mymemoryUncertain', 'mymemoryReject', 'googleFallback', 'geminiAction', 'geminiRequest', 'contextCacheHit', 'geminiCacheHit', 'cacheHit'];
const counters = Object.fromEntries(names.map(name => [name, 0])) as Record<DiagnosticEvent, number>;
const recent: DiagnosticSnapshot['recent'] = [];
const details: DiagnosticDetail[] = [];
const MAX_DETAILS = 200;

/** Runtime-only diagnostics. Callers may pass only the selected word/phrase, never surrounding context or provider payloads. */
export function recordDiagnostic(event: DiagnosticEvent, detail: Omit<DiagnosticDetail, 'event' | 'timestamp' | 'normalizedText'> = {}): void {
  counters[event]++;
  const text = detail.text?.replace(/\s+/g, ' ').trim().slice(0, 240);
  const entry: DiagnosticDetail = { event, ...(text ? { text, normalizedText: normalizeDiagnosticText(text) } : {}), ...(detail.provider ? { provider: detail.provider } : {}), ...(detail.mode ? { mode: detail.mode } : {}), ...(detail.latencyMs !== undefined ? { latencyMs: detail.latencyMs } : {}), ...(detail.status ? { status: detail.status } : {}), timestamp: Date.now() };
  details.push(entry);
  if (details.length > MAX_DETAILS) details.shift();
  const { event: _event, timestamp: _timestamp, text: _text, normalizedText: _normalizedText, mode: _mode, ...metadata } = entry;
  recent.push({ event, ...metadata });
  if (recent.length > 40) recent.shift();
}

export function normalizeDiagnosticText(text: string): string {
  return text.normalize('NFC').toLocaleLowerCase().replace(/\s+/g, ' ').trim();
}

export function groupDiagnosticDetails(details: DiagnosticDetail[], event: DiagnosticEvent): DiagnosticGroup[] {
  const groups = new Map<string, DiagnosticGroup>();
  for (const item of details.filter(detail => detail.event === event && detail.text)) {
    const key = `${item.normalizedText}\u0000${item.event}\u0000${item.mode ?? ''}`;
    const group = groups.get(key);
    if (group) { group.count++; group.items.push(item); }
    else groups.set(key, { detail: item, count: 1, items: [item] });
  }
  return [...groups.values()];
}

export function getDiagnostics(): DiagnosticSnapshot {
  return { counters: { ...counters }, recent: recent.map(item => ({ ...item })), details: details.map(item => ({ ...item })) };
}

/** Clears runtime-only diagnostics without persisting any data. */
export function resetDiagnostics(): void {
  for (const name of names) counters[name] = 0;
  recent.length = 0;
  details.length = 0;
}
