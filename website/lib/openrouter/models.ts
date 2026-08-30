import { OPENROUTER_BASE_URL, isFreeModel, validateEndpoint } from './guardrails';

export interface ModelPricing {
  prompt: string;
  completion: string;
  request?: string;
  image?: string;
}

export interface ModelTopProvider {
  contextLength?: number;
  maxCompletionTokens?: number;
  isModerated?: boolean;
}

export interface ModelInfo {
  id: string;
  name: string;
  contextLength: number;
  isFree: boolean;
  description?: string;
  pricing?: ModelPricing;
  topProvider?: ModelTopProvider;
  supportedParameters?: string[];
  reasoning?: {
    mandatory?: boolean;
    defaultEnabled?: boolean;
  };
  recommendedProfile?: 'reasoning' | 'powerful' | 'balanced' | 'fast';
}

/**
 * Curated list of verified free-tier models on OpenRouter
 */
export const FREE_MODELS: ModelInfo[] = [
  {
    id: 'openrouter/free',
    name: 'OpenRouter Free Models Meta-Router',
    contextLength: 200000,
    isFree: true,
    description: 'Auto-load balancing universal free router across all active free models.',
    recommendedProfile: 'balanced',
  },
  {
    id: 'nvidia/nemotron-3-super-120b-a12b:free',
    name: 'NVIDIA: Nemotron 3 Super 120B (free)',
    contextLength: 262144,
    isFree: true,
    description: 'High-capability 120B MoE model optimized for advanced reasoning, architecture, and GPQA.',
    recommendedProfile: 'reasoning',
  },
  {
    id: 'nvidia/nemotron-3-ultra-550b-a55b:free',
    name: 'NVIDIA: Nemotron 3 Ultra 550B (free)',
    contextLength: 1000000,
    isFree: true,
    description: 'Ultra-scale 550B MoE model for complex reasoning and cross-critique consensus.',
    recommendedProfile: 'reasoning',
  },
  {
    id: 'nvidia/nemotron-3.5-lightning:free',
    name: 'NVIDIA: Nemotron 3.5 Lightning (free)',
    contextLength: 1000000,
    isFree: true,
    description: 'Ultra-fast 1M context model with high throughput and strong reasoning.',
    recommendedProfile: 'reasoning',
  },
  {
    id: 'minimax/minimax-m2.7:free',
    name: 'MiniMax: MiniMax M2.7 (free)',
    contextLength: 196608,
    isFree: true,
    description: 'Specialized for high-speed multi-file code generation and structured outputs.',
    recommendedProfile: 'powerful',
  },
  {
    id: 'minimax/minimax-m3:free',
    name: 'MiniMax: MiniMax M3 (free)',
    contextLength: 1048576,
    isFree: true,
    description: '1M context model for full repository scaffolding and deep codebase architecture.',
    recommendedProfile: 'powerful',
  },
  {
    id: 'cohere/north-mini-code:free',
    name: 'Cohere: North Mini Code (free)',
    contextLength: 256000,
    isFree: true,
    description: 'Specialist model for code review, 12-bug category analysis, and unit testing.',
    recommendedProfile: 'powerful',
  },
  {
    id: 'google/gemini-2.0-flash-exp:free',
    name: 'Google: Gemini 2.0 Flash Experimental (free)',
    contextLength: 1048576,
    isFree: true,
    description: 'Fast, highly versatile multimodal and text model with 1M context.',
    recommendedProfile: 'balanced',
  },
  {
    id: 'meta-llama/llama-3.3-70b-instruct:free',
    name: 'Meta: Llama 3.3 70B Instruct (free)',
    contextLength: 131072,
    isFree: true,
    description: 'Industry standard open weights 70B instruct model.',
    recommendedProfile: 'balanced',
  },
  {
    id: 'qwen/qwen-2.5-coder-32b-instruct:free',
    name: 'Qwen: Qwen 2.5 Coder 32B Instruct (free)',
    contextLength: 32768,
    isFree: true,
    description: 'Leading code-specialized model with high code-generation accuracy.',
    recommendedProfile: 'powerful',
  },
  {
    id: 'deepseek/deepseek-r1:free',
    name: 'DeepSeek: DeepSeek R1 (free)',
    contextLength: 64000,
    isFree: true,
    description: 'Leading open reasoning model with explicit chain of thought.',
    recommendedProfile: 'reasoning',
  },
  {
    id: 'z-ai/glm-5.2:free',
    name: 'Z.ai: GLM 5.2 (free)',
    contextLength: 256000,
    isFree: true,
    description: 'General intelligence and multi-agent debate specialist.',
    recommendedProfile: 'balanced',
  },
  {
    id: 'poolside/laguna-s-2.1:free',
    name: 'Poolside: Laguna S 2.1 (free)',
    contextLength: 262144,
    isFree: true,
    description: 'High-performance coding model with strong synthesis capabilities.',
    recommendedProfile: 'balanced',
  },
  {
    id: 'thinkingmachines/inkling:free',
    name: 'Thinking Machines: Inkling (free)',
    contextLength: 1048576,
    isFree: true,
    description: 'Long-context research paper and specification comprehension model.',
    recommendedProfile: 'reasoning',
  },
  {
    id: 'inclusionai/ling-3.0-flash-fin:free',
    name: 'InclusionAI: Ling 3.0 Flash Fin (free)',
    contextLength: 262144,
    isFree: true,
    description: 'Ultra-fast parsing and idea extraction model.',
    recommendedProfile: 'fast',
  },
  {
    id: 'liquid/lfm-2.5-2.6b:free',
    name: 'LiquidAI: LFM 2.5 2.6B (free)',
    contextLength: 65536,
    isFree: true,
    description: 'Lightweight, ultra-low latency model for quick transformations.',
    recommendedProfile: 'fast',
  },
];

