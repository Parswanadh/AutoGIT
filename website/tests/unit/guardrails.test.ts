import { describe, it, expect } from 'vitest';
import {
  OPENROUTER_BASE_URL,
  validateModelId,
  isFreeModel,
  assertFreeModel,
  validateEndpoint,
  verifyZeroCost,
} from '../../lib/openrouter/guardrails';

describe('OpenRouter Security Guardrails', () => {
  describe('Constants', () => {
    it('defines OPENROUTER_BASE_URL strictly as https://openrouter.ai/api/v1', () => {
      expect(OPENROUTER_BASE_URL).toBe('https://openrouter.ai/api/v1');
    });
  });

  describe('Model ID Validation (Paid Model Ban)', () => {
    const validFreeModels = [
      'google/gemini-2.0-flash-exp:free',
      'meta-llama/llama-3.3-70b-instruct:free',
      'qwen/qwen-2.5-coder-32b-instruct:free',
      'deepseek/deepseek-r1:free',
      'nvidia/nemotron-3-super-120b-a12b:free',
      'minimax/minimax-m2.7:free',
      'cohere/north-mini-code:free',
      'openrouter/free',
      'z-ai/glm-5.2:free',
      'poolside/laguna-s-2.1:free',
      'thinkingmachines/inkling:free',
    ];

    const forbiddenPaidModels = [
      'openai/gpt-4o',
      'openai/gpt-4-turbo',
      'anthropic/claude-3.5-sonnet',
      'anthropic/claude-3-opus',
      'meta-llama/llama-3.3-70b-instruct',
      'deepseek/deepseek-r1',
      'google/gemini-pro',
      'mistralai/mistral-large',
      'cohere/command-r-plus',
      '',
      '   ',
    ];

    it.each(validFreeModels)('accepts free-tier model: %s', (modelId) => {
      expect(isFreeModel(modelId)).toBe(true);
      expect(() => validateModelId(modelId)).not.toThrow();
      expect(() => assertFreeModel(modelId)).not.toThrow();
      expect(validateModelId(modelId)).toBe(modelId);
    });

    it.each(forbiddenPaidModels)('strictly blocks paid / invalid model: "%s"', (modelId) => {
      expect(isFreeModel(modelId)).toBe(false);
      expect(() => validateModelId(modelId)).toThrow(/SECURITY GUARDRAIL/i);
      expect(() => assertFreeModel(modelId)).toThrow(/SECURITY GUARDRAIL/i);
    });

    it('throws informative error message containing forbidden model ID', () => {
      expect(() => validateModelId('openai/gpt-4o')).toThrowError(
        '[SECURITY GUARDRAIL] Model "openai/gpt-4o" is forbidden. AutoGIT strictly permits ONLY ":free" tier models.'
      );
    });
  });

  describe('Endpoint Validation (Local LLM & Ollama Ban)', () => {
    const validEndpoints = [
      'https://openrouter.ai/api/v1',
      'https://openrouter.ai/api/v1/chat/completions',
      'https://openrouter.ai/api/v1/models',
      'https://openrouter.ai/api/v1/auth/key',
    ];

    const forbiddenEndpoints = [
      'http://localhost:11434/api/generate',
      'https://localhost:11434',
      'http://localhost:8000/v1',
      'http://localhost:5000/v1',
      'http://127.0.0.1:11434',
      'http://127.0.0.1:8080/v1',
      'http://0.0.0.0:11434',
      'http://[::1]:11434',
      'http://openrouter.ai/api/v1', // Insecure HTTP
      'https://openrouter.ai.attacker.com/api/v1', // Domain spoofing
      'https://attacker-openrouter.ai/api/v1', // Domain prefix spoofing
      'https://openrouter.ai/api/v2', // Invalid API version
      'https://api.openai.com/v1',
      'https://api.anthropic.com/v1',
      'https://custom-ollama-proxy.com/api',
      'not-a-valid-url',
    ];

    it.each(validEndpoints)('accepts authorized OpenRouter endpoint: %s', (endpoint) => {
      expect(() => validateEndpoint(endpoint)).not.toThrow();
      expect(validateEndpoint(endpoint)).toBe(endpoint);
    });

    it.each(forbiddenEndpoints)('hard-blocks forbidden / local / non-HTTPS endpoint: %s', (endpoint) => {
      expect(() => validateEndpoint(endpoint)).toThrow(/SECURITY GUARDRAIL/i);
    });

    it('rejects localhost with explicit message', () => {
      expect(() => validateEndpoint('http://localhost:11434')).toThrowError(
        /Localhost and local LLMs\/Ollama are strictly prohibited/i
      );
    });

    it('rejects 127.0.0.1 with explicit message', () => {
      expect(() => validateEndpoint('http://127.0.0.1:11434')).toThrowError(
        /Localhost and local LLMs\/Ollama are strictly prohibited/i
      );
    });

    it('rejects non-OpenRouter domains with explicit message', () => {
      expect(() => validateEndpoint('https://api.openai.com/v1')).toThrowError(
        /Only official OpenRouter HTTPS endpoints are authorized/i
      );
    });
  });

  describe('Zero Cost Verification', () => {
    it('allows zero cost usage', () => {
      expect(() => verifyZeroCost({ cost: 0 })).not.toThrow();
      expect(() => verifyZeroCost(undefined)).not.toThrow();
      expect(() => verifyZeroCost({})).not.toThrow();
    });

    it('throws error when non-zero cost is detected', () => {
      expect(() => verifyZeroCost({ cost: 0.005 })).toThrowError(/Non-zero cost reported/i);
    });
  });
});
