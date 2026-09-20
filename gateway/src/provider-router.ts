import { GatewayError, type GatewayTranslationRequest } from './protocol';
import type { GatewayTranslationProvider, GatewayTranslationResult, ImplementedGatewayProviderId } from './providers/types';

const AUTO_ORDER: ImplementedGatewayProviderId[] = ['google-web', 'bing-web'];

export class GatewayProviderRouter {
  private providers: Map<ImplementedGatewayProviderId, GatewayTranslationProvider>;
  constructor(providers: GatewayTranslationProvider[]) {
    this.providers = new Map(providers.map(provider => [provider.id, provider]));
  }
  async translate(
    input: GatewayTranslationRequest,
    signal: AbortSignal,
    execute: (provider: GatewayTranslationProvider) => Promise<GatewayTranslationResult> = provider => provider.translate(input, signal)
  ): Promise<GatewayTranslationResult> {
    const ids = input.provider === 'auto' ? AUTO_ORDER : [input.provider];
    let lastError: GatewayError | undefined;
    for (const id of ids) {
      if (signal.aborted) throw new GatewayError('CANCELLED', 499, 0);
      const provider = this.providers.get(id);
      if (!provider || !provider.isAvailable() || !provider.supports(input)) {
        lastError ??= new GatewayError('PROVIDER_UNAVAILABLE', 503);
        continue;
      }
      try {
        return await execute(provider);
      } catch (error) {
        if (signal.aborted) throw new GatewayError('CANCELLED', 499, 0);
        lastError = error instanceof GatewayError ? error : new GatewayError('PROVIDER_DOWN', 502);
        if (input.provider !== 'auto') throw lastError;
        if (['GLOBAL_QUOTA', 'DAILY_QUOTA', 'RATE_LIMIT', 'BUSY', 'CANCELLED'].includes(lastError.code)) throw lastError;
      }
    }
    throw lastError ?? new GatewayError('PROVIDER_UNAVAILABLE');
  }
}
