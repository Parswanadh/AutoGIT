import { describe, it, expect, vi } from 'vitest';
import { OpenRouterClient, StreamCallbacks, ChatMessage } from '../../lib/openrouter/client';
import { ModelHealthCache, executeWithCascade } from '../../lib/openrouter/retry';
import { verifyZeroCost, validateEndpoint, validateModelId } from '../../lib/openrouter/guardrails';

function createMockSseResponse(chunks: string[] | Uint8Array[]): Response {
  const encoder = new TextEncoder();
  const stream = new ReadableStream({
    start(controller) {
      for (const chunk of chunks) {
        if (typeof chunk === 'string') {
          controller.enqueue(encoder.encode(chunk));
        } else {
          controller.enqueue(chunk);
        }
      }
      controller.close();
    },
  });

  return new Response(stream, {
    status: 200,
    headers: { 'Content-Type': 'text/event-stream' },
  });
}

describe('M2 Empirical Stress Tests: SSE Streaming & Reasoning Parser', () => {
  // Test 1: Broken / Malformed JSON chunks in SSE stream
  describe('1. Malformed and Broken SSE Chunks', () => {
    it('survives corrupted, truncated, and invalid JSON chunks without terminating early', async () => {
      const chunks = [
        'data: { invalid json truncated...\n\n',
        'data: {"choices":[{"delta":{"content":"Valid chunk 1 "}}]}\n\n',
        'data: {"random_unrelated_object": 123}\n\n',
        'data: null\n\n',
        'data: {"choices":[]}\n\n',
        'data: {"choices":[{"delta":{}}]}\n\n',
        'data: {"choices":[{"delta":{"content":"Valid chunk 2"}}]}\n\n',
        'data: [DONE]\n\n',
      ];

      const client = new OpenRouterClient({
        apiKey: 'test-key',
        customFetch: vi.fn().mockResolvedValue(createMockSseResponse(chunks)) as unknown as typeof fetch,
      });

      const tokens: string[] = [];
      const result = await client.chatStream(
        [{ role: 'user', content: 'Test malformed' }],
        'openrouter/free',
        { onToken: (tok) => tokens.push(tok) }
      );

      expect(result).toBe('Valid chunk 1 Valid chunk 2');
      expect(tokens.join('')).toBe('Valid chunk 1 Valid chunk 2');
    });

    it('handles arbitrary chunk boundary splits across JSON keys and values', async () => {
      // Split single SSE event across 5 micro-chunks
      const microChunks = [
        'da',
        'ta: {"choices":',
        '[{"delta":{"content":"Spl',
        'it across many chunks"}}',
        ']}\n\ndata: [DONE]\n\n',
      ];

      const client = new OpenRouterClient({
        apiKey: 'test-key',
        customFetch: vi.fn().mockResolvedValue(createMockSseResponse(microChunks)) as unknown as typeof fetch,
      });

      const result = await client.chatStream(
        [{ role: 'user', content: 'Test micro-chunks' }],
        'openrouter/free'
      );

      expect(result).toBe('Split across many chunks');
    });

    it('handles Windows CRLF (\\r\\n) and mixed line endings seamlessly', async () => {
      const crlfChunks = [
        'data: {"choices":[{"delta":{"content":"Line 1\\r\\n"}}]}\r\n\r\n',
        ': comment line with CRLF\r\n',
        'data: {"choices":[{"delta":{"content":"Line 2"}}]}\r\n\r\n',
        'data: [DONE]\r\n\r\n',
      ];

      const client = new OpenRouterClient({
        apiKey: 'test-key',
        customFetch: vi.fn().mockResolvedValue(createMockSseResponse(crlfChunks)) as unknown as typeof fetch,
      });

      const result = await client.chatStream(
        [{ role: 'user', content: 'Test CRLF' }],
        'openrouter/free'
      );

      expect(result).toBe('Line 1\r\nLine 2');
    });
  });

  // Test 2: Multibyte Unicode Character Splitting
  describe('2. Split Multibyte UTF-8 Characters Across Chunk Boundaries', () => {
    it('correctly reconstructs 4-byte UTF-8 emojis split byte-by-byte across chunks', async () => {
      // Emoji 🚀 is 4 bytes: 0xF0, 0x9F, 0x9A, 0x80
      // Emoji 🤖 is 4 bytes: 0xF0, 0x9F, 0xA4, 0x96
      const prefix = new TextEncoder().encode('data: {"choices":[{"delta":{"content":"Rocket: ');
      const byte1 = new Uint8Array([0xF0]);
      const byte2 = new Uint8Array([0x9F]);
      const byte3 = new Uint8Array([0x9A]);
      const byte4 = new Uint8Array([0x80]);
      const suffix = new TextEncoder().encode(' & Robot: 🤖"}}]}\n\ndata: [DONE]\n\n');

      const client = new OpenRouterClient({
        apiKey: 'test-key',
        customFetch: vi.fn().mockResolvedValue(
          createMockSseResponse([prefix, byte1, byte2, byte3, byte4, suffix])
        ) as unknown as typeof fetch,
      });

      const result = await client.chatStream(
        [{ role: 'user', content: 'Test emoji splits' }],
        'openrouter/free'
      );

      expect(result).toBe('Rocket: 🚀 & Robot: 🤖');
    });

    it('correctly handles 3-byte CJK characters split across chunk boundaries', async () => {
      // 'AutoGIT' + '你好世界' ('你' = 0xE4 0xBD 0xA0, '好' = 0xE5 0xA5 0xBD)
      const chunk1 = new TextEncoder().encode('data: {"choices":[{"delta":{"content":"Code: ');
      const splitChar1 = new Uint8Array([0xE4, 0xBD]); // partial '你'
      const splitChar2 = new Uint8Array([0xA0, 0xE5]); // complete '你', partial '好'
      const splitChar3 = new Uint8Array([0xA5, 0xBD]); // complete '好'
      const rest = new TextEncoder().encode('"}}]}\n\ndata: [DONE]\n\n');

      const client = new OpenRouterClient({
        apiKey: 'test-key',
        customFetch: vi.fn().mockResolvedValue(
          createMockSseResponse([chunk1, splitChar1, splitChar2, splitChar3, rest])
        ) as unknown as typeof fetch,
      });

      const result = await client.chatStream(
        [{ role: 'user', content: 'Test CJK splits' }],
        'openrouter/free'
      );

      expect(result).toBe('Code: 你好');
    });
  });

  // Test 3: SSE Comments and Keepalive lines
  describe('3. SSE Comments and Keepalive Heartbeats', () => {
    it('filters out diverse SSE comments, ping heartbeats, and raw colons', async () => {
      const chunks = [
        ':\n',
        ': OPENROUTER PROCESSING\n',
        ':keep-alive\n',
        ':    leading whitespace in comment\n',
        '   : indented comment line\n',
        'data: {"choices":[{"delta":{"content":"Hello "}}]}\n\n',
        ': ping 1234567890\n',
        'data: {"choices":[{"delta":{"content":"World"}}]}\n\n',
        ': [DONE]\n',
        'data: [DONE]\n\n',
      ];

      const client = new OpenRouterClient({
        apiKey: 'test-key',
        customFetch: vi.fn().mockResolvedValue(createMockSseResponse(chunks)) as unknown as typeof fetch,
      });

      const tokens: string[] = [];
      const result = await client.chatStream(
        [{ role: 'user', content: 'Test comments' }],
        'openrouter/free',
        { onToken: (tok) => tokens.push(tok) }
      );

      expect(result).toBe('Hello World');
      expect(tokens).toEqual(['Hello ', 'World']);
    });
  });

  // Test 4: Reasoning & <think> Tags Parsing
  describe('4. Chain-of-Thought & <think> Tags Parsing', () => {
    it('handles native delta.reasoning tokens separately from content', async () => {
      const chunks = [
        'data: {"choices":[{"delta":{"reasoning":"Step 1: Analyze problem. "}}]}\n\n',
        'data: {"choices":[{"delta":{"reasoning":"Step 2: Propose solution."}}]}\n\n',
        'data: {"choices":[{"delta":{"content":"The solution is 42."}}]}\n\n',
        'data: [DONE]\n\n',
      ];

      const client = new OpenRouterClient({
        apiKey: 'test-key',
        customFetch: vi.fn().mockResolvedValue(createMockSseResponse(chunks)) as unknown as typeof fetch,
      });

      let reasoningAccum = '';
      let contentAccum = '';
      let completedReasoning = '';
      let completedContent = '';

      const callbacks: StreamCallbacks = {
        onReasoning: (r) => { reasoningAccum += r; },
        onToken: (t) => { contentAccum += t; },
        onComplete: (content, reasoning) => {
          completedContent = content;
          completedReasoning = reasoning || '';
        },
      };

      const result = await client.chatStream(
        [{ role: 'user', content: 'Reasoning test' }],
        'deepseek/deepseek-r1:free',
        callbacks
      );

      expect(result).toBe('The solution is 42.');
      expect(contentAccum).toBe('The solution is 42.');
      expect(reasoningAccum).toBe('Step 1: Analyze problem. Step 2: Propose solution.');
      expect(completedContent).toBe('The solution is 42.');
      expect(completedReasoning).toBe('Step 1: Analyze problem. Step 2: Propose solution.');
    });

    it('handles reasoning_details field from newer OpenRouter providers', async () => {
      const chunks = [
        'data: {"choices":[{"delta":{"reasoning_details":[{"text":"Examining AST..."}]}}]}\n\n',
        'data: {"choices":[{"delta":{"content":"AST is valid."}}]}\n\n',
        'data: [DONE]\n\n',
      ];

      const client = new OpenRouterClient({
        apiKey: 'test-key',
        customFetch: vi.fn().mockResolvedValue(createMockSseResponse(chunks)) as unknown as typeof fetch,
      });

      let capturedReasoning = '';
      const result = await client.chatStream(
        [{ role: 'user', content: 'Reasoning details test' }],
        'deepseek/deepseek-r1:free',
        { onReasoning: (r) => { capturedReasoning += r; } }
      );

      expect(result).toBe('AST is valid.');
      expect(capturedReasoning).toBe('Examining AST...');
    });

    it('extracts embedded <think>...</think> blocks from content stream across multiple chunks', async () => {
      const chunks = [
        'data: {"choices":[{"delta":{"content":"Prefix text "}}]}\n\n',
        'data: {"choices":[{"delta":{"content":"<think>Let me "}}]}\n\n',
        'data: {"choices":[{"delta":{"content":"ponder this"}}]}\n\n',
        'data: {"choices":[{"delta":{"content":" thoroughly</think>Suffix result"}}]}\n\n',
        'data: [DONE]\n\n',
      ];

      const client = new OpenRouterClient({
        apiKey: 'test-key',
        customFetch: vi.fn().mockResolvedValue(createMockSseResponse(chunks)) as unknown as typeof fetch,
      });

      let reasoning = '';
      let tokens: string[] = [];

      const result = await client.chatStream(
        [{ role: 'user', content: 'Embedded think' }],
        'nvidia/nemotron-3-super-120b-a12b:free',
        {
          onReasoning: (r) => { reasoning += r; },
          onToken: (t) => tokens.push(t),
        }
      );

      expect(result).toBe('Prefix text Suffix result');
      expect(tokens.join('')).toBe('Prefix text Suffix result');
      expect(reasoning).toBe('Let me ponder this thoroughly');
    });

    it('handles unterminated <think> tag gracefully when stream ends without closing tag', async () => {
      const chunks = [
        'data: {"choices":[{"delta":{"content":"<think>Only thinking, never closed..."}}]}\n\n',
        'data: [DONE]\n\n',
      ];

      const client = new OpenRouterClient({
        apiKey: 'test-key',
        customFetch: vi.fn().mockResolvedValue(createMockSseResponse(chunks)) as unknown as typeof fetch,
      });

      let reasoning = '';
      const result = await client.chatStream(
        [{ role: 'user', content: 'Unterminated think' }],
        'openrouter/free',
        { onReasoning: (r) => { reasoning += r; } }
      );

      expect(result).toBe('');
      expect(reasoning).toBe('Only thinking, never closed...');
    });

    it('handles multiple sequential <think> blocks in a single stream', async () => {
      const chunks = [
        'data: {"choices":[{"delta":{"content":"<think>Plan 1</think>Part 1 "}}]}\n\n',
        'data: {"choices":[{"delta":{"content":"<think>Plan 2</think>Part 2"}}]}\n\n',
        'data: [DONE]\n\n',
      ];

      const client = new OpenRouterClient({
        apiKey: 'test-key',
        customFetch: vi.fn().mockResolvedValue(createMockSseResponse(chunks)) as unknown as typeof fetch,
      });

      let reasoning = '';
      const result = await client.chatStream(
        [{ role: 'user', content: 'Multiple think' }],
        'openrouter/free',
        { onReasoning: (r) => { reasoning += r; } }
      );

      expect(result).toBe('Part 1 Part 2');
      expect(reasoning).toBe('Plan 1Plan 2');
    });

    it('handles empty <think></think> tags and sequential think blocks across chunks', async () => {
      const chunks = [
        'data: {"choices":[{"delta":{"content":"<think></think>Start "}}]}\n\n',
        'data: {"choices":[{"delta":{"content":"<think>A</think>"}}]}\n\n',
        'data: {"choices":[{"delta":{"content":"<think>B</think>"}}]}\n\n',
        'data: {"choices":[{"delta":{"content":"Middle "}}]}\n\n',
        'data: {"choices":[{"delta":{"content":"End"}}]}\n\n',
        'data: [DONE]\n\n',
      ];

      const client = new OpenRouterClient({
        apiKey: 'test-key',
        customFetch: vi.fn().mockResolvedValue(createMockSseResponse(chunks)) as unknown as typeof fetch,
      });

      let reasoning = '';
      const result = await client.chatStream(
        [{ role: 'user', content: 'Empty and adjacent think' }],
        'openrouter/free',
        { onReasoning: (r) => { reasoning += r; } }
      );

      expect(result).toBe('Start Middle End');
      expect(reasoning).toBe('AB');
    });

    it('preserves exact code indentation, newlines, and whitespace in tokens', async () => {
      const pythonCode = 'def calculate_fibonacci(n: int) -> int:\n    if n <= 1:\n        return n\n    return calculate_fibonacci(n - 1) + calculate_fibonacci(n - 2)\n';
      const chunks = [
        'data: {"choices":[{"delta":{"content":"def calculate_fibonacci(n: int) -> int:\\n"}}]}\n\n',
        'data: {"choices":[{"delta":{"content":"    if n <= 1:\\n"}}]}\n\n',
        'data: {"choices":[{"delta":{"content":"        return n\\n"}}]}\n\n',
        'data: {"choices":[{"delta":{"content":"    return calculate_fibonacci(n - 1) + calculate_fibonacci(n - 2)\\n"}}]}\n\n',
        'data: [DONE]\n\n',
      ];

      const client = new OpenRouterClient({
        apiKey: 'test-key',
        customFetch: vi.fn().mockResolvedValue(createMockSseResponse(chunks)) as unknown as typeof fetch,
      });

      const result = await client.chatStream(
        [{ role: 'user', content: 'Code whitespace' }],
        'qwen/qwen-2.5-coder-32b-instruct:free'
      );

      expect(result).toBe(pythonCode);
    });
  });

  // Test 5: Stream Aborts, Errors, and Empty Streams
  describe('5. Stream Aborts, Errors, and Edge Conditions', () => {
    it('handles stream closing cleanly without explicit [DONE] message', async () => {
      const chunks = [
        'data: {"choices":[{"delta":{"content":"Clean close without done token"}}]}\n\n',
      ];

      const client = new OpenRouterClient({
        apiKey: 'test-key',
        customFetch: vi.fn().mockResolvedValue(createMockSseResponse(chunks)) as unknown as typeof fetch,
      });

      const result = await client.chatStream(
        [{ role: 'user', content: 'No done token' }],
        'openrouter/free'
      );

      expect(result).toBe('Clean close without done token');
    });

    it('handles an empty stream (0 bytes) gracefully returning empty strings', async () => {
      const client = new OpenRouterClient({
        apiKey: 'test-key',
        customFetch: vi.fn().mockResolvedValue(createMockSseResponse([])) as unknown as typeof fetch,
      });

      let completed = false;
      const result = await client.chatStream(
        [{ role: 'user', content: 'Empty stream' }],
        'openrouter/free',
        { onComplete: () => { completed = true; } }
      );

      expect(result).toBe('');
      expect(completed).toBe(true);
    });

    it('propagates stream reader mid-stream network drop and calls onError', async () => {
      const errorStream = new ReadableStream({
        start(controller) {
          controller.enqueue(new TextEncoder().encode('data: {"choices":[{"delta":{"content":"First chunk"}}]}\n\n'));
          controller.error(new Error('Network connection reset by peer'));
        },
      });

      const mockResponse = new Response(errorStream, {
        status: 200,
        headers: { 'Content-Type': 'text/event-stream' },
      });

      const client = new OpenRouterClient({
        apiKey: 'test-key',
        customFetch: vi.fn().mockResolvedValue(mockResponse) as unknown as typeof fetch,
      });

      let caughtErr: Error | null = null;
      await expect(
        client.chatStream(
          [{ role: 'user', content: 'Network drop' }],
          'openrouter/free',
          { onError: (err) => { caughtErr = err; } }
        )
      ).rejects.toThrow(/connection reset/i);

      expect(caughtErr).toBeDefined();
      expect(caughtErr?.message).toContain('Network connection reset');
    });

    it('rejects with error when response.body is null', async () => {
      const mockResponse = new Response(null, {
        status: 200,
        headers: { 'Content-Type': 'text/event-stream' },
      });

      const client = new OpenRouterClient({
        apiKey: 'test-key',
        customFetch: vi.fn().mockResolvedValue(mockResponse) as unknown as typeof fetch,
      });

      await expect(
        client.chatStream([{ role: 'user', content: 'Null body' }], 'openrouter/free')
      ).rejects.toThrow(/Response body is null/i);
    });

    it('handles high-volume stream stress of 1,000 rapid small chunks without loss or corruption', async () => {
      const totalTokens = 1000;
      const chunks: string[] = [];
      for (let i = 0; i < totalTokens; i++) {
        chunks.push(`data: {"choices":[{"delta":{"content":"${i % 10}"}}]}\n\n`);
      }
      chunks.push('data: [DONE]\n\n');

      const client = new OpenRouterClient({
        apiKey: 'test-key',
        customFetch: vi.fn().mockResolvedValue(createMockSseResponse(chunks)) as unknown as typeof fetch,
      });

      let tokenCount = 0;
      const result = await client.chatStream(
        [{ role: 'user', content: 'High volume stress' }],
        'openrouter/free',
        { onToken: () => { tokenCount++; } }
      );

      expect(tokenCount).toBe(1000);
      expect(result.length).toBe(1000);
    });
  });

  // Test 6: Token Usage & Cost Verification Guardrails
  describe('6. Token Usage & Zero Cost Verification', () => {
    it('accepts zero-cost usage reports during streaming', async () => {
      const chunks = [
        'data: {"choices":[{"delta":{"content":"Free response"}}],"usage":{"prompt_tokens":50,"completion_tokens":20,"total_tokens":70,"cost":0}}\n\n',
        'data: [DONE]\n\n',
      ];

      const client = new OpenRouterClient({
        apiKey: 'test-key',
        customFetch: vi.fn().mockResolvedValue(createMockSseResponse(chunks)) as unknown as typeof fetch,
      });

      const result = await client.chatStream(
        [{ role: 'user', content: 'Zero cost test' }],
        'openrouter/free'
      );

      expect(result).toBe('Free response');
    });

    it('throws security warning if non-zero cost is reported in SSE chunk', () => {
      expect(() => verifyZeroCost({ cost: 0.0015 })).toThrow(/\[SECURITY WARNING\] Non-zero cost reported/i);
      expect(() => verifyZeroCost({ cost: 0.00000001 })).toThrow(/\[SECURITY WARNING\] Non-zero cost reported/i);
      expect(() => verifyZeroCost({ cost: 0 })).not.toThrow();
      expect(() => verifyZeroCost({})).not.toThrow();
      expect(() => verifyZeroCost(undefined)).not.toThrow();
    });

    it('enforces strict guardrail against non-free models before sending stream request', async () => {
      const client = new OpenRouterClient({ apiKey: 'test-key' });
      await expect(client.chatStream([{ role: 'user', content: 'Hi' }], 'openai/gpt-4o')).rejects.toThrow(
        /\[SECURITY GUARDRAIL\]/i
      );
      await expect(client.chatStream([{ role: 'user', content: 'Hi' }], 'anthropic/claude-3.5-sonnet:beta')).rejects.toThrow(
        /\[SECURITY GUARDRAIL\]/i
      );
    });
  });

  // Test 7: Cascade Failover & Concurrency Stress
  describe('7. ModelHealthCache & Concurrency Stress', () => {
    it('handles multiple consecutive 429s across cascade tier before succeeding on fallback', async () => {
      const cache = new ModelHealthCache();
      const callSequence: string[] = [];
      const fallbackEvents: Array<{ from: string; to: string; reason: string }> = [];

      const mockRequestFn = vi.fn().mockImplementation(async (modelId: string) => {
        callSequence.push(modelId);
        if (modelId === 'model1:free' || modelId === 'model2:free') {
          const err: any = new Error('Rate limit 429');
          err.status = 429;
          throw err;
        }
        return `Result from ${modelId}`;
      });

      const candidates = ['model1:free', 'model2:free', 'model3:free', 'openrouter/free'];
      const result = await executeWithCascade(
        candidates,
        mockRequestFn,
        {
          healthCache: cache,
          onFallback: (from, to, reason) => fallbackEvents.push({ from, to, reason }),
          sleepFn: vi.fn(),
        }
      );

      expect(result).toBe('Result from model3:free');
      expect(callSequence).toEqual(['model1:free', 'model2:free', 'model3:free']);
      expect(fallbackEvents.length).toBe(2);
      expect(cache.isHealthy('model1:free')).toBe(false);
      expect(cache.isHealthy('model2:free')).toBe(false);
      expect(cache.isHealthy('model3:free')).toBe(true);
    });

    it('exhausts all retries and throws descriptive error when entire cascade fails', async () => {
      const cache = new ModelHealthCache();
      const mockRequestFn = vi.fn().mockImplementation(async () => {
        const err: any = new Error('503 Service Unavailable');
        err.status = 503;
        throw err;
      });

      await expect(
        executeWithCascade(['model1:free', 'openrouter/free'], mockRequestFn, {
          healthCache: cache,
          maxRetries: 2,
          sleepFn: vi.fn(),
        })
      ).rejects.toThrow(/All fallback models exhausted after 2 cascade attempts/i);
    });

    it('handles 25 concurrent stream requests with thread-safe health cache state transitions', async () => {
      const cache = new ModelHealthCache();
      const totalConcurrent = 25;

      const promises = Array.from({ length: totalConcurrent }, async (_, idx) => {
        return executeWithCascade(
          ['concur1:free', 'concur2:free', 'openrouter/free'],
          async (modelId) => {
            if (modelId === 'concur1:free' && idx % 2 === 0) {
              const err: any = new Error('429 Too Many Requests');
              err.status = 429;
              throw err;
            }
            return `OK-${idx}-${modelId}`;
          },
          { healthCache: cache, sleepFn: vi.fn() }
        );
      });

      const results = await Promise.all(promises);
      expect(results.length).toBe(25);
      expect(results.every((r) => r.startsWith('OK-'))).toBe(true);
    });
  });
});
