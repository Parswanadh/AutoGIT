export interface ModelHealthEntry {
  status: 'healthy' | 'cooling' | 'dead';
  expiresAt: number;
  strikes: number;
  lastError?: string;
}

/**
 * In-memory health cache for tracking rate-limited (429) or decommissioned (404) models.
 * Automatically computes progressive exponential cooldowns.
 */
export class ModelHealthCache {
  private cache = new Map<string, ModelHealthEntry>();
  private readonly baseCooldownMs: number;
  private readonly maxCooldownMs: number;

  constructor(baseCooldownMs = 15000, maxCooldownMs = 120000) {
    this.baseCooldownMs = baseCooldownMs;
    this.maxCooldownMs = maxCooldownMs;
  }

  public isHealthy(modelId: string): boolean {
    const entry = this.cache.get(modelId);
    if (!entry) return true;
    if (entry.status === 'dead') return false;
    if (Date.now() < entry.expiresAt) return false;

    // Cooldown elapsed; mark healthy again
    entry.status = 'healthy';
    return true;
  }

  public recordRateLimit(modelId: string, customCooldownMs?: number): void {
    const entry = this.cache.get(modelId) || { status: 'healthy', expiresAt: 0, strikes: 0 };
    entry.strikes += 1;
    const cooldown =
      customCooldownMs !== undefined
        ? customCooldownMs
        : Math.min(this.baseCooldownMs * Math.pow(2, entry.strikes - 1), this.maxCooldownMs);

    entry.expiresAt = Date.now() + cooldown;
    entry.status = 'cooling';
    this.cache.set(modelId, entry);
  }

  public recordPermanentFailure(modelId: string, reason?: string): void {
    this.cache.set(modelId, {
      status: 'dead',
      expiresAt: Infinity,
      strikes: 999,
      lastError: reason,
    });
  }

  public recordSuccess(modelId: string): void {
    const entry = this.cache.get(modelId);
    if (entry && entry.status !== 'dead') {
      entry.status = 'healthy';
      entry.expiresAt = 0;
      entry.strikes = Math.max(0, entry.strikes - 1);
    }
  }

  public getHealthyCandidates(candidates: string[]): string[] {
    return candidates.filter((id) => this.isHealthy(id));
  }

  public getCooldownRemaining(modelId: string): number {
    const entry = this.cache.get(modelId);
    if (!entry) return 0;
    if (entry.status === 'dead' || entry.expiresAt === Infinity) return Infinity;
    return Math.max(0, entry.expiresAt - Date.now());
  }

  public clear(): void {
    this.cache.clear();
  }
}

export interface CascadeOptions {
  healthCache?: ModelHealthCache;
  maxRetries?: number;
  onFallback?: (failedModel: string, nextModel: string, reason: string) => void;
  sleepFn?: (ms: number) => Promise<void>;
}

/**
 * Executes a request against a sequence of candidate models.
 * Automatically handles 429 rate limits, 503 provider outages, and cascades to healthy backup models.
 */
