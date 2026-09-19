import type { ContextProviderId, EngineSettings, TranslationProviderId } from './engines';
import { useState } from 'preact/hooks';
import { prepareBrowserTranslation } from '../core/translation/providers/browser';
import type { ProviderHealthSnapshot } from '../core/translation/provider-health';
export function EngineSettingsForm({ value, onChange, health = [] }: { value: EngineSettings; onChange: (value: EngineSettings) => void; health?: ProviderHealthSnapshot[] }) {
  const [browserStatus, setBrowserStatus] = useState('');
  const set = <K extends keyof EngineSettings>(key: K, next: EngineSettings[K]) => onChange({ ...value, [key]: next });
  const checkbox = (key: keyof EngineSettings, label: string) => <label class="checkbox"><input type="checkbox" checked={Boolean(value[key])} onChange={event => onChange({ ...value, [key]: event.currentTarget.checked })} />{label}</label>;
  return <div class="api-form engine-settings">
    <h3>Language engines</h3>
    <label>Translation direction<select value={value.sourceLang} onChange={event => onChange({ ...value, sourceLang: event.currentTarget.value as 'en' | 'vi', targetLang: event.currentTarget.value === 'en' ? 'vi' : 'en' })}><option value="en">English → Vietnamese</option><option value="vi">Vietnamese → English</option></select></label>
    <label>Quick translation<select value={value.quickEngine} onChange={event => set('quickEngine', event.currentTarget.value as EngineSettings['quickEngine'])}><option value="auto">Auto (recommended)</option><option value="browser">Browser</option><option value="offline">Offline</option><option value="google">Google (configured gateway)</option><option value="bing">Bing (configured gateway)</option></select></label>
    <label>Context engine<select value={value.contextEngine} onChange={event => set('contextEngine', event.currentTarget.value as EngineSettings['contextEngine'])}><option value="auto">Auto (recommended)</option><option value="user-api">User API</option><option value="hosted-lite">Hosted Lite</option><option value="local">Local</option></select></label>
    <p class="privacy-note">Quick lookup uses cache and local engines first. Context and Grammar run only when you request them.</p>
    {checkbox('automaticFallback', 'Automatic fallback')}
    {checkbox('cacheTranslations', 'Cache translations')}{checkbox('cacheContext', 'Cache context')}
    {checkbox('offlineDictionary', 'Offline dictionary')}{checkbox('browserTranslation', 'Browser translation (ready models)')}
    {value.browserTranslation && <><button class="secondary-button" disabled={browserStatus === 'Preparing…'} onClick={() => { setBrowserStatus('Preparing…'); void prepareBrowserTranslation(value.sourceLang, value.targetLang).then(() => setBrowserStatus('Ready')).catch(() => setBrowserStatus('Unavailable on this browser or language pair')); }}>Prepare browser language model</button><small role="status">{browserStatus}</small></>}
    {checkbox('publicTranslation', 'Optional free web translation (MyMemory)')}
    {value.publicTranslation && <p class="privacy-note">Selected text is sent to MyMemory when local translation is unavailable. Daily limits apply.</p>}
    <details><summary>Advanced engines</summary>
      {checkbox('debugMode', 'Show provider diagnostics')}
      {checkbox('userApi', 'Enable user API for context')}
      <label>Translation gateway URL<input type="url" value={value.translationEndpoint} onInput={event => set('translationEndpoint', event.currentTarget.value)} placeholder="https://your-server/translate" /></label>
      {checkbox('googleProvider', 'Enable Google gateway adapter')}{checkbox('bingProvider', 'Enable Bing gateway adapter')}
      <p class="privacy-note">Requires your configured gateway. Only selected text is sent for quick translation. No public or scraping endpoint is built in.</p>
      {checkbox('experimentalProviders', 'Allow experimental adapters (none installed)')}
      {checkbox('hostedAiLite', 'Enable Hosted Lite')}
      <label>Hosted context URL<input type="url" value={value.hostedEndpoint} onInput={event => set('hostedEndpoint', event.currentTarget.value)} /></label>
      <label>Daily Hosted Lite limit<input type="number" min="0" max="1000" value={value.hostedDailyQuota} onInput={event => set('hostedDailyQuota', Number(event.currentTarget.value))} /></label>
      {checkbox('localLlm', 'Enable local model')}
      <label>Local model URL<input type="url" value={value.localEndpoint} onInput={event => set('localEndpoint', event.currentTarget.value)} /></label>
      <label>Local model name<input value={value.localModel} onInput={event => set('localModel', event.currentTarget.value)} /></label>
      <label>Network timeout (ms)<input type="number" min="200" max="2000" value={value.networkTimeoutMs} onInput={event => set('networkTimeoutMs', Number(event.currentTarget.value))} /></label>
      <ProviderOrder title="Quick provider order" order={value.translationProviderOrder} labels={translationLabels} onChange={order => set('translationProviderOrder', order as TranslationProviderId[])} />
      <ProviderOrder title="Context provider order" order={value.contextProviderOrder} labels={contextLabels} onChange={order => set('contextProviderOrder', order as ContextProviderId[])} />
      <div class="engine-status" role="status">
        <strong>Configuration status</strong>
        <span>Browser: {value.browserTranslation ? 'enabled; availability checked at use' : 'disabled'}</span>
        <span>Google/Bing gateway: {value.translationEndpoint && (value.googleProvider || value.bingProvider) ? 'configured' : 'not configured'}</span>
        <span>Hosted Lite: {value.hostedAiLite && value.hostedEndpoint ? 'configured' : 'not configured'}</span>
        <span>Local model: {value.localLlm && value.localEndpoint && value.localModel ? 'configured' : 'not configured'}</span>
        {health.map(item => <span key={`${item.provider}:${item.pair ?? '*'}`}>{item.provider}{item.pair ? ` ${item.pair}` : ''}: cooling down until {new Date(item.cooldownUntil).toLocaleTimeString()}</span>)}
      </div>
    </details>
  </div>;
}

const translationLabels: Record<string, string> = { browser: 'Browser', dictionary: 'Dictionary', vocabulary: 'Saved vocabulary', mymemory: 'MyMemory', google: 'Google gateway', bing: 'Bing gateway' };
const contextLabels: Record<string, string> = { 'user-api': 'User API', 'hosted-lite': 'Hosted Lite', local: 'Local model' };
function ProviderOrder({ title, order, labels, onChange }: { title: string; order: string[]; labels: Record<string, string>; onChange: (order: string[]) => void }) {
  const move = (index: number, delta: number) => {
    const nextIndex = index + delta; if (nextIndex < 0 || nextIndex >= order.length) return;
    const next = [...order]; [next[index], next[nextIndex]] = [next[nextIndex], next[index]]; onChange(next);
  };
  return <fieldset class="provider-order"><legend>{title}</legend>{order.map((id, index) => <div key={id}><span>{index + 1}. {labels[id] ?? id}</span><button type="button" class="icon-button" disabled={index === 0} aria-label={`Move ${labels[id] ?? id} up`} onClick={() => move(index, -1)}>↑</button><button type="button" class="icon-button" disabled={index === order.length - 1} aria-label={`Move ${labels[id] ?? id} down`} onClick={() => move(index, 1)}>↓</button></div>)}</fieldset>;
}
