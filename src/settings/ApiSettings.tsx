import { useEffect, useState } from 'preact/hooks';
import { defaultAiSettings, type AiSettings, type ProviderKind } from './types';
import { useDialog } from '../components/useDialog';

const defaults: Record<ProviderKind, { model: string; baseUrl: string }> = {
  gemini: { model: defaultAiSettings.model, baseUrl: '' },
  openai: { model: 'gpt-4.1-mini', baseUrl: 'https://api.openai.com/v1' },
  anthropic: { model: 'claude-3-5-haiku-latest', baseUrl: 'https://api.anthropic.com' },
  compatible: { model: '', baseUrl: '' },
  none: { model: '', baseUrl: '' }, demo: { model: '', baseUrl: '' }
};

export function ApiSettings({ initial, onSave, onClose }: { initial: AiSettings; onSave: (settings: AiSettings) => Promise<void>; onClose: () => void }) {
  const dialogRef = useDialog(onClose);
  const [value, setValue] = useState<AiSettings>({ ...defaultAiSettings, ...initial });
  const [saved, setSaved] = useState(false);
  useEffect(() => setSaved(false), [value]);
  const choose = (provider: ProviderKind) => {
    if (provider === value.provider) return;
    setValue({ ...value, provider, ...defaults[provider], apiKey: provider === 'none' ? '' : value.apiKey });
  };
  return (
    <div class="modal-layer">
      <button class="modal-backdrop" aria-label="Close settings" onClick={onClose} />
      <section ref={dialogRef} tabIndex={-1} class="settings-modal" role="dialog" aria-modal="true" aria-labelledby="ai-title">
        <header><div><p class="eyebrow">AI setup</p><h2 id="ai-title">Meaning in context</h2></div><button class="icon-button close-button" onClick={onClose} aria-label="Close settings">×</button></header>
        <button class={`setup-choice featured ${value.provider === 'gemini' ? 'selected' : ''}`} onClick={() => choose('gemini')}>
          <span class="radio" />
          <span><strong>Free — Gemini</strong><small>Create a free Gemini API key</small></span>
          <span class="choice-action">Connect</span>
        </button>
        {value.provider === 'gemini' && (
          <div class="onboarding-flow">
            <span>Open Google AI Studio</span><span>→</span><span>Create API key</span><span>→</span><span>Paste once</span>
            <a href="https://aistudio.google.com/app/apikey" target="_blank" rel="noreferrer">Open Google AI Studio ↗</a>
          </div>
        )}
        <button class={`setup-choice ${['openai', 'anthropic', 'compatible'].includes(value.provider) ? 'selected' : ''}`} onClick={() => choose('openai')}>
          <span class="radio" /><span><strong>Use my API key</strong><small>OpenAI / Anthropic / Gemini / Compatible</small></span>
        </button>
        <button class={`setup-choice ${value.provider === 'none' ? 'selected' : ''}`} onClick={() => choose('none')}>
          <span class="radio" /><span><strong>No AI</strong><small>Offline dictionary + cached results</small></span>
        </button>
        <button class="setup-choice disabled" disabled><span class="radio" /><span><strong>Demo quota</strong><small>Limited contextual lookups · coming later</small></span></button>
        {value.provider !== 'none' && value.provider !== 'demo' && (
          <div class="api-form">
            <label>Provider<select value={value.provider} onChange={(event) => choose(event.currentTarget.value as ProviderKind)}><option value="gemini">Gemini</option><option value="openai">OpenAI</option><option value="anthropic">Anthropic</option><option value="compatible">OpenAI-compatible</option></select></label>
            <label>API key<input type="password" autocomplete="off" value={value.apiKey} onInput={(event) => setValue({ ...value, apiKey: event.currentTarget.value })} placeholder="Paste key" /></label>
            <label>Model<input value={value.model} onInput={(event) => setValue({ ...value, model: event.currentTarget.value })} /></label>
            {value.provider === 'compatible' && <label>Base URL<input type="url" value={value.baseUrl} onInput={(event) => setValue({ ...value, baseUrl: event.currentTarget.value })} placeholder="https://example.com/v1" /></label>}
            <label class="checkbox"><input type="checkbox" checked={value.keyStorage === 'persistent'} onChange={(event) => setValue({ ...value, keyStorage: event.currentTarget.checked ? 'persistent' : 'session' })} /> Keep key on this device</label>
            <p class="privacy-note">Your key is sent directly from this browser to the selected provider. It is never logged or sent to a Context Lens server.</p>
          </div>
        )}
        <button class="primary-button" disabled={value.provider !== 'none' && (!value.apiKey || !value.model)} onClick={async () => { await onSave(value); setSaved(true); }}>{saved ? 'Saved' : 'Save setup'}</button>
      </section>
    </div>
  );
}
