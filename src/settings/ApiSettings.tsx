import { useEffect, useRef, useState } from 'preact/hooks';
import { defaultAiSettings, type AiSettings, type ProviderKind } from './types';
import { useDialog } from '../components/useDialog';
import { defaultEngineSettings, type EngineSettings } from './engines';
import { EngineSettingsForm } from './EngineSettingsForm';
import type { ProviderHealthSnapshot } from '../core/translation/provider-health';
import { testGeminiConnection, type GeminiConnectionStatus } from './geminiConnection';

const defaults: Record<ProviderKind, { model: string; baseUrl: string }> = {
  gemini: { model: defaultAiSettings.model, baseUrl: '' },
  openai: { model: 'gpt-4.1-mini', baseUrl: 'https://api.openai.com/v1' },
  anthropic: { model: 'claude-3-5-haiku-latest', baseUrl: 'https://api.anthropic.com' },
  compatible: { model: '', baseUrl: '' },
  none: { model: '', baseUrl: '' }, demo: { model: '', baseUrl: '' }
};

export function ApiSettings({ initial, initialVerified = false, initialEngines = defaultEngineSettings, health = [], onSave, onClose }: { initial: AiSettings; initialVerified?: boolean; initialEngines?: EngineSettings; health?: ProviderHealthSnapshot[]; onSave: (settings: AiSettings, engines: EngineSettings, keepOpen?: boolean, verified?: boolean) => Promise<void>; onClose: () => void }) {
  const dialogRef = useDialog(onClose);
  const [value, setValue] = useState<AiSettings>({ ...defaultAiSettings, ...initial });
  const [saved, setSaved] = useState(false);
  const [engines, setEngines] = useState(initialEngines);
  const [connection, setConnection] = useState<GeminiConnectionStatus | null>(null);
  const [testing, setTesting] = useState(false);
  const testController = useRef<AbortController | null>(null);
  const [connected, setConnected] = useState(initialVerified && initial.provider === 'gemini' && Boolean(initial.apiKey));
  useEffect(() => () => testController.current?.abort(), []);
  useEffect(() => setSaved(false), [value, engines]);
  const choose = (provider: ProviderKind) => {
    if (provider === value.provider) return;
    testController.current?.abort(); testController.current = null; setTesting(false);
    setConnection(null); setConnected(false);
    setValue({ ...value, provider, ...defaults[provider], apiKey: '' });
  };
  return (
    <div class="modal-layer">
      <button class="modal-backdrop" aria-label="Close settings" onClick={() => { testController.current?.abort(); onClose(); }} />
      <section ref={dialogRef} tabIndex={-1} class="settings-modal language-settings-modal" role="dialog" aria-modal="true" aria-labelledby="ai-title">
        <header><div><p class="eyebrow">Reading setup</p><h2 id="ai-title">Language engines</h2></div><button class="icon-button close-button" onClick={() => { testController.current?.abort(); onClose(); }} aria-label="Close settings">×</button></header>
        <EngineSettingsForm value={engines} onChange={setEngines} health={health} />
        <section class="settings-card ai-card" aria-labelledby="context-title">
          <div class="settings-card-heading"><span class="settings-icon" aria-hidden="true">✦</span><div><h3 id="context-title">AI Context</h3><p>Deep explanations only when you request Context, Grammar, Simplify or Structure.</p></div></div>
          <button class={`setup-choice featured ${value.provider === 'gemini' ? 'selected' : ''}`} aria-pressed={value.provider === 'gemini'} onClick={() => choose('gemini')}>
            <span class="radio" aria-hidden="true"/><span><strong>Gemini Context</strong><small>Better explanations for difficult words, grammar and sentence structure.</small></span>
          </button>
          {value.provider === 'gemini' && (connected ? <div class="connected-panel">
            <p role="status" class="connection-ready">✓ Gemini connected</p>
            <p>{value.model === defaultAiSettings.model ? 'Gemini 3.6 Flash' : value.model} | {value.keyStorage === 'session' ? 'Session only' : 'Stored on this device'}</p>
            <button class="secondary-button" onClick={async () => { const disconnected = { ...value, provider: 'none' as const, apiKey: '' }; await onSave(disconnected, engines, true, false); setValue(disconnected); setConnected(false); setConnection(null); }}>Disconnect</button>
          </div> : <div class="gemini-form settings-fields">
            <a class="secondary-button" href="https://aistudio.google.com/app/apikey" target="_blank" rel="noreferrer">Open Google AI Studio ↗</a>
            <p class="privacy-note">Open Google AI Studio → Create a Gemini API key → Paste key → Test &amp; Connect</p>
            <p class="privacy-note">Recommended model: Gemini 3.6 Flash</p>
            {value.apiKey.trim() && !connection && <p class="privacy-note" role="status">{initial.apiKey === value.apiKey && initial.model === value.model ? 'Configured · Not verified' : 'Not verified'}</p>}
            <label>API key<input type="password" autocomplete="off" value={value.apiKey} onInput={event => { testController.current?.abort(); testController.current = null; setTesting(false); setValue({ ...value, apiKey: event.currentTarget.value }); setConnection(null); setConnected(false); }} placeholder="Paste your Gemini API key" /></label>
            <button class="primary-button" disabled={testing || !value.apiKey.trim()} onClick={async () => { const snapshot = { ...value }; const controller = new AbortController(); testController.current = controller; setTesting(true); setConnection(null); const result = await testGeminiConnection(snapshot.apiKey, snapshot.model, controller.signal); if (testController.current !== controller || controller.signal.aborted) return; testController.current = null; setTesting(false); setConnection(result); if (result === 'ready') { await onSave(snapshot, engines, true, true); setConnected(true); setSaved(true); } }}>{testing ? 'Testing...' : 'Test & Connect'}</button>
            {connection && connection !== 'ready' && connection !== 'cancelled' && <p class="connection-error" role="status">{{ 'invalid-key': 'Invalid Gemini API key', 'model-unavailable': 'Selected Gemini model is unavailable', quota: 'Gemini rate limit or quota reached', network: 'Could not reach Gemini', timeout: 'Gemini connection timed out', 'structured-unavailable': 'Gemini connected, but structured output is unavailable for this model', unknown: 'Could not connect to Gemini' }[connection]}</p>}
          </div>)}
          {value.provider === 'gemini' && <>
            <label class="checkbox storage-choice"><input type="checkbox" checked={value.keyStorage === 'persistent'} onChange={event => setValue({ ...value, keyStorage: event.currentTarget.checked ? 'persistent' : 'session' })} />Remember key on this device</label>
            <p class="privacy-note">{value.keyStorage === 'persistent' ? 'Stored in this browser until you remove it.' : 'Removed when this browser session ends.'}</p>
            <p class="privacy-note">Gemini requests are sent directly from this browser to Google only when you use an AI Context action.</p>
            <details class="gemini-advanced"><summary>Advanced Gemini settings</summary><div class="settings-fields"><label>Model ID<input value={value.model} onInput={event => { testController.current?.abort(); testController.current = null; setTesting(false); setValue({ ...value, model: event.currentTarget.value }); setConnected(false); setConnection(null); }} /></label><button class="secondary-button" onClick={() => { testController.current?.abort(); testController.current = null; setTesting(false); setValue({ ...value, model: defaultAiSettings.model }); setConnected(false); setConnection(null); }}>Reset to recommended</button></div></details>
          </>}
          <button class={`setup-choice ${value.provider === 'none' ? 'selected' : ''}`} aria-pressed={value.provider === 'none'} onClick={() => choose('none')}><span class="radio" aria-hidden="true"/><span><strong>No AI</strong><small>Use quick meanings without AI explanations.</small></span></button>
        </section>
        <details class="settings-card other-providers"><summary>Other AI providers</summary><div class="settings-fields">
          <button class="secondary-button" onClick={() => choose('openai')}>Use another provider</button><label>Provider<select value={['openai', 'anthropic', 'compatible'].includes(value.provider) ? value.provider : 'openai'} onChange={event => choose(event.currentTarget.value as ProviderKind)}><option value="openai">OpenAI</option><option value="anthropic">Anthropic</option><option value="compatible">OpenAI-compatible</option></select></label>
          {['openai', 'anthropic', 'compatible'].includes(value.provider) && <><label>API key<input type="password" autocomplete="off" value={value.apiKey} onInput={event => setValue({ ...value, apiKey: event.currentTarget.value })} /></label><label>Model<input value={value.model} onInput={event => setValue({ ...value, model: event.currentTarget.value })} /></label>{value.provider === 'compatible' && <label>Base URL<input type="url" value={value.baseUrl} onInput={event => setValue({ ...value, baseUrl: event.currentTarget.value })} /></label>}<label class="checkbox"><input type="checkbox" checked={value.keyStorage === 'persistent'} onChange={event => setValue({ ...value, keyStorage: event.currentTarget.checked ? 'persistent' : 'session' })} />Remember key on this device</label></>}
        </div></details>
        <button class="primary-button" onClick={async () => { await onSave(value, engines, false, connected && value.provider === 'gemini'); setSaved(true); }}>{saved ? 'Saved' : 'Save setup'}</button>
      </section>
    </div>
  );
}