export async function executeWithCascade<T>(
  candidates: string[],
  requestFn: (modelId: string) => Promise<T>,
  options?: CascadeOptions
): Promise<T> {
  const cache = options?.healthCache || new ModelHealthCache();
  const maxRetries = options?.maxRetries ?? 3;
  const sleep =
    options?.sleepFn || ((ms: number) => new Promise<void>((resolve) => setTimeout(resolve, ms)));

  let lastError: Error | null = null;

  for (let attempt = 0; attempt < maxRetries; attempt++) {
    let activeCandidates = cache.getHealthyCandidates(candidates);

    if (activeCandidates.length === 0) {
      // If all preferred are cooling, include openrouter/free meta-router as fallback
      if (candidates.includes('openrouter/free')) {
        activeCandidates = candidates;
      } else {
        activeCandidates = [...candidates, 'openrouter/free'];
      }
    }

    for (let i = 0; i < activeCandidates.length; i++) {
      const currentModel = activeCandidates[i];
      const nextCandidate = activeCandidates[i + 1] || 'openrouter/free';

      try {
        const result = await requestFn(currentModel);
        cache.recordSuccess(currentModel);
        return result;
      } catch (err: any) {
        lastError = err;
        const statusCode = err?.status ?? err?.statusCode ?? (err?.message?.includes('429') ? 429 : 0);
        const errMsg = String(err?.message || err);

        if (
          statusCode === 401 ||
          errMsg.includes('401') ||
          errMsg.toLowerCase().includes('invalid api key') ||
          errMsg.toLowerCase().includes('unauthorized')
        ) {
          throw err;
        }

        if (statusCode === 429 || errMsg.includes('429') || errMsg.toLowerCase().includes('rate limit')) {
          cache.recordRateLimit(currentModel);
          if (options?.onFallback && currentModel !== nextCandidate) {
            options.onFallback(currentModel, nextCandidate, 'Rate limited (HTTP 429)');
          }
          continue;
        }

        const isPolicyOrGuardrail =
          errMsg.toLowerCase().includes('guardrail') ||
          errMsg.toLowerCase().includes('data policy') ||
          errMsg.toLowerCase().includes('data retention') ||
          errMsg.toLowerCase().includes('privacy') ||
          errMsg.toLowerCase().includes('consent') ||
          errMsg.toLowerCase().includes('no endpoints available') ||
          errMsg.toLowerCase().includes('no endpoints found') ||
          errMsg.toLowerCase().includes('not a valid model') ||
          errMsg.toLowerCase().includes('decommissioned');

        if (
          statusCode === 404 ||
          statusCode === 403 ||
          (statusCode === 400 && isPolicyOrGuardrail) ||
          errMsg.includes('404') ||
          errMsg.includes('403') ||
          isPolicyOrGuardrail
        ) {
          cache.recordPermanentFailure(currentModel, errMsg);
          if (options?.onFallback && currentModel !== nextCandidate) {
            options.onFallback(
              currentModel,
              nextCandidate,
              isPolicyOrGuardrail
                ? 'Guardrail / account data policy restriction'
                : 'Model unavailable/decommissioned'
            );
          }
          continue;
        }

        if (
          statusCode >= 500 ||
          statusCode === 408 ||
          errMsg.includes('500') ||
          errMsg.includes('502') ||
          errMsg.includes('503') ||
          errMsg.includes('504') ||
          errMsg.toLowerCase().includes('timeout') ||
          errMsg.toLowerCase().includes('temporarily unavailable') ||
          errMsg.toLowerCase().includes('overloaded')
        ) {
          cache.recordRateLimit(currentModel, 10000);
          if (options?.onFallback && currentModel !== nextCandidate) {
            options.onFallback(currentModel, nextCandidate, 'Provider temporary outage');
          }
          continue;
        }

        // If another model-specific error occurs (e.g. 400 with model parameter issue) and we have backup candidates, cascade
        if (i < activeCandidates.length - 1) {
          cache.recordPermanentFailure(currentModel, errMsg);
          if (options?.onFallback && currentModel !== nextCandidate) {
            options.onFallback(currentModel, nextCandidate, `Model-specific error (${statusCode || 'unknown'})`);
          }
          continue;
        }

        // For other unexpected errors on the last candidate, propagate
        throw err;
      }
    }

    // If we exhausted all candidates in this pass, backoff with jitter before outer retry
    if (attempt < maxRetries - 1) {
      const jitterMs = Math.min(1000 * Math.pow(1.5, attempt) + Math.random() * 500, 10000);
      await sleep(jitterMs);
    }
  }

  throw new Error(
    `All fallback models exhausted after ${maxRetries} cascade attempts. Last error: ${
      lastError?.message || 'Rate limit / provider outage'
    }`
  );
}