export const RECOMMENDED_TIERS: Record<'reasoning' | 'powerful' | 'balanced' | 'fast', string[]> = {
  reasoning: [
    'nvidia/nemotron-3-super-120b-a12b:free',
    'deepseek/deepseek-r1:free',
    'nvidia/nemotron-3-ultra-550b-a55b:free',
    'nvidia/nemotron-3.5-lightning:free',
    'thinkingmachines/inkling:free',
    'openrouter/free',
  ],
  powerful: [
    'minimax/minimax-m2.7:free',
    'cohere/north-mini-code:free',
    'qwen/qwen-2.5-coder-32b-instruct:free',
    'minimax/minimax-m3:free',
    'poolside/laguna-s-2.1:free',
    'openrouter/free',
  ],
  balanced: [
    'google/gemini-2.0-flash-exp:free',
    'meta-llama/llama-3.3-70b-instruct:free',
    'z-ai/glm-5.2:free',
    'poolside/laguna-s-2.1:free',
    'openrouter/free',
  ],
  fast: [
    'inclusionai/ling-3.0-flash-fin:free',
    'liquid/lfm-2.5-2.6b:free',
    'poolside/laguna-xs-2.1:free',
    'openrouter/free',
  ],
};

/**
 * Returns an ordered fallback list of model IDs for a given workflow tier profile.
 */
export function getModelsForProfile(profile: 'reasoning' | 'powerful' | 'balanced' | 'fast'): string[] {
  return RECOMMENDED_TIERS[profile] || RECOMMENDED_TIERS.balanced;
}

/**
 * Returns the default primary free-tier model.
 */
export function getDefaultModel(): string {
  return 'nvidia/nemotron-3-super-120b-a12b:free';
}

/**
 * Queries OpenRouter /api/v1/models endpoint to discover live free models at runtime.
 * Filters strictly to ensure zero paid models are returned.
 */
export async function fetchFreeModels(options?: {
  apiKey?: string;
  fetchFn?: typeof fetch;
}): Promise<ModelInfo[]> {
  const fetchImpl = options?.fetchFn || (typeof window !== 'undefined' ? window.fetch.bind(window) : fetch);
  const endpoint = validateEndpoint(`${OPENROUTER_BASE_URL}/models`);

  try {
    const headers: Record<string, string> = {
      'Content-Type': 'application/json',
      'HTTP-Referer': 'https://autogit.vercel.app',
      'X-Title': 'AutoGIT Web Studio',
    };

    if (options?.apiKey) {
      headers.Authorization = `Bearer ${options.apiKey}`;
    }

    const res = await fetchImpl(endpoint, {
      method: 'GET',
      headers,
    });

    if (!res.ok) {
      console.warn(`[Models] Failed to fetch models from OpenRouter (status ${res.status}). Using curated fallback list.`);
      return FREE_MODELS;
    }

    const json = (await res.json()) as { data?: any[] };
    if (!json || !Array.isArray(json.data)) {
      return FREE_MODELS;
    }

    const freeModels: ModelInfo[] = [];

    for (const item of json.data) {
      if (!item || typeof item.id !== 'string') continue;

      const isPromptFree = item.pricing?.prompt === '0' || item.pricing?.prompt === 0;
      const isCompletionFree = item.pricing?.completion === '0' || item.pricing?.completion === 0;
      const isFreeTier = isFreeModel(item.id) || (isPromptFree && isCompletionFree);

      if (isFreeTier) {
        freeModels.push({
          id: item.id,
          name: item.name || item.id,
          contextLength: Number(item.context_length || item.top_provider?.context_length || 32768),
          isFree: true,
          description: item.description,
          pricing: item.pricing
            ? {
                prompt: String(item.pricing.prompt ?? '0'),
                completion: String(item.pricing.completion ?? '0'),
                request: item.pricing.request !== undefined ? String(item.pricing.request) : undefined,
                image: item.pricing.image !== undefined ? String(item.pricing.image) : undefined,
              }
            : undefined,
          topProvider: item.top_provider
            ? {
                contextLength: item.top_provider.context_length,
                maxCompletionTokens: item.top_provider.max_completion_tokens,
                isModerated: item.top_provider.is_moderated,
              }
            : undefined,
          supportedParameters: Array.isArray(item.supported_parameters) ? item.supported_parameters : undefined,
          reasoning: item.reasoning,
        });
      }
    }

    // Ensure openrouter/free meta-router exists in list
    if (!freeModels.some((m) => m.id === 'openrouter/free')) {
      freeModels.unshift(FREE_MODELS[0]);
    }

    return freeModels.length > 0 ? freeModels : FREE_MODELS;
  } catch (err) {
    console.warn('[Models] Network error fetching models catalog. Using curated list.', err);
    return FREE_MODELS;
  }
}
