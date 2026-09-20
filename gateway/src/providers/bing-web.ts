import { GatewayError, type GatewayTranslationRequest } from '../protocol';
import type { GatewayTranslationProvider, GatewayTranslationResult } from './types';

/**
 * Reserved experimental adapter. No stable unauthenticated Bing request has been
 * justified, so this fails cleanly instead of shipping token or scraping hacks.
 */
export class BingWebProvider implements GatewayTranslationProvider {
  readonly id = 'bing-web' as const;
  isAvailable() { return false; }
  supports(input: GatewayTranslationRequest) { return input.sourceLang !== input.targetLang; }
  async translate(_input: GatewayTranslationRequest, signal: AbortSignal): Promise<GatewayTranslationResult> {
    if (signal.aborted) throw new GatewayError('CANCELLED', 499, 0);
    throw new GatewayError('PROVIDER_UNAVAILABLE', 503);
  }
}
