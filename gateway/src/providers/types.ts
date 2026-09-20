import type { GatewayTranslationRequest } from '../protocol';

/** Stable identities. Official providers are reserved extension points only. */
export type GatewayProviderId =
  | 'google-web'
  | 'bing-web'
  | 'google-cloud-v2'
  | 'azure-translator';

export type ImplementedGatewayProviderId = Extract<GatewayProviderId, 'google-web' | 'bing-web'>;
export type GatewayProviderSelection = 'auto' | ImplementedGatewayProviderId;

export type GatewayFailureCategory =
  | 'network'
  | 'timeout'
  | 'quota'
  | 'rate-limit'
  | 'blocked'
  | 'invalid-response'
  | 'unsupported'
  | 'cancelled'
  | 'disabled';

export interface GatewayTranslationResult {
  version: 1;
  text: string;
  provider: ImplementedGatewayProviderId;
  detectedLang?: string;
  transliteration?: string;
  latencyMs?: number;
}

/** Provider adapters contain upstream behavior only; they never contain UI logic. */
export interface GatewayTranslationProvider {
  readonly id: ImplementedGatewayProviderId;
  isAvailable(): boolean;
  supports(input: GatewayTranslationRequest): boolean;
  translate(input: GatewayTranslationRequest, signal: AbortSignal): Promise<GatewayTranslationResult>;
}

/** Server-side placeholders for later official adapters. No credential flow exists yet. */
export interface OfficialProviderConfiguration {
  'google-cloud-v2'?: { configured: boolean };
  'azure-translator'?: { configured: boolean; region?: string };
}
