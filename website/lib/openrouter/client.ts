import {
  OPENROUTER_BASE_URL,
  validateModelId,
  validateEndpoint,
  verifyZeroCost,
} from './guardrails';
import {
  ModelInfo,
  FREE_MODELS,
  RECOMMENDED_TIERS,
  getDefaultModel,
  fetchFreeModels,
} from './models';
import { ModelHealthCache, executeWithCascade } from './retry';

export interface ChatMessage {
  role: 'system' | 'user' | 'assistant';
  content: string;
}

export interface StreamCallbacks {
  onToken?: (token: string) => void;
  onReasoning?: (thought: string) => void;
  onError?: (err: Error) => void;
  onComplete?: (fullText: string, reasoning?: string) => void;
  onFallback?: (failedModel: string, nextModel: string, reason: string) => void;
}

export interface IOpenRouterClient {
  getAvailableFreeModels(): Promise<ModelInfo[]>;
  chatStream(
    messages: ChatMessage[],
    preferredModel?: string,
    callbacks?: StreamCallbacks
  ): Promise<string>;
  chat(messages: ChatMessage[], preferredModel?: string): Promise<string>;
}

export interface OpenRouterClientOptions {
  apiKey?: string;
  baseUrl?: string;
  healthCache?: ModelHealthCache;
  customFetch?: typeof fetch;
  defaultModel?: string;
}

export class OpenRouterClient implements IOpenRouterClient {
  private apiKey: string;
  private baseUrl: string;
  private healthCache: ModelHealthCache;
  private fetchImpl: typeof fetch;
  private defaultModel: string;

  constructor(options?: OpenRouterClientOptions) {
    this.apiKey = options?.apiKey || '';
    this.baseUrl = options?.baseUrl || OPENROUTER_BASE_URL;
    validateEndpoint(this.baseUrl);

    this.healthCache = options?.healthCache || new ModelHealthCache();
    this.fetchImpl =
      options?.customFetch ||
      (typeof window !== 'undefined' ? window.fetch.bind(window) : fetch);
    this.defaultModel = options?.defaultModel || getDefaultModel();
    validateModelId(this.defaultModel);
  }

  /**
   * Updates the active OpenRouter API Key.
   */
  public setApiKey(apiKey: string): void {
    this.apiKey = apiKey.trim();
  }

  /**
   * Retrieves list of verified available free-tier models.
   */
  public async getAvailableFreeModels(): Promise<ModelInfo[]> {
    return fetchFreeModels({
      apiKey: this.apiKey,
      fetchFn: this.fetchImpl,
    });
  }

  /**
   * Builds an ordered list of fallback free models for cascading execution.
   */
  private buildCascadeList(preferredModel: string): string[] {
    validateModelId(preferredModel);

    // Find tier containing preferred model
    let tierCandidates: string[] = [];
    for (const list of Object.values(RECOMMENDED_TIERS)) {
      if (list.includes(preferredModel)) {
        tierCandidates = list;
        break;
      }
    }

    if (tierCandidates.length === 0) {
      tierCandidates = RECOMMENDED_TIERS.balanced;
    }

    const set = new Set<string>([preferredModel, ...tierCandidates, 'openrouter/free']);
    return Array.from(set);
  }

