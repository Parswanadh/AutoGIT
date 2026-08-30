import { describe, it, expect, vi, beforeEach } from 'vitest';
import {
  OPENROUTER_BASE_URL,
  validateModelId,
  isFreeModel,
  assertFreeModel,
  validateEndpoint,
  verifyZeroCost,
} from '../../lib/openrouter/guardrails';
import {
  FREE_MODELS,
  RECOMMENDED_TIERS,
  fetchFreeModels,
  getModelsForProfile,
  getDefaultModel,
} from '../../lib/openrouter/models';
import {
  ModelHealthCache,
  executeWithCascade,
} from '../../lib/openrouter/retry';
import {
  OpenRouterClient,
  ChatMessage,
  StreamCallbacks,
} from '../../lib/openrouter/client';

describe('Milestone 2 Empirical Stress Test: Guardrails, 429 Health Cache & Cascade Engine', () => {
  // =========================================================================
  // 1. Adversarial Model ID Guardrail Bypass Probes
  // =========================================================================
  describe('1. Adversarial Model ID Guardrail Bypass Probes', () => {
    const adversarialForbiddenModelIds = [
      // Fake / disguised suffixes
      'openai/gpt-4o:free-fake',
      'openai/gpt-4o:free_tier',
      'openai/gpt-4o:freemium',
      'openai/gpt-4o:free123',
      'openai/gpt-4o:free-preview',
      'anthropic/claude-3.5:free?',
      'anthropic/claude-3.5:free#frag',
      'anthropic/claude-3.5:free.json',
      'anthropic/claude-3.5:free/chat',
      'anthropic/claude-3.5:FREE',
      'anthropic/claude-3.5:Free',
      // Spoofed meta-router variations
      'openrouter/free-not',
      'openrouter/freemium',
      'openrouter/free:paid',
      'openrouter/free/v2',
      'openrouter/free-auto',
      'openrouter/free1',
      'fake-openrouter/free',
      // Null bytes and injection attempts
      'openai/gpt-4o\x00:free',
      'openai/gpt-4o\n:free',
      'openai/gpt-4o\r\n:free',
      // Standard paid models
      'openai/gpt-4o',
      'openai/gpt-4-turbo',
      'openai/o1',
      'openai/o3-mini',
      'anthropic/claude-3.5-sonnet',
      'anthropic/claude-3-opus',
      'google/gemini-pro',
      'google/gemini-1.5-pro',
      'meta-llama/llama-3.3-70b-instruct',
      'deepseek/deepseek-r1',
      'mistralai/mistral-large-2411',
      'cohere/command-r-plus',
      // Edge-case falsy and whitespace inputs
      '',
      ' ',
      '   ',
      '\t',
      '\n',
      'undefined',
      'null',
      ':free',
      '/:free',
    ];

    it.each(adversarialForbiddenModelIds)(
      'hard-blocks adversarial model ID bypass attempt: "%s"',
      (modelId) => {
        expect(isFreeModel(modelId)).toBe(false);
        expect(() => assertFreeModel(modelId)).toThrow(/SECURITY GUARDRAIL/i);
        expect(() => validateModelId(modelId)).toThrow(/SECURITY GUARDRAIL/i);
      }
    );

    it('rejects non-string / null / undefined inputs gracefully without crashing', () => {
      expect(isFreeModel(null)).toBe(false);
      expect(isFreeModel(undefined)).toBe(false);
      expect(isFreeModel(123 as any)).toBe(false);
      expect(isFreeModel({} as any)).toBe(false);
      expect(isFreeModel([] as any)).toBe(false);
      expect(isFreeModel(true as any)).toBe(false);

      expect(() => assertFreeModel(null)).toThrow(/SECURITY GUARDRAIL/i);
      expect(() => assertFreeModel(undefined)).toThrow(/SECURITY GUARDRAIL/i);
      expect(() => validateModelId(null as any)).toThrow(/SECURITY GUARDRAIL/i);
      expect(() => validateModelId(undefined as any)).toThrow(/SECURITY GUARDRAIL/i);
    });

    it('validates and accepts all legitimate free-tier models with proper trimming', () => {
      const legitimateModels = [
        'google/gemini-2.0-flash-exp:free',
        'meta-llama/llama-3.3-70b-instruct:free',
        'qwen/qwen-2.5-coder-32b-instruct:free',
        'deepseek/deepseek-r1:free',
        'nvidia/nemotron-3-super-120b-a12b:free',
        'nvidia/nemotron-3-ultra-550b-a55b:free',
        'nvidia/nemotron-3.5-lightning:free',
        'minimax/minimax-m2.7:free',
        'minimax/minimax-m3:free',
        'cohere/north-mini-code:free',
        'openrouter/free',
        'z-ai/glm-5.2:free',
        'poolside/laguna-s-2.1:free',
        'thinkingmachines/inkling:free',
        'inclusionai/ling-3.0-flash-fin:free',
        'liquid/lfm-2.5-2.6b:free',
      ];

      for (const id of legitimateModels) {
        expect(isFreeModel(id)).toBe(true);
        expect(isFreeModel(`  ${id}  `)).toBe(true);
        expect(() => assertFreeModel(id)).not.toThrow();
        expect(validateModelId(id)).toBe(id);
      }
    });
  });

  // =========================================================================
  // 2. Adversarial Endpoint & URL Spoofing Probes
  // =========================================================================
  describe('2. Adversarial Endpoint & URL Spoofing Probes', () => {
    const adversarialEndpoints = [
      // Domain spoofing / subdomain attacks
      'https://openrouter.ai.attacker.com/api/v1',
      'https://openrouter.ai@attacker.com/api/v1',
      'https://attacker.com/openrouter.ai/api/v1',
      'https://fake-openrouter.ai/api/v1',
      'https://openrouter.ai.evil.org/api/v1',
      'https://openrouter.ai.cdn.cloudflare.net/api/v1',
      // IDN Homograph attack (Cyrillic 'o' in openrouter)
      'https://openr\u043Euter.ai/api/v1',
      // Localhost / SSRF / Ollama port smuggling
      'http://localhost:11434/api/generate',
      'http://localhost:11434',
      'https://localhost:11434',
      'http://127.0.0.1:11434',
      'https://127.0.0.1:11434',
      'http://0.0.0.0:11434',
      'http://[::1]:11434',
      'http://127.0.0.1:8000',
      'http://127.0.0.1:5000',
      'http://127.0.0.1:8080',
      'http://localhost:8000/v1',
      'http://localhost:5000/v1',
      'http://localhost:8080/v1',
      'http://127.0.0.2:11434',
      'http://127.127.127.127:11434',
      // Disallowed non-HTTPS protocols
      'http://openrouter.ai/api/v1',
      'http://openrouter.ai/api/v1/chat/completions',
      'ws://openrouter.ai/api/v1',
      'wss://openrouter.ai/api/v1',
      'ftp://openrouter.ai/api/v1',
      'file:///etc/passwd',
      'javascript:alert(1)',
      'data:text/html,test',
      // Disallowed paths / versions / providers
      'https://openrouter.ai/api/v2',
      'https://openrouter.ai/v1',
      'https://openrouter.ai/',
      'https://openrouter.ai/api',
      'https://openrouter.ai/api/v1/../../etc/passwd',
      'https://api.openai.com/v1',
      'https://api.anthropic.com/v1',
      'https://generativelanguage.googleapis.com/v1beta',
      // Invalid syntax
      '',
      '   ',
      'not-a-valid-url',
      'https://',
      'http://',
    ];

    it.each(adversarialEndpoints)(
      'hard-blocks adversarial / local / spoofed endpoint: "%s"',
      (endpoint) => {
        expect(() => validateEndpoint(endpoint)).toThrow(/SECURITY GUARDRAIL/i);
      }
    );

    it('accepts legitimate OpenRouter HTTPS API endpoints', () => {
      const validEndpoints = [
        'https://openrouter.ai/api/v1',
        'https://openrouter.ai/api/v1/chat/completions',
        'https://openrouter.ai/api/v1/models',
        'https://openrouter.ai/api/v1/auth/key',
        'https://openrouter.ai/api/v1/generation',
      ];

      for (const ep of validEndpoints) {
        expect(validateEndpoint(ep)).toBe(ep);
      }
    });

    it('strictly checks zero-cost generation and throws on non-zero cost', () => {
      expect(() => verifyZeroCost(undefined)).not.toThrow();
      expect(() => verifyZeroCost({})).not.toThrow();
      expect(() => verifyZeroCost({ cost: 0 })).not.toThrow();
      expect(() => verifyZeroCost({ cost: 0.0 })).not.toThrow();

      expect(() => verifyZeroCost({ cost: 0.00001 })).toThrow(/SECURITY WARNING.*Non-zero cost/i);
      expect(() => verifyZeroCost({ cost: 1.5 })).toThrow(/SECURITY WARNING.*Non-zero cost/i);
    });
  });

  // =========================================================================
  // 3. Dynamic Model Discovery & Adversarial Filtering
  // =========================================================================
  describe('3. Dynamic Model Discovery & Adversarial Filtering', () => {
    it('filters out paid models, models with non-zero pricing, and preserves free models', async () => {
      const mockApiResponse = {
        data: [
          // Valid free models
          {
            id: 'nvidia/nemotron-3-super-120b-a12b:free',
            name: 'NVIDIA: Nemotron 3 Super (free)',
            context_length: 262144,
            pricing: { prompt: '0', completion: '0' },
          },
          {
            id: 'deepseek/deepseek-r1:free',
            name: 'DeepSeek R1 (free)',
            context_length: 64000,
            pricing: { prompt: 0, completion: 0 },
          },
          // Paid model masquerading without :free suffix
          {
            id: 'openai/gpt-4o',
            name: 'GPT-4o',
            context_length: 128000,
            pricing: { prompt: '0.005', completion: '0.015' },
          },
          // Paid model with partial 0 pricing (prompt free, completion paid)
          {
            id: 'some-vendor/half-free-model',
            name: 'Half Free Model',
            context_length: 32768,
            pricing: { prompt: '0', completion: '0.001' },
          },
          // Model with non-zero prompt pricing
          {
            id: 'some-vendor/paid-prompt-model',
            name: 'Paid Prompt Model',
            context_length: 32768,
            pricing: { prompt: '0.001', completion: '0' },
          },
          // Null or invalid item
          null,
          { name: 'Missing ID' },
        ],
      };

      const mockFetch = vi.fn().mockResolvedValue({
        ok: true,
        status: 200,
        json: async () => mockApiResponse,
      });

      const models = await fetchFreeModels({ fetchFn: mockFetch as unknown as typeof fetch });
      
      const ids = models.map((m) => m.id);
      expect(ids).toContain('openrouter/free');
      expect(ids).toContain('nvidia/nemotron-3-super-120b-a12b:free');
      expect(ids).toContain('deepseek/deepseek-r1:free');
      expect(ids).not.toContain('openai/gpt-4o');
      expect(ids).not.toContain('some-vendor/half-free-model');
      expect(ids).not.toContain('some-vendor/paid-prompt-model');
    });

    it('handles network failure, HTTP 500/403, and corrupted responses gracefully by falling back to FREE_MODELS', async () => {
      // Test HTTP error
      const mockFailFetch = vi.fn().mockResolvedValue({
        ok: false,
        status: 500,
      });
      const models1 = await fetchFreeModels({ fetchFn: mockFailFetch as unknown as typeof fetch });
      expect(models1.length).toBe(FREE_MODELS.length);

      // Test Network throw
      const mockThrowFetch = vi.fn().mockRejectedValue(new Error('Connection aborted'));
      const models2 = await fetchFreeModels({ fetchFn: mockThrowFetch as unknown as typeof fetch });
      expect(models2.length).toBe(FREE_MODELS.length);

      // Test Invalid JSON shape
      const mockBadJsonFetch = vi.fn().mockResolvedValue({
        ok: true,
        status: 200,
        json: async () => ({ invalid_field: 123 }),
      });
      const models3 = await fetchFreeModels({ fetchFn: mockBadJsonFetch as unknown as typeof fetch });
      expect(models3.length).toBe(FREE_MODELS.length);
    });

    it('verifies default model and profile mappings are all strictly valid free models', () => {
      const defaultModel = getDefaultModel();
      expect(isFreeModel(defaultModel)).toBe(true);

      const profiles: Array<'reasoning' | 'powerful' | 'balanced' | 'fast'> = [
        'reasoning',
        'powerful',
        'balanced',
        'fast',
      ];

      for (const profile of profiles) {
        const tierModels = getModelsForProfile(profile);
        expect(tierModels.length).toBeGreaterThanOrEqual(3);
        for (const model of tierModels) {
          expect(isFreeModel(model)).toBe(true);
        }
      }
    });
  });

  // =========================================================================
  // 4. ModelHealthCache State Transitions & Progressive Exponential Cooldown
  // =========================================================================
  describe('4. ModelHealthCache State Transitions & Progressive Cooldown', () => {
    let cache: ModelHealthCache;

    beforeEach(() => {
      cache = new ModelHealthCache(15000, 120000);
    });

    it('progressively escalates cooldown across multiple 429 strikes up to maxCooldownMs', () => {
      const model = 'test/rate-limited-model:free';

      // Strike 1: 15000 * 2^0 = 15000ms
      const now1 = Date.now();
      cache.recordRateLimit(model);
      expect(cache.isHealthy(model)).toBe(false);
      let remaining = cache.getCooldownRemaining(model);
      expect(remaining).toBeGreaterThan(14000);
      expect(remaining).toBeLessThanOrEqual(15000);

      // Strike 2: 15000 * 2^1 = 30000ms
      cache.recordRateLimit(model);
      remaining = cache.getCooldownRemaining(model);
      expect(remaining).toBeGreaterThan(29000);
      expect(remaining).toBeLessThanOrEqual(30000);

      // Strike 3: 15000 * 2^2 = 60000ms
      cache.recordRateLimit(model);
      remaining = cache.getCooldownRemaining(model);
      expect(remaining).toBeGreaterThan(59000);
      expect(remaining).toBeLessThanOrEqual(60000);

      // Strike 4: 15000 * 2^3 = 120000ms (maxCooldownMs)
      cache.recordRateLimit(model);
      remaining = cache.getCooldownRemaining(model);
      expect(remaining).toBeGreaterThan(119000);
      expect(remaining).toBeLessThanOrEqual(120000);

      // Strike 5: Capped at 120000ms
      cache.recordRateLimit(model);
      remaining = cache.getCooldownRemaining(model);
      expect(remaining).toBeGreaterThan(119000);
      expect(remaining).toBeLessThanOrEqual(120000);
    });

    it('automatically recovers healthy state when cooldown timestamp elapses', () => {
      const model = 'test/cooldown-model:free';
      // Set short custom cooldown
      cache.recordRateLimit(model, 10);
      expect(cache.isHealthy(model)).toBe(false);

      // Wait 25ms for cooldown to elapse
      return new Promise<void>((resolve) => {
        setTimeout(() => {
          expect(cache.isHealthy(model)).toBe(true);
          expect(cache.getCooldownRemaining(model)).toBe(0);
          resolve();
        }, 25);
      });
    });

    it('permanently marks dead models on 404 / decommissioned with Infinite cooldown', () => {
      const deadModel = 'vendor/decommissioned-model:free';
      cache.recordPermanentFailure(deadModel, 'Model not found (404)');

      expect(cache.isHealthy(deadModel)).toBe(false);
      expect(cache.getCooldownRemaining(deadModel)).toBe(Infinity);

      // Even after recording success, dead model remains dead
      cache.recordSuccess(deadModel);
      expect(cache.isHealthy(deadModel)).toBe(false);
    });

    it('reduces strikes on success and immediately marks model healthy', () => {
      const model = 'test/recover-model:free';
      cache.recordRateLimit(model);
      cache.recordRateLimit(model);
      expect(cache.isHealthy(model)).toBe(false);

      cache.recordSuccess(model);
      expect(cache.isHealthy(model)).toBe(true);
      expect(cache.getCooldownRemaining(model)).toBe(0);
    });

    it('resets all cached states when clear() is called', () => {
      cache.recordRateLimit('model-a:free');
      cache.recordPermanentFailure('model-b:free');
      expect(cache.isHealthy('model-a:free')).toBe(false);
      expect(cache.isHealthy('model-b:free')).toBe(false);

      cache.clear();
      expect(cache.isHealthy('model-a:free')).toBe(true);
      expect(cache.isHealthy('model-b:free')).toBe(true);
    });
  });

  // =========================================================================
  // 5. Cascade & Failover Execution Engine Stress Test
  // =========================================================================
  describe('5. Cascade & Failover Execution Engine Stress Test', () => {
    it('cascades seamlessly through a sequence of 429, 404, and 503 errors to the first healthy model', async () => {
      const cache = new ModelHealthCache();
      const events: Array<{ failed: string; next: string; reason: string }> = [];
      const calls: string[] = [];

      const candidates = ['model-429:free', 'model-404:free', 'model-503:free', 'model-ok:free'];

      const requestFn = vi.fn().mockImplementation(async (modelId: string) => {
        calls.push(modelId);
        if (modelId === 'model-429:free') {
          const err: any = new Error('Rate limit exceeded');
          err.status = 429;
          throw err;
        }
        if (modelId === 'model-404:free') {
          const err: any = new Error('Model decommissioned 404');
          err.status = 404;
          throw err;
        }
        if (modelId === 'model-503:free') {
          const err: any = new Error('Provider temporary outage 503');
          err.status = 503;
          throw err;
        }
        return `Response from ${modelId}`;
      });

      const result = await executeWithCascade(
        candidates,
        requestFn,
        {
          healthCache: cache,
          onFallback: (from, to, reason) => events.push({ failed: from, next: to, reason }),
          sleepFn: vi.fn(),
        }
      );

      expect(result).toBe('Response from model-ok:free');
      expect(calls).toEqual(['model-429:free', 'model-404:free', 'model-503:free', 'model-ok:free']);
      expect(events.length).toBe(3);
      expect(events[0].failed).toBe('model-429:free');
      expect(events[1].failed).toBe('model-404:free');
      expect(events[2].failed).toBe('model-503:free');

      // Verify health states recorded
      expect(cache.isHealthy('model-429:free')).toBe(false);
      expect(cache.isHealthy('model-404:free')).toBe(false);
      expect(cache.getCooldownRemaining('model-404:free')).toBe(Infinity);
      expect(cache.isHealthy('model-ok:free')).toBe(true);
    });

    it('falls back to openrouter/free meta-router when all initial candidates are cooling', async () => {
      const cache = new ModelHealthCache();
      cache.recordRateLimit('model-1:free');
      cache.recordRateLimit('model-2:free');

      const calls: string[] = [];
      const requestFn = vi.fn().mockImplementation(async (modelId: string) => {
        calls.push(modelId);
        if (modelId === 'openrouter/free') {
          return 'Meta-router fallback response';
        }
        const err: any = new Error('Rate limit 429');
        err.status = 429;
        throw err;
      });

      const candidates = ['model-1:free', 'model-2:free'];
      const result = await executeWithCascade(
        candidates,
        requestFn,
        {
          healthCache: cache,
          sleepFn: vi.fn(),
        }
      );

      expect(result).toBe('Meta-router fallback response');
      expect(calls).toContain('openrouter/free');
    });

    it('throws exhausted error when all cascade retries fail across all candidates', async () => {
      const cache = new ModelHealthCache();
      const requestFn = vi.fn().mockImplementation(async (modelId: string) => {
        const err: any = new Error(`429 Too Many Requests on ${modelId}`);
        err.status = 429;
        throw err;
      });

      const sleepFn = vi.fn();
      const candidates = ['model-a:free', 'model-b:free'];

      await expect(
        executeWithCascade(candidates, requestFn, {
          healthCache: cache,
          maxRetries: 2,
          sleepFn,
        })
      ).rejects.toThrow(/All fallback models exhausted after 2 cascade attempts/i);

      // Verify jitter sleep occurred between attempt 0 and attempt 1
      expect(sleepFn).toHaveBeenCalledTimes(1);
    });

    it('propagates non-retryable errors immediately without wasteful cascades', async () => {
      const cache = new ModelHealthCache();
      const requestFn = vi.fn().mockImplementation(async () => {
        const err: any = new Error('401 Unauthorized: Invalid API key');
        err.status = 401;
        throw err;
      });

      const candidates = ['model-1:free', 'model-2:free', 'model-3:free'];

      await expect(
        executeWithCascade(candidates, requestFn, { healthCache: cache })
      ).rejects.toThrow(/401 Unauthorized/i);

      // Should have halted on the very first attempt without cascading
      expect(requestFn).toHaveBeenCalledTimes(1);
    });

    it('handles high concurrency: 50 simultaneous cascade requests without race conditions', async () => {
      const cache = new ModelHealthCache();
      let callCount = 0;

      const requestFn = vi.fn().mockImplementation(async (modelId: string) => {
        callCount++;
        if (modelId === 'flaky:free' && callCount % 2 === 1) {
          const err: any = new Error('429 Rate limit');
          err.status = 429;
          throw err;
        }
        return `Success from ${modelId}`;
      });

      const candidates = ['flaky:free', 'solid:free', 'openrouter/free'];

      const promises = Array.from({ length: 50 }).map(() =>
        executeWithCascade(candidates, requestFn, { healthCache: cache, sleepFn: vi.fn() })
      );

      const results = await Promise.all(promises);
      expect(results.length).toBe(50);
      for (const res of results) {
        expect(res).toMatch(/Success from (flaky:free|solid:free)/);
      }
    });
  });

  // =========================================================================
  // 6. OpenRouterClient End-to-End Chat & Streaming Stress Test
  // =========================================================================
  describe('6. OpenRouterClient Chat & SSE Streaming Stress Test', () => {
    it('strictly enforces guardrails and blocks paid models before any HTTP call', async () => {
      const mockFetch = vi.fn();
      const client = new OpenRouterClient({
        apiKey: 'test-key',
        customFetch: mockFetch as unknown as typeof fetch,
      });

      const messages: ChatMessage[] = [{ role: 'user', content: 'test' }];

      await expect(client.chat(messages, 'openai/gpt-4o')).rejects.toThrow(/SECURITY GUARDRAIL/i);
      await expect(client.chatStream(messages, 'anthropic/claude-3.5-sonnet')).rejects.toThrow(
        /SECURITY GUARDRAIL/i
      );

      // No network calls should have been made
      expect(mockFetch).not.toHaveBeenCalled();
    });

    it('parses complex streaming SSE events with keepalives, multiline <think> blocks, and reasoning deltas', async () => {
      const sseChunks = [
        ': OPENROUTER PROCESSING\n\n',
        'data: {"choices":[{"delta":{"role":"assistant","reasoning":"Step 1: Parse requirements\\n"}}]}\n\n',
        ': OPENROUTER PROCESSING\n\n',
        'data: {"choices":[{"delta":{"content":"```typescript\\n"}}]}\n\n',
        'data: {"choices":[{"delta":{"content":"// <think>Internal architectural reflection</think>\\n"}}]}\n\n',
        'data: {"choices":[{"delta":{"content":"export function solve() { return 42; }\\n```"}}]}\n\n',
        'data: {"usage":{"cost":0}}\n\n',
        'data: [DONE]\n\n',
      ];

      const encoder = new TextEncoder();
      const stream = new ReadableStream({
        start(controller) {
          for (const chunk of sseChunks) {
            controller.enqueue(encoder.encode(chunk));
          }
          controller.close();
        },
      });

      const mockResponse = new Response(stream, {
        status: 200,
        headers: { 'Content-Type': 'text/event-stream' },
      });

      const mockFetch = vi.fn().mockResolvedValue(mockResponse);

      const client = new OpenRouterClient({
        apiKey: 'test-key',
        customFetch: mockFetch as unknown as typeof fetch,
      });

      const tokens: string[] = [];
      const thoughts: string[] = [];
      let completedContent = '';
      let completedReasoning = '';

      const callbacks: StreamCallbacks = {
        onToken: (t) => tokens.push(t),
        onReasoning: (r) => thoughts.push(r),
        onComplete: (c, r) => {
          completedContent = c;
          completedReasoning = r || '';
        },
      };

      const result = await client.chatStream(
        [{ role: 'user', content: 'Generate code' }],
        'nvidia/nemotron-3-super-120b-a12b:free',
        callbacks
      );

      expect(result).toContain('export function solve() { return 42; }');
      expect(completedContent).toContain('export function solve() { return 42; }');
      expect(completedReasoning).toContain('Step 1: Parse requirements');
      expect(completedReasoning).toContain('Internal architectural reflection');
    });

    it('verifies zero cost validation on non-streaming responses and throws if paid usage is reported', async () => {
      const mockPaidResponse = {
        choices: [{ message: { content: 'Paid response' } }],
        usage: { cost: 0.05 },
      };

      const mockFetch = vi.fn().mockResolvedValue({
        ok: true,
        status: 200,
        json: async () => mockPaidResponse,
      });

      const client = new OpenRouterClient({
        apiKey: 'test-key',
        customFetch: mockFetch as unknown as typeof fetch,
      });

      await expect(
        client.chat([{ role: 'user', content: 'Hi' }], 'google/gemini-2.0-flash-exp:free')
      ).rejects.toThrow(/SECURITY WARNING.*Non-zero cost/i);
    });

    it('constructs correct cascade fallback list for any chosen free model', async () => {
      const client = new OpenRouterClient();
      const cascadeList = (client as any).buildCascadeList('google/gemini-2.0-flash-exp:free');

      expect(cascadeList[0]).toBe('google/gemini-2.0-flash-exp:free');
      expect(cascadeList).toContain('openrouter/free');
      expect(cascadeList.every((id: string) => isFreeModel(id))).toBe(true);
    });
  });
});
