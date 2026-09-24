import { db } from '../db/database';

export interface AiUsageMetric {
  provider: string;
  model: string;
  task: string;
  inputTokens?: number;
  outputTokens?: number;
  cachedTokens?: number;
  latencyMs: number;
  cacheHit: boolean;
}

/** Stores metadata only; prompt and response text are deliberately excluded. */
export async function recordAiUsage(metric: AiUsageMetric): Promise<void> {
  try {
    await db.aiUsage.add({ ...metric, createdAt: Date.now() });
    const count = await db.aiUsage.count();
    if (count > 500) {
      const oldest = await db.aiUsage.orderBy('createdAt').limit(count - 500).primaryKeys();
      await db.aiUsage.bulkDelete(oldest);
    }
  } catch {
    // Usage metrics are best effort and must never break an explanation request.
  }
}