  /**
   * Parses an SSE ReadableStream response from OpenRouter.
   * Filters keepalive comments (: OPENROUTER PROCESSING), parses delta content and reasoning,
   * extracts embedded <think> blocks, and triggers real-time callbacks.
   */
  public async consumeStream(
    response: Response,
    callbacks?: StreamCallbacks
  ): Promise<{ content: string; reasoning: string }> {
    if (!response.body) {
      throw new Error('[OpenRouterClient] Response body is null.');
    }

    const reader = response.body.getReader();
    const decoder = new TextDecoder('utf-8');
    let buffer = '';
    let fullContent = '';
    let fullReasoning = '';
    let inThinkTag = false;

    try {
      while (true) {
        const { done, value } = await reader.read();
        if (done) break;

        buffer += decoder.decode(value, { stream: true });
        const lines = buffer.split('\n');
        buffer = lines.pop() || '';

        for (const rawLine of lines) {
          const line = rawLine.trim();
          if (!line) continue;

          // 1. Skip SSE comment / keepalive heartbeat lines
          if (line.startsWith(':')) {
            continue;
          }

          // 2. Process SSE data chunks
          if (line.startsWith('data:')) {
            const dataStr = line.slice(5).trim();
            if (dataStr === '[DONE]') {
              break;
            }

            try {
              const parsed = JSON.parse(dataStr);

              if (parsed.usage) {
                verifyZeroCost(parsed.usage);
              }

              const choice = parsed.choices?.[0];
              if (choice?.delta) {
                const delta = choice.delta;

                // Handle direct reasoning tokens
                if (delta.reasoning) {
                  fullReasoning += delta.reasoning;
                  callbacks?.onReasoning?.(delta.reasoning);
                } else if (delta.reasoning_details?.[0]?.text) {
                  const thought = delta.reasoning_details[0].text;
                  fullReasoning += thought;
                  callbacks?.onReasoning?.(thought);
                }

                // Handle content tokens & parse <think> tags if embedded
                if (delta.content) {
                  let tokenContent = delta.content as string;

                  // Check for <think> and </think> delimiters
                  if (tokenContent.includes('<think>')) {
                    inThinkTag = true;
                    const parts = tokenContent.split('<think>');
                    if (parts[0]) {
                      fullContent += parts[0];
                      callbacks?.onToken?.(parts[0]);
                    }
                    tokenContent = parts[1] || '';
                  }

                  if (inThinkTag) {
                    if (tokenContent.includes('</think>')) {
                      const parts = tokenContent.split('</think>');
                      if (parts[0]) {
                        fullReasoning += parts[0];
                        callbacks?.onReasoning?.(parts[0]);
                      }
                      inThinkTag = false;
                      if (parts[1]) {
                        fullContent += parts[1];
                        callbacks?.onToken?.(parts[1]);
                      }
                    } else {
                      fullReasoning += tokenContent;
                      callbacks?.onReasoning?.(tokenContent);
                    }
                  } else {
                    fullContent += tokenContent;
                    callbacks?.onToken?.(tokenContent);
                  }
                }
              }
            } catch (jsonErr) {
              console.warn('[OpenRouterClient] Failed to parse SSE JSON chunk:', dataStr, jsonErr);
            }
          }
        }
      }

      callbacks?.onComplete?.(fullContent, fullReasoning);
      return { content: fullContent, reasoning: fullReasoning };
    } catch (err: any) {
      callbacks?.onError?.(err);
      throw err;
    } finally {
      reader.releaseLock();
    }
  }

  /**
   * Executes a streaming chat completion with automatic 429 backoff and fallback cascading.
   */
  public async chatStream(
    messages: ChatMessage[],
    preferredModel?: string,
    callbacks?: StreamCallbacks
  ): Promise<string> {
    const targetModel = preferredModel || this.defaultModel;
    validateModelId(targetModel);
    const candidates = this.buildCascadeList(targetModel);

    const result = await executeWithCascade(
      candidates,
      async (modelId: string) => {
        validateModelId(modelId);
        const endpoint = validateEndpoint(`${this.baseUrl}/chat/completions`);

        const headers: Record<string, string> = {
          'Content-Type': 'application/json',
          'HTTP-Referer': 'https://autogit.vercel.app',
          'X-Title': 'AutoGIT Web Studio',
        };

        if (this.apiKey) {
          headers.Authorization = `Bearer ${this.apiKey}`;
        }

        const payload = {
          model: modelId,
          models: candidates,
          messages,
          stream: true,
          include_reasoning: true,
          route: 'fallback',
        };

        const res = await this.fetchImpl(endpoint, {
          method: 'POST',
          headers,
          body: JSON.stringify(payload),
        });

        if (!res.ok) {
          const errText = await res.text().catch(() => '');
          const error: any = new Error(`OpenRouter API error (status ${res.status}): ${errText}`);
          error.status = res.status;
          throw error;
        }

        const { content } = await this.consumeStream(res, callbacks);
        return content;
      },
      {
        healthCache: this.healthCache,
        onFallback: callbacks?.onFallback,
      }
    );

    return result;
  }

  /**
   * Executes a standard (non-streaming) chat completion with automatic 429 backoff and cascading.
   */
  public async chat(messages: ChatMessage[], preferredModel?: string): Promise<string> {
    const targetModel = preferredModel || this.defaultModel;
    validateModelId(targetModel);
    const candidates = this.buildCascadeList(targetModel);

    const result = await executeWithCascade(
      candidates,
      async (modelId: string) => {
        validateModelId(modelId);
        const endpoint = validateEndpoint(`${this.baseUrl}/chat/completions`);

        const headers: Record<string, string> = {
          'Content-Type': 'application/json',
          'HTTP-Referer': 'https://autogit.vercel.app',
          'X-Title': 'AutoGIT Web Studio',
        };

        if (this.apiKey) {
          headers.Authorization = `Bearer ${this.apiKey}`;
        }

        const payload = {
          model: modelId,
          models: candidates,
          messages,
          stream: false,
          include_reasoning: true,
          route: 'fallback',
        };

        const res = await this.fetchImpl(endpoint, {
          method: 'POST',
          headers,
          body: JSON.stringify(payload),
        });

        if (!res.ok) {
          const errText = await res.text().catch(() => '');
          const error: any = new Error(`OpenRouter API error (status ${res.status}): ${errText}`);
          error.status = res.status;
          throw error;
        }

        const json = await res.json();
        if (json.usage) {
          verifyZeroCost(json.usage);
        }

        const content = json.choices?.[0]?.message?.content || '';
        return content;
      },
      {
        healthCache: this.healthCache,
      }
    );

    return result;
  }
}
