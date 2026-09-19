interface Failure { count: number; until: number }
export interface ProviderHealthSnapshot { provider: string; pair?: string; failureCount: number; cooldownUntil: number }
const BACKOFF = [30_000, 120_000, 600_000, 3_600_000];
export class ProviderHealthManager {
  private pairs = new Map<string, Map<string, Failure>>();
  private providers = new Map<string, Failure>();
  constructor(private now = Date.now) {}
  available(provider: string, pair: string): boolean {
    return (this.providers.get(provider)?.until ?? 0) <= this.now()
      && (this.pairs.get(provider)?.get(pair)?.until ?? 0) <= this.now();
  }
  failure(provider: string, pair: string): void {
    const pairs = this.pairs.get(provider) ?? new Map<string, Failure>();
    const count = (pairs.get(pair)?.count ?? 0) + 1;
    pairs.set(pair, { count, until: this.now() + BACKOFF[Math.min(count - 1, BACKOFF.length - 1)] });
    this.pairs.set(provider, pairs);
    if ([...pairs.values()].filter(value => value.until > this.now()).length >= 3) {
      const failures = (this.providers.get(provider)?.count ?? 0) + 1;
      this.providers.set(provider, { count: failures, until: this.now() + BACKOFF[Math.min(failures - 1, BACKOFF.length - 1)] });
    }
  }
  success(provider: string, pair: string): void {
    this.pairs.get(provider)?.delete(pair);
    this.providers.delete(provider);
  }
  snapshot(): ProviderHealthSnapshot[] {
    const result: ProviderHealthSnapshot[] = [];
    for (const [provider, state] of this.providers) result.push({ provider, failureCount: state.count, cooldownUntil: state.until });
    for (const [provider, pairs] of this.pairs) for (const [pair, state] of pairs) result.push({ provider, pair, failureCount: state.count, cooldownUntil: state.until });
    return result.filter(item => item.cooldownUntil > this.now());
  }
}
