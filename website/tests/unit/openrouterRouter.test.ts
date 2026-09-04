import { describe, it, expect, vi, beforeEach } from 'vitest';
import {
  FREE_MODELS,
  getModelsForProfile,
  fetchFreeModels,
  ModelInfo,
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

describe('OpenRouter Models Catalog & Discovery', () => {
  it('exports a verified curated list of free-tier models', () => {
    expect(FREE_MODELS.length).toBeGreaterThan(5);
    for (const model of FREE_MODELS) {
      expect(model.isFree).toBe(true);
      expect(model.id.endsWith(':free') || model.id === 'openrouter/free').toBe(true);
      expect(model.name).toBeDefined();
      expect(model.contextLength).toBeGreaterThan(0);
    }
  });

  it('provides profile-based model recommendations', () => {
    const reasoningModels = getModelsForProfile('reasoning');
    const powerfulModels = getModelsForProfile('powerful');
    const balancedModels = getModelsForProfile('balanced');
    const fastModels = getModelsForProfile('fast');

    expect(reasoningModels.length).toBeGreaterThan(0);
    expect(powerfulModels.length).toBeGreaterThan(0);
    expect(balancedModels.length).toBeGreaterThan(0);
    expect(fastModels.length).toBeGreaterThan(0);

    for (const id of reasoningModels) {
      expect(id.endsWith(':free') || id === 'openrouter/free').toBe(true);
    }
  });

  it('fetches and filters free models dynamically from OpenRouter /models API', async () => {
    const mockApiResponse = {
      data: [
        {
          id: 'nvidia/nemotron-3-super-120b-a12b:free',
          name: 'NVIDIA: Nemotron 3 Super (free)',
          context_length: 262144,
          pricing: { prompt: '0', completion: '0' },
          top_provider: { context_length: 262144, max_completion_tokens: 235929 },
        },
        {
          id: 'openai/gpt-4o',
          name: 'GPT-4o (Paid)',
          context_length: 128000,
          pricing: { prompt: '0.005', completion: '0.015' },
        },
        {
          id: 'minimax/minimax-m2.7:free',
          name: 'MiniMax M2.7 (free)',
          context_length: 196608,
          pricing: { prompt: '0', completion: '0' },
        },
      ],
    };

    const mockFetch = vi.fn().mockResolvedValue({
      ok: true,
      status: 200,
      json: async () => mockApiResponse,
    });

    const models = await fetchFreeModels({ fetchFn: mockFetch as unknown as typeof fetch });
    expect(models.length).toBeGreaterThanOrEqual(2);
    expect(models.some((m) => m.id === 'nvidia/nemotron-3-super-120b-a12b:free')).toBe(true);
    expect(models.some((m) => m.id === 'minimax/minimax-m2.7:free')).toBe(true);
    // Paid model must be filtered out
    expect(models.some((m) => m.id === 'openai/gpt-4o')).toBe(false);
  });

  it('gracefully falls back to curated catalog if fetch fails', async () => {
    const mockFetch = vi.fn().mockRejectedValue(new Error('Network error'));
    const models = await fetchFreeModels({ fetchFn: mockFetch as unknown as typeof fetch });
    expect(models.length).toBe(FREE_MODELS.length);
    expect(models[0].id).toBe(FREE_MODELS[0].id);
  });
});

describe('ModelHealthCache & Fallback Cascades', () => {
  let cache: ModelHealthCache;

  beforeEach(() => {
    cache = new ModelHealthCache();
  });

  it('initializes models as healthy by default', () => {
    expect(cache.isHealthy('google/gemini-2.0-flash-exp:free')).toBe(true);
    expect(cache.getHealthyCandidates(['model-a:free', 'model-b:free'])).toEqual([
      'model-a:free',
      'model-b:free',
    ]);
  });

  it('records 429 rate limit and marks model as cooling with exponential cooldown', () => {
    const model = 'google/gemini-2.0-flash-exp:free';
    cache.recordRateLimit(model);
    expect(cache.isHealthy(model)).toBe(false);

    const remaining = cache.getCooldownRemaining(model);
    expect(remaining).toBeGreaterThan(0);
  });

  it('permanently marks 404/invalid models as dead', () => {
    const model = 'invalid/decommissioned-model:free';
    cache.recordPermanentFailure(model);
    expect(cache.isHealthy(model)).toBe(false);
    expect(cache.getCooldownRemaining(model)).toBe(Infinity);
  });

  it('recovers healthy status after recording success', () => {
    const model = 'nvidia/nemotron-3-super-120b-a12b:free';
    cache.recordRateLimit(model);
    expect(cache.isHealthy(model)).toBe(false);
    cache.recordSuccess(model);
    expect(cache.isHealthy(model)).toBe(true);
  });

  it('executes request with automatic cascading failover when primary model 429s', async () => {
    const fallbackEvents: Array<{ from: string; to: string; reason: string }> = [];
    const attemptLog: string[] = [];

    const requestFn = vi.fn().mockImplementation(async (modelId: string) => {
      attemptLog.push(modelId);
      if (modelId === 'primary:free') {
        const error = new Error('Rate limit exceeded');
        (error as any).status = 429;
        throw error;
      }
      return `Success from ${modelId}`;
    });

    const candidates = ['primary:free', 'secondary:free', 'openrouter/free'];
    const result = await executeWithCascade(
      candidates,
      requestFn,
      {
        healthCache: cache,
        onFallback: (from, to, reason) => fallbackEvents.push({ from, to, reason }),
        sleepFn: vi.fn(),
      }
    );

    expect(result).toBe('Success from secondary:free');
    expect(attemptLog).toEqual(['primary:free', 'secondary:free']);
    expect(fallbackEvents.length).toBe(1);
    expect(fallbackEvents[0].from).toBe('primary:free');
    expect(fallbackEvents[0].to).toBe('secondary:free');
    expect(cache.isHealthy('primary:free')).toBe(false);
    expect(cache.isHealthy('secondary:free')).toBe(true);
  });

  it('fails fast on HTTP 401 Unauthorized without cycling through fallbacks', async () => {
    const attemptLog: string[] = [];
    const requestFn = vi.fn().mockImplementation(async (modelId: string) => {
      attemptLog.push(modelId);
      const error = new Error('Invalid API key provided');
      (error as any).status = 401;
      throw error;
    });

    await expect(
      executeWithCascade(['model-a:free', 'model-b:free', 'openrouter/free'], requestFn, {
        healthCache: cache,
        sleepFn: vi.fn(),
      })
    ).rejects.toThrow('Invalid API key provided');

    expect(attemptLog).toEqual(['model-a:free']);
  });

  it('cascades to fallback when encountering guardrail or data policy restrictions', async () => {
    const fallbackEvents: Array<{ from: string; to: string; reason: string }> = [];
    const attemptLog: string[] = [];

    const requestFn = vi.fn().mockImplementation(async (modelId: string) => {
      attemptLog.push(modelId);
      if (modelId === 'restricted:free') {
        const error = new Error('OpenRouter API error (status 400): No endpoints available matching your guardrail restrictions.');
        (error as any).status = 400;
        throw error;
      }
      return `Success from ${modelId}`;
    });

    const result = await executeWithCascade(
      ['restricted:free', 'allowed:free'],
      requestFn,
      {
        healthCache: cache,
        onFallback: (from, to, reason) => fallbackEvents.push({ from, to, reason }),
        sleepFn: vi.fn(),
      }
    );

    expect(result).toBe('Success from allowed:free');
    expect(attemptLog).toEqual(['restricted:free', 'allowed:free']);
    expect(fallbackEvents.length).toBe(1);
    expect(fallbackEvents[0].reason).toContain('Guardrail / account data policy');
    expect(cache.isHealthy('restricted:free')).toBe(false);
  });
});

describe('OpenRouterClient', () => {
  let client: OpenRouterClient;

  beforeEach(() => {
    client = new OpenRouterClient({ apiKey: 'sk-or-v1-test-token' });
  });

  it('rejects paid models when invoking chatStream or chat', async () => {
    const messages: ChatMessage[] = [{ role: 'user', content: 'Hello' }];
    await expect(client.chatStream(messages, 'openai/gpt-4o')).rejects.toThrow(/SECURITY GUARDRAIL/i);
    await expect(client.chat(messages, 'anthropic/claude-3.5-sonnet')).rejects.toThrow(/SECURITY GUARDRAIL/i);
  });

  it('executes non-streaming chat with free-tier model', async () => {
    const mockJson = {
      id: 'gen-123',
      choices: [
        {
          message: {
            role: 'assistant',
            content: 'def hello_world(): return "hello"',
          },
        },
      ],
      usage: { cost: 0 },
    };

    const mockFetch = vi.fn().mockResolvedValue({
      ok: true,
      status: 200,
      json: async () => mockJson,
      text: async () => JSON.stringify(mockJson),
    });

    const testClient = new OpenRouterClient({
      apiKey: 'sk-or-v1-test-token',
      customFetch: mockFetch as unknown as typeof fetch,
    });

    const messages: ChatMessage[] = [{ role: 'user', content: 'Write hello world' }];
    const response = await testClient.chat(messages, 'nvidia/nemotron-3-super-120b-a12b:free');

    expect(response).toBe('def hello_world(): return "hello"');
    expect(mockFetch).toHaveBeenCalledTimes(1);
    const [url, reqInit] = mockFetch.mock.calls[0];
    expect(url).toBe('https://openrouter.ai/api/v1/chat/completions');
    const parsedBody = JSON.parse(reqInit.body);
    expect(parsedBody.model).toBe('nvidia/nemotron-3-super-120b-a12b:free');
    expect(parsedBody.stream).toBe(false);
    expect(parsedBody.models).toBeUndefined();
    expect(parsedBody.route).toBeUndefined();
  });

  it('parses SSE stream chunks, ignores keepalive comments, and extracts reasoning tokens', async () => {
    const ssePayload = [
      ': OPENROUTER PROCESSING\n\n',
      'data: {"choices":[{"delta":{"role":"assistant","reasoning":"Thinking about password logic..."}}]}\n\n',
      ': OPENROUTER PROCESSING\n\n',
      'data: {"choices":[{"delta":{"content":"import secrets\\n"}}]}\n\n',
      'data: {"choices":[{"delta":{"content":"def get_pass(): return secrets.token_hex(16)"}}]}\n\n',
      'data: [DONE]\n\n',
    ].join('');

    const encoder = new TextEncoder();
    const stream = new ReadableStream({
      start(controller) {
        controller.enqueue(encoder.encode(ssePayload));
        controller.close();
      },
    });

    const mockResponse = new Response(stream, {
      status: 200,
      headers: { 'Content-Type': 'text/event-stream' },
    });

    const mockFetch = vi.fn().mockResolvedValue(mockResponse);

    const testClient = new OpenRouterClient({
      apiKey: 'sk-or-v1-test-token',
      customFetch: mockFetch as unknown as typeof fetch,
    });

    const tokens: string[] = [];
    const reasoningChunks: string[] = [];
    let completedContent = '';
    let completedReasoning = '';

    const callbacks: StreamCallbacks = {
      onToken: (tok) => tokens.push(tok),
      onReasoning: (r) => reasoningChunks.push(r),
      onComplete: (full, reasoning) => {
        completedContent = full;
        completedReasoning = reasoning || '';
      },
    };

    const messages: ChatMessage[] = [{ role: 'user', content: 'Generate code' }];
    const result = await testClient.chatStream(
      messages,
      'nvidia/nemotron-3-super-120b-a12b:free',
      callbacks
    );

    expect(tokens.join('')).toBe('import secrets\ndef get_pass(): return secrets.token_hex(16)');
    expect(result).toBe('import secrets\ndef get_pass(): return secrets.token_hex(16)');
    expect(reasoningChunks.join('')).toBe('Thinking about password logic...');
    expect(completedContent).toBe('import secrets\ndef get_pass(): return secrets.token_hex(16)');
    expect(completedReasoning).toBe('Thinking about password logic...');
    const [, streamReqInit] = mockFetch.mock.calls[0];
    const streamBody = JSON.parse(streamReqInit.body);
    expect(streamBody.model).toBe('nvidia/nemotron-3-super-120b-a12b:free');
    expect(streamBody.models).toBeUndefined();
    expect(streamBody.route).toBeUndefined();
  });

  it('handles embedded <think>...</think> blocks within content stream', async () => {
    const ssePayload = [
      'data: {"choices":[{"delta":{"content":"<think>Internal plan</think>Actual output"}}]}\n\n',
      'data: [DONE]\n\n',
    ].join('');

    const encoder = new TextEncoder();
    const stream = new ReadableStream({
      start(controller) {
        controller.enqueue(encoder.encode(ssePayload));
        controller.close();
      },
    });

    const mockResponse = new Response(stream, {
      status: 200,
      headers: { 'Content-Type': 'text/event-stream' },
    });

    const mockFetch = vi.fn().mockResolvedValue(mockResponse);

    const testClient = new OpenRouterClient({
      apiKey: 'sk-or-v1-test-token',
      customFetch: mockFetch as unknown as typeof fetch,
    });

    let capturedReasoning = '';
    const callbacks: StreamCallbacks = {
      onReasoning: (r) => {
        capturedReasoning += r;
      },
    };

    const messages: ChatMessage[] = [{ role: 'user', content: 'Test' }];
    const result = await testClient.chatStream(
      messages,
      'google/gemini-2.0-flash-exp:free',
      callbacks
    );

    expect(result).toBe('Actual output');
    expect(capturedReasoning).toContain('Internal plan');
  });

  it('handles multiple and adjacent <think>...</think> blocks within a single chunk without dropping content', async () => {
    const ssePayload = [
      'data: {"choices":[{"delta":{"content":"<think>Plan 1</think><think>Plan 2</think>Middle <think>Plan 3</think>End"}}]}\n\n',
      'data: [DONE]\n\n',
    ].join('');

    const encoder = new TextEncoder();
    const stream = new ReadableStream({
      start(controller) {
        controller.enqueue(encoder.encode(ssePayload));
        controller.close();
      },
    });

    const mockResponse = new Response(stream, {
      status: 200,
      headers: { 'Content-Type': 'text/event-stream' },
    });

    const mockFetch = vi.fn().mockResolvedValue(mockResponse);

    const testClient = new OpenRouterClient({
      apiKey: 'sk-or-v1-test-token',
      customFetch: mockFetch as unknown as typeof fetch,
    });

    let capturedReasoning = '';
    const tokens: string[] = [];
    const callbacks: StreamCallbacks = {
      onReasoning: (r) => {
        capturedReasoning += r;
      },
      onToken: (t) => {
        tokens.push(t);
      },
    };

    const messages: ChatMessage[] = [{ role: 'user', content: 'Test multi-think' }];
    const result = await testClient.chatStream(
      messages,
      'deepseek/deepseek-r1:free',
      callbacks
    );

    expect(result).toBe('Middle End');
    expect(tokens.join('')).toBe('Middle End');
    expect(capturedReasoning).toBe('Plan 1Plan 2Plan 3');
  });

  it('auto-cascades to fallback free model when stream encounters 429', async () => {
    const failResponse = new Response(JSON.stringify({ error: { message: 'Rate limited', code: 429 } }), {
      status: 429,
      headers: { 'Content-Type': 'application/json' },
    });

    const ssePayload = [
      'data: {"choices":[{"delta":{"content":"Fallback success"}}]}\n\n',
      'data: [DONE]\n\n',
    ].join('');

    const encoder = new TextEncoder();
    const successStream = new ReadableStream({
      start(controller) {
        controller.enqueue(encoder.encode(ssePayload));
        controller.close();
      },
    });

    const successResponse = new Response(successStream, {
      status: 200,
      headers: { 'Content-Type': 'text/event-stream' },
    });

    const mockFetch = vi
      .fn()
      .mockResolvedValueOnce(failResponse)
      .mockResolvedValueOnce(successResponse);

    const fallbacksLogged: Array<{ failed: string; next: string }> = [];

    const testClient = new OpenRouterClient({
      apiKey: 'sk-or-v1-test-token',
      customFetch: mockFetch as unknown as typeof fetch,
    });

    const result = await testClient.chatStream(
      [{ role: 'user', content: 'Test' }],
      'google/gemini-2.0-flash-exp:free',
      {
        onFallback: (failed, next) => {
          fallbacksLogged.push({ failed, next });
        },
      }
    );

    expect(result).toBe('Fallback success');
    expect(fallbacksLogged.length).toBe(1);
    expect(fallbacksLogged[0].failed).toBe('google/gemini-2.0-flash-exp:free');
    expect(mockFetch).toHaveBeenCalledTimes(2);
  });

  it('updates API key dynamically with setApiKey', async () => {
    const mockJson = {
      choices: [{ message: { content: 'OK' } }],
    };
    const mockFetch = vi.fn().mockResolvedValue({
      ok: true,
      status: 200,
      json: async () => mockJson,
    });

    const testClient = new OpenRouterClient({
      apiKey: 'initial-key',
      customFetch: mockFetch as unknown as typeof fetch,
    });

    testClient.setApiKey('updated-key-123');
    await testClient.chat([{ role: 'user', content: 'Hi' }]);

    const [, reqInit] = mockFetch.mock.calls[0];
    expect(reqInit.headers.Authorization).toBe('Bearer updated-key-123');
  });

  it('retrieves available free models via client method', async () => {
    const models = await client.getAvailableFreeModels();
    expect(models.length).toBeGreaterThan(0);
    expect(models[0].isFree).toBe(true);
  });

  it('handles stream reader chunk boundaries splitting JSON payloads', async () => {
    const chunk1 = 'data: {"choices":[{"delta":{"content":"Chunk One ';
    const chunk2 = 'and Chunk Two"}}]}\ndata: [DONE]\n\n';

    const encoder = new TextEncoder();
    const stream = new ReadableStream({
      start(controller) {
        controller.enqueue(encoder.encode(chunk1));
        controller.enqueue(encoder.encode(chunk2));
        controller.close();
      },
    });

    const mockResponse = new Response(stream, {
      status: 200,
      headers: { 'Content-Type': 'text/event-stream' },
    });

    const mockFetch = vi.fn().mockResolvedValue(mockResponse);

    const testClient = new OpenRouterClient({
      apiKey: 'test-key',
      customFetch: mockFetch as unknown as typeof fetch,
    });

    const result = await testClient.chatStream(
      [{ role: 'user', content: 'Test split chunk' }],
      'openrouter/free'
    );

    expect(result).toBe('Chunk One and Chunk Two');
  });

  it('handles and reports stream errors via onError callback', async () => {
    const errorStream = new ReadableStream({
      start(controller) {
        controller.error(new Error('Connection dropped'));
      },
    });

    const mockResponse = new Response(errorStream, {
      status: 200,
      headers: { 'Content-Type': 'text/event-stream' },
    });

    const mockFetch = vi.fn().mockResolvedValue(mockResponse);

    const testClient = new OpenRouterClient({
      apiKey: 'test-key',
      customFetch: mockFetch as unknown as typeof fetch,
    });

    let streamError: Error | null = null;
    const callbacks: StreamCallbacks = {
      onError: (err) => {
        streamError = err;
      },
    };

    await expect(
      testClient.chatStream(
        [{ role: 'user', content: 'Test stream drop' }],
        'openrouter/free',
        callbacks
      )
    ).rejects.toThrow(/Connection dropped/i);

    expect(streamError).toBeDefined();
  });
});

