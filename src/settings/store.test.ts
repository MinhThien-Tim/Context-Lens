import { afterEach, describe, expect, it } from 'vitest';
import { db } from '../db/database';
import { clearApiKey, loadAiSettings, saveAiSettings } from './store';
import { defaultAiSettings } from './types';

describe('AI key storage', () => {
  afterEach(async () => { sessionStorage.clear(); await db.settings.delete('ai-settings'); });

  it('keeps Gemini keys in session storage by default', async () => {
    await saveAiSettings({ ...defaultAiSettings, provider: 'gemini', apiKey: 'session-key' });
    expect(defaultAiSettings.keyStorage).toBe('session');
    expect((await loadAiSettings()).apiKey).toBe('session-key');
    expect(await db.settings.get('ai-settings')).toBeUndefined();
  });

  it('disconnects a persistent key from active and persistent storage', async () => {
    await saveAiSettings({ ...defaultAiSettings, provider: 'gemini', apiKey: 'persistent-key', keyStorage: 'persistent' });
    await clearApiKey();
    expect(await loadAiSettings()).toMatchObject({ provider: 'none', apiKey: '' });
    expect((await db.settings.get('ai-settings'))?.value).toMatchObject({ provider: 'none', apiKey: '' });
  });
});
