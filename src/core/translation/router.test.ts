import { describe, expect, it, vi } from 'vitest';
import { TranslationRouter } from './router';
import { ProviderHealthManager } from './provider-health';
import type { TranslationInput, TranslationProvider, TranslationResult } from './types';
import { SharedRequests } from '../requests';
const input: TranslationInput = { text: 'prerequisite', sourceLang: 'en', targetLang: 'vi' };
const result: TranslationResult = { text: 'điều kiện tiên quyết', sourceText: input.text, targetLang: 'vi', provider: 'browser' };
const cache = () => ({ get: vi.fn().mockResolvedValue(null), put: vi.fn().mockResolvedValue(undefined) });
function provider(id: string, priority: number, translate = vi.fn().mockResolvedValue(result)): TranslationProvider {
  return { id, priority, translate, tier: 'stable', network: false, timeoutMs: 15, isAvailable: () => true, supports: () => true };
}
describe('TranslationRouter', () => {
  it('checks cache before providers', async () => {
    const store = cache(); store.get.mockResolvedValue(result);
    const browser = provider('browser', 1);
    expect(await new TranslationRouter([browser], store).translate(input)).toMatchObject({ cached: true });
    expect(browser.translate).not.toHaveBeenCalled();
  });
  it('normalizes browser result and deduplicates pending work', async () => {
    const browser = provider('browser', 1); const store = cache();
    const router = new TranslationRouter([browser], store);
    await Promise.all([router.translate(input), router.translate(input)]);
    expect(browser.translate).toHaveBeenCalledTimes(1);
    expect(store.put).toHaveBeenCalledTimes(1);
  });
  it('times out a hung provider and falls back in priority order', async () => {
    const hung = provider('browser', 1, vi.fn(() => new Promise(() => {})));
    const local = provider('dictionary', 2);
    expect(await new TranslationRouter([local, hung], cache()).translate(input)).toMatchObject({ provider: 'dictionary' });
  });
  it('skips network offline', async () => {
    const network = { ...provider('network', 1), network: true };
    await expect(new TranslationRouter([network], cache(), undefined, true, () => false).translate(input)).rejects.toMatchObject({ code: 'OFFLINE' });
    expect(network.translate).not.toHaveBeenCalled();
  });
  it('isolates pair cooldown and suspends only after failures across pairs', () => {
    let now = 0; const health = new ProviderHealthManager(() => now);
    health.failure('x', 'pt-BR>en');
    expect(health.snapshot()).toEqual(expect.arrayContaining([expect.objectContaining({ provider: 'x', pair: 'pt-BR>en' })]));
    expect(health.available('x', 'en>vi')).toBe(true);
    expect(health.available('x', 'pt-BR>en')).toBe(false);
    health.failure('x', 'en>vi'); health.failure('x', 'vi>en');
    expect(health.available('x', 'fr>en')).toBe(false);
    now = 30_001;
    expect(health.available('x', 'fr>en')).toBe(true);
    health.success('x', 'en>vi');
    expect(health.available('x', 'en>vi')).toBe(true);
  });
  it('one cancelled subscriber does not cancel another', async () => {
    const requests = new SharedRequests<string>(); const controller = new AbortController();
    let complete!: (value: string) => void;
    const work = vi.fn(() => new Promise<string>(resolve => { complete = resolve; }));
    const first = requests.run('same', work, controller.signal);
    const second = requests.run('same', work);
    await Promise.resolve(); controller.abort(); complete('ok');
    await expect(first).rejects.toMatchObject({ code: 'ABORTED' });
    expect(await second).toBe('ok'); expect(work).toHaveBeenCalledTimes(1);
  });
});
