import { db } from '../db/database';
import { defaultAiSettings, type AiSettings } from './types';

const SESSION_KEY = 'context-lens-ai-session';

export async function loadAiSettings(): Promise<AiSettings> {
  try {
    const sessionValue = sessionStorage.getItem(SESSION_KEY);
    if (sessionValue) return { ...defaultAiSettings, ...JSON.parse(sessionValue) as Partial<AiSettings> };
  } catch { /* private browsing may disable storage */ }
  const stored = await db.settings.get('ai-settings');
  return { ...defaultAiSettings, ...(typeof stored?.value === 'object' ? stored.value : {}) };
}

export async function saveAiSettings(settings: AiSettings): Promise<void> {
  const safe = { ...settings };
  try { sessionStorage.removeItem(SESSION_KEY); } catch { /* ignored */ }
  if (settings.keyStorage === 'session') {
    await db.settings.delete('ai-settings');
    try { sessionStorage.setItem(SESSION_KEY, JSON.stringify(safe)); } catch { /* ignored */ }
  } else {
    await db.settings.put({ key: 'ai-settings', value: safe });
  }
}

export async function clearApiKey(): Promise<void> {
  const settings = await loadAiSettings();
  await saveAiSettings({ ...settings, apiKey: '', provider: 'none' });
}
