import { GatewayError } from './protocol';
export const LIMITS = { requests: 500, characters: 100_000, perIpRequests: 50, perIpCharacters: 10_000, perMinute: 6, concurrent: 2 };
export interface Ledger {
  day: string; requests: number; characters: number;
  clients: Record<string, { requests: number; characters: number; recent: number[] }>;
  leases: Record<string, number>; cooldown: number; failures: number;
}
export function reserve(previous: Ledger | undefined, client: string, characters: number, now: number, id: string): Ledger {
  const day = new Date(now).toISOString().slice(0, 10);
  const ledger: Ledger = previous?.day === day ? structuredClone(previous) : {
    day, requests: 0, characters: 0, clients: {}, leases: previous?.leases ?? {}, cooldown: previous?.cooldown ?? 0, failures: previous?.failures ?? 0
  };
  if (ledger.cooldown > now) throw new GatewayError('PROVIDER_COOLDOWN', 503, Math.ceil((ledger.cooldown - now) / 1000));
  const clientQuota = ledger.clients[client] ?? { requests: 0, characters: 0, recent: [] };
  clientQuota.recent = clientQuota.recent.filter(time => time > now - 60_000);
  if (ledger.requests >= LIMITS.requests || ledger.characters + characters > LIMITS.characters) throw new GatewayError('GLOBAL_QUOTA', 429, 3600);
  if (clientQuota.requests >= LIMITS.perIpRequests || clientQuota.characters + characters > LIMITS.perIpCharacters) throw new GatewayError('DAILY_QUOTA', 429, 3600);
  if (clientQuota.recent.length >= LIMITS.perMinute) throw new GatewayError('RATE_LIMIT', 429);
  ledger.leases = Object.fromEntries(Object.entries(ledger.leases).filter(([, expiry]) => expiry > now));
  if (Object.keys(ledger.leases).length >= LIMITS.concurrent) throw new GatewayError('BUSY', 429, 3);
  ledger.requests++; ledger.characters += characters;
  clientQuota.requests++; clientQuota.characters += characters; clientQuota.recent.push(now);
  ledger.clients[client] = clientQuota; ledger.leases[id] = now + 30_000;
  return ledger;
}
export interface Store {
  get<T>(key: string): Promise<T | undefined>;
  put<T>(key: string, value: T): Promise<void>;
  transaction<T>(work: (tx: Store) => Promise<T>): Promise<T>;
}
