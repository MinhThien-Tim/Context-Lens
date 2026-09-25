export type DiagnosticEvent = 'quickLookup' | 'localStop' | 'wiktionary' | 'mymemoryAccept' | 'mymemoryUncertain' | 'mymemoryReject' | 'googleFallback' | 'geminiAction' | 'geminiRequest' | 'contextCacheHit' | 'cacheHit';
export interface DiagnosticSnapshot { counters: Record<DiagnosticEvent, number>; recent: Array<{ event: DiagnosticEvent; provider?: string; latencyMs?: number; status?: string }> }

const names: DiagnosticEvent[] = ['quickLookup', 'localStop', 'wiktionary', 'mymemoryAccept', 'mymemoryUncertain', 'mymemoryReject', 'googleFallback', 'geminiAction', 'geminiRequest', 'contextCacheHit', 'cacheHit'];
const counters = Object.fromEntries(names.map(name => [name, 0])) as Record<DiagnosticEvent, number>;
const recent: DiagnosticSnapshot['recent'] = [];

/** Runtime-only counters. Deliberately accepts no selection, prompt, key, or provider payload. */
export function recordDiagnostic(event: DiagnosticEvent, detail: Omit<DiagnosticSnapshot['recent'][number], 'event'> = {}): void {
  counters[event]++;
  recent.push({ event, ...detail });
  if (recent.length > 40) recent.shift();
}

export function getDiagnostics(): DiagnosticSnapshot {
  return { counters: { ...counters }, recent: recent.map(item => ({ ...item })) };
}

/** Clears runtime-only diagnostics without persisting any data. */
export function resetDiagnostics(): void {
  for (const name of names) counters[name] = 0;
  recent.length = 0;
}
