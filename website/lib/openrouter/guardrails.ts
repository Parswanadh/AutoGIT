/**
 * OpenRouter Free-Tier & Endpoint Security Guardrails
 * Strictly enforces that only free-tier models (:free or openrouter/free)
 * and authorized HTTPS OpenRouter endpoints are utilized.
 * Hard-blocks any local LLMs, Ollama, localhost, and paid models.
 */

export const OPENROUTER_BASE_URL = 'https://openrouter.ai/api/v1' as const;

export const FREE_MODEL_PATTERN = /^[a-zA-Z0-9_-]+\/[a-zA-Z0-9._-]+:free$/;

/**
 * Checks if a model ID qualifies as a valid free-tier model.
 * Enforces strict provider/model-slug:free format or openrouter/free meta-router.
 * Rejects bare :free, /:free, whitespace, newlines, tabs, and injected whitespace.
 */
export function isFreeModel(modelId: string | null | undefined): boolean {
  if (!modelId || typeof modelId !== 'string') {
    return false;
  }
  const trimmed = modelId.trim();
  if (!trimmed) {
    return false;
  }
  if (trimmed === 'openrouter/free') {
    return true;
  }
  return FREE_MODEL_PATTERN.test(trimmed);
}

/**
 * Asserts that a model ID belongs to the free tier, throwing an explicit security error otherwise.
 */
export function assertFreeModel(modelId: string | null | undefined): void {
  if (!isFreeModel(modelId)) {
    throw new Error(
      `[SECURITY GUARDRAIL] Model "${modelId ?? ''}" is forbidden. AutoGIT strictly permits ONLY ":free" tier models.`
    );
  }
}

/**
 * Validates a model ID and returns it if free, or throws a security guardrail exception.
 */
export function validateModelId(modelId: string): string {
  assertFreeModel(modelId);
  return modelId.trim();
}

/**
 * Validates that an API URL targets official OpenRouter HTTPS endpoints.
 * Hard-blocks localhost, 127.0.0.1, 0.0.0.0, [::1], Ollama port 11434, local ports, and non-HTTPS protocols.
 */
export function validateEndpoint(url: string): string {
  if (!url || typeof url !== 'string') {
    throw new Error('[SECURITY GUARDRAIL] Invalid API endpoint URL provided.');
  }

  const disallowedLocalPatterns = [
    /localhost/i,
    /127\.0\.0\.1/,
    /0\.0\.0\.0/,
    /::1/,
    /:11434/,
    /:8000/,
    /:5000/,
    /:8080/,
  ];

  for (const pattern of disallowedLocalPatterns) {
    if (pattern.test(url)) {
      throw new Error('[SECURITY GUARDRAIL] Localhost and local LLMs/Ollama are strictly prohibited.');
    }
  }

  if (url.startsWith('http://')) {
    throw new Error('[SECURITY GUARDRAIL] Only official OpenRouter HTTPS endpoints are authorized.');
  }

  try {
    const parsed = new URL(url);
    if (parsed.protocol !== 'https:' || parsed.hostname !== 'openrouter.ai' || !parsed.pathname.startsWith('/api/v1')) {
      throw new Error('[SECURITY GUARDRAIL] Only official OpenRouter HTTPS endpoints are authorized.');
    }
  } catch (urlErr) {
    if (urlErr instanceof Error && urlErr.message.includes('[SECURITY GUARDRAIL]')) {
      throw urlErr;
    }
    throw new Error('[SECURITY GUARDRAIL] Only official OpenRouter HTTPS endpoints are authorized.');
  }

  return url;
}

/**
 * Alias for validateEndpoint
 */
export const validateApiEndpoint = validateEndpoint;

/**
 * Verifies that the reported generation cost is zero.
 */
export function verifyZeroCost(usage?: { cost?: number }): void {
  if (usage?.cost && usage.cost > 0) {
    throw new Error(`[SECURITY WARNING] Non-zero cost reported: $${usage.cost}`);
  }
}
