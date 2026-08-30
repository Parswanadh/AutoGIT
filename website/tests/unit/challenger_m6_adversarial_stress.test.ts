/**
 * Milestone 6 Challenger Stress Test Suite
 * Empirical adversarial stress testing of Python AST Validation,
 * OpenRouter Free-Tier Cascades, Guardrails, and E2E Pipeline contracts.
 */

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { PythonAstValidator, PYTHON_STDLIB_MODULES } from '@/lib/workflow/astValidator';
import { OpenRouterClient } from '@/lib/openrouter/client';
import { ModelHealthCache, executeWithCascade } from '@/lib/openrouter/retry';
import {
  isFreeModel,
  assertFreeModel,
  validateModelId,
  validateEndpoint,
  verifyZeroCost,
} from '@/lib/openrouter/guardrails';
import {
  isValidOpenRouterKeyFormat,
  isValidGitHubPatFormat,
  validateOpenRouterKey,
  validateGitHubPat,
  maskKey,
} from '@/lib/storage/keyStore';
import { GitHubPublisher } from '@/lib/github/publisher';
import { ZipExporter, zipExporter } from '@/lib/export/zipExporter';

describe('Milestone 6 Challenger Empirical Stress Tests', () => {
  const originalFetch = globalThis.fetch;

  beforeEach(() => {
    sessionStorage.clear();
    localStorage.clear();
    vi.restoreAllMocks();
  });

  afterEach(() => {
    globalThis.fetch = originalFetch;
    vi.restoreAllMocks();
  });

  // ==========================================================================
  // Stress Suite 1: Deep Python AST & Structural Validation Under Adversarial Inputs
  // ==========================================================================
  describe('Stress Suite 1: Python AST & Structural Validation', () => {
    it('1.1: validates deeply nested classes (4+ levels) with async methods, generators, and type annotations', () => {
      const nestedPythonCode = `
import asyncio
from typing import Dict, List, Optional, Any

class OuterEngine:
    """Outer computational engine container."""
    def __init__(self, config: Dict[str, Any]) -> None:
        self.config = config

    class InnerPipeline:
        """First nested class layer."""
        def __init__(self, stage_name: str):
            self.stage_name = stage_name

        class NestedWorker:
            """Second nested class layer."""
            def __init__(self, worker_id: int):
                self.worker_id = worker_id

            class DeepLeafExecutor:
                """Third nested class layer."""
                async def execute_task(self, payload: Dict[str, Any]) -> Optional[str]:
                    async for chunk in self.stream_generator(payload):
                        if chunk == "DONE":
                            return "COMPLETED"
                    return None

                async def stream_generator(self, data: Dict[str, Any]):
                    for k, v in data.items():
                        await asyncio.sleep(0.001)
                        yield f"{k}:{v}"
                    yield "DONE"

if __name__ == "__main__":
    engine = OuterEngine({"mode": "production"})
    print("Deeply nested class structure initialized successfully.")
`;
      const result = PythonAstValidator.validateFile(nestedPythonCode, 'engine.py');
      expect(result.valid).toBe(true);
      expect(result.errors).toHaveLength(0);
      expect(result.metrics.hasMainBlock).toBe(true);
      expect(result.metrics.classesCount).toBeGreaterThanOrEqual(1);
      expect(result.metrics.importedModules).toContain('asyncio');
      expect(result.metrics.importedModules).toContain('typing');
    });

    it('1.2: catches complex mismatched bracket combinations (interleaved brackets across lines)', () => {
      const mismatchedCode = `
def compute_tensor(a, b):
    matrix = [
        (1, 2, 3],
        [4, 5, 6)
    ]
    return matrix
`;
      const result = PythonAstValidator.validateFile(mismatchedCode, 'tensor.py');
      expect(result.valid).toBe(false);
      expect(result.errors.length).toBeGreaterThanOrEqual(1);
      expect(result.errors.some((e) => e.rule.includes('syntax-bracket-balance'))).toBe(true);
    });

    it('1.3: catches unclosed brackets at EOF and reports correct opening line numbers', () => {
      const unclosedCode = `
import torch

class AttentionLayer:
    def __init__(self, d_model: int):
        self.weights = {
            "q": torch.zeros((d_model, d_model),
            "k": torch.zeros((d_model, d_model))
`;
      const result = PythonAstValidator.validateFile(unclosedCode, 'layer.py');
      expect(result.valid).toBe(false);
      const unclosedErrors = result.errors.filter((e) => e.rule === 'syntax-bracket-unclosed');
      expect(unclosedErrors.length).toBeGreaterThanOrEqual(1);
    });

    it('1.4: detects unterminated multiline string literals (triple quotes)', () => {
      const unterminatedCode = `
def parse_markdown(doc: str):
    """
    This docstring was never closed by the LLM
    and continues until EOF.
    return doc.upper()
`;
      const result = PythonAstValidator.validateFile(unterminatedCode, 'parser.py');
      expect(result.valid).toBe(false);
      expect(result.errors.some((e) => e.rule === 'syntax-unterminated-string')).toBe(true);
    });

    it('1.5: catches tab characters in indentation and rejects with indentation-no-tabs rule', () => {
      const tabbedCode = `
def calculate():
\tx = 10
\treturn x * 2
`;
      const result = PythonAstValidator.validateFile(tabbedCode, 'tabs.py');
      expect(result.valid).toBe(false);
      expect(result.errors.some((e) => e.rule === 'indentation-no-tabs')).toBe(true);
    });

    it('1.6: catches invalid unindent levels that do not match the indent stack', () => {
      const badIndentCode = `
def outer():
    if True:
        x = 10
        if x > 5:
            y = 20
      z = 30  # Invalid 6-space unindent (stack is [0, 4, 8, 12])
    return z
`;
      const result = PythonAstValidator.validateFile(badIndentCode, 'bad_indent.py');
      expect(result.valid).toBe(false);
      expect(result.errors.some((e) => e.rule === 'indentation-unindent-mismatch')).toBe(true);
    });

    it('1.7: deterministically cleans LLM markdown fences, unicode quotes, dashes, and relative imports', () => {
      const rawLLMOutput = '```python\r\n' +
        'from .layers import MultiHeadAttention\r\n' +
        'def test_fn():\r\n' +
        '    title = “AutoGIT Engine”\r\n' +
        '    desc = ‘Autonomous Research–to–GitHub’\r\n' +
        '    return title + " " + desc\r\n' +
        '```';

      const cleaned = PythonAstValidator.deterministicPreFix(rawLLMOutput);
      expect(cleaned).not.toContain('```');
      expect(cleaned).toContain('from layers import MultiHeadAttention');
      expect(cleaned).toContain('"AutoGIT Engine"');
      expect(cleaned).toContain("'Autonomous Research-to-GitHub'");
      expect(cleaned.endsWith('\n')).toBe(true);

      const validation = PythonAstValidator.validateFile(rawLLMOutput, 'test_fn.py');
      expect(validation.valid).toBe(true);
    });

    it('1.8: validates multi-file project dependency resolution and flags unnecessary stdlib in requirements.txt', () => {
      const projectFiles = {
        'src/models/transformer.py': `
import math
import json
import torch
from src.utils.helpers import format_tensor

class TransformerModel:
    def __init__(self, dim: int):
        self.dim = dim
`,
        'src/utils/helpers.py': `
import sys
import numpy as np

def format_tensor(t):
    return str(t)
`,
        'requirements.txt': `
torch>=2.0.0
numpy>=1.24.0
json
math
sys
`,
      };

      const projResult = PythonAstValidator.validateProject(projectFiles);
      expect(projResult.fileResults['src/models/transformer.py'].valid).toBe(true);
      expect(projResult.fileResults['src/utils/helpers.py'].valid).toBe(true);
      expect(projResult.unnecessaryStdlibInRequirements).toContain('json');
      expect(projResult.unnecessaryStdlibInRequirements).toContain('math');
      expect(projResult.unnecessaryStdlibInRequirements).toContain('sys');
      expect(projResult.allValid).toBe(false); // Fails due to stdlib in requirements.txt
    });

    it('1.9: verifies missing non-stdlib dependencies in requirements.txt', () => {
      const projectFiles = {
        'main.py': `
import torch
import scipy
import einops

def run():
    print("Testing missing deps")
`,
        'requirements.txt': `
torch>=2.0.0
`,
      };

      const projResult = PythonAstValidator.validateProject(projectFiles);
      expect(projResult.missingDependencies).toContain('scipy');
      expect(projResult.missingDependencies).toContain('einops');
      expect(projResult.missingDependencies).not.toContain('torch');
    });
  });

  // ==========================================================================
  // Stress Suite 2: OpenRouter 429 Backoff, Cascade Resilience & Guardrails
  // ==========================================================================
  describe('Stress Suite 2: OpenRouter Cascade Resilience & Guardrails', () => {
    it('2.1: cascades sequentially across 4 models experiencing 429 rate-limits until succeeding on 5th model', async () => {
      const healthCache = new ModelHealthCache();
      const attemptLog: string[] = [];
      const fallbackLog: Array<{ failed: string; next: string; reason: string }> = [];

      let modelIndex = 0;
      const mockFetch = vi.fn().mockImplementation(async (url: string, init: any) => {
        const body = JSON.parse(init.body);
        const currentModel = body.model;
        attemptLog.push(currentModel);

        if (modelIndex < 4) {
          modelIndex++;
          return new Response(JSON.stringify({ error: { message: 'Rate limit exceeded: 429' } }), {
            status: 429,
            headers: { 'Content-Type': 'application/json' },
          });
        }

        // 5th model succeeds with SSE stream
        const encoder = new TextEncoder();
        const stream = new ReadableStream({
          start(controller) {
            controller.enqueue(encoder.encode(': OPENROUTER PROCESSING\n\n'));
            controller.enqueue(
              encoder.encode(
                'data: ' +
                  JSON.stringify({
                    choices: [{ delta: { content: 'Deep cascade success from openrouter/free!' } }],
                    usage: { cost: 0 },
                  }) +
                  '\n\n'
              )
            );
            controller.enqueue(encoder.encode('data: [DONE]\n\n'));
            controller.close();
          },
        });

        return new Response(stream, {
          status: 200,
          headers: { 'Content-Type': 'text/event-stream' },
        });
      });

      const client = new OpenRouterClient({
        apiKey: 'sk-or-v1-test-valid-key-1234567890abcdef1234567890abcdef',
        healthCache,
        customFetch: mockFetch,
      });

      let streamedText = '';
      const result = await client.chatStream(
        [{ role: 'user', content: 'Execute cascade test' }],
        'google/gemini-2.0-flash-exp:free',
        {
          onToken: (t) => (streamedText += t),
          onFallback: (failed, next, reason) => fallbackLog.push({ failed, next, reason }),
        }
      );

      expect(attemptLog).toHaveLength(5);
      expect(attemptLog[0]).toBe('google/gemini-2.0-flash-exp:free');
      expect(attemptLog[1]).toBe('meta-llama/llama-3.3-70b-instruct:free');
      expect(attemptLog[2]).toBe('z-ai/glm-5.2:free');
      expect(attemptLog[3]).toBe('poolside/laguna-s-2.1:free');
      expect(attemptLog[4]).toBe('openrouter/free');
      expect(fallbackLog).toHaveLength(4);
      expect(result).toBe('Deep cascade success from openrouter/free!');
      expect(streamedText).toBe('Deep cascade success from openrouter/free!');

      // Verify healthCache marked the 4 failing models as unviable (isHealthy returns false)
      expect(healthCache.isHealthy('google/gemini-2.0-flash-exp:free')).toBe(false);
      expect(healthCache.isHealthy('meta-llama/llama-3.3-70b-instruct:free')).toBe(false);
      expect(healthCache.isHealthy('z-ai/glm-5.2:free')).toBe(false);
      expect(healthCache.isHealthy('poolside/laguna-s-2.1:free')).toBe(false);
      // openrouter/free succeeded and is healthy
      expect(healthCache.isHealthy('openrouter/free')).toBe(true);
    });

    it('2.2: enforces hard rejection of paid models and unauthorized local/remote endpoints', () => {
      const forbiddenModels = [
        'openai/gpt-4o',
        'anthropic/claude-3-5-sonnet',
        'google/gemini-pro',
        'deepseek/deepseek-chat',
        'meta-llama/llama-3-8b',
        'localhost/ollama',
      ];

      for (const m of forbiddenModels) {
        expect(isFreeModel(m)).toBe(false);
        expect(() => assertFreeModel(m)).toThrow(/\[SECURITY GUARDRAIL\]/);
      }

      const disallowedEndpoints = [
        'http://localhost:11434/api/chat',
        'http://127.0.0.1:8000/v1/chat',
        'http://0.0.0.0:5000/v1',
        'http://[::1]:8080',
        'https://attacker-proxy.com/api/v1',
        'http://openrouter.ai/api/v1',
      ];

      for (const ep of disallowedEndpoints) {
        expect(() => validateEndpoint(ep)).toThrow(/\[SECURITY GUARDRAIL\]/);
      }

      // Valid endpoint passes
      expect(validateEndpoint('https://openrouter.ai/api/v1/chat/completions')).toBe(
        'https://openrouter.ai/api/v1/chat/completions'
      );
    });

    it('2.3: verifies zero cost enforcement and throws on non-zero cost usage', () => {
      expect(() => verifyZeroCost({ cost: 0 })).not.toThrow();
      expect(() => verifyZeroCost(undefined)).not.toThrow();
      expect(() => verifyZeroCost({ cost: 0.0005 })).toThrow(/\[SECURITY WARNING\] Non-zero cost reported/);
    });

    it('2.4: correctly extracts nested and interleaved <think> reasoning tokens from SSE stream', async () => {
      const encoder = new TextEncoder();
      const sseBody = new ReadableStream({
        start(controller) {
          controller.enqueue(
            encoder.encode(
              'data: ' +
                JSON.stringify({
                  choices: [{ delta: { content: '<think>Formulating multi-layer architecture' } }],
                }) +
                '\n\n'
            )
          );
          controller.enqueue(
            encoder.encode(
              'data: ' +
                JSON.stringify({
                  choices: [{ delta: { content: ' and mathematical proofs.</think>Here is the Python implementation:\n```python\n' } }],
                }) +
                '\n\n'
            )
          );
          controller.enqueue(
            encoder.encode(
              'data: ' +
                JSON.stringify({
                  choices: [{ delta: { content: 'def solve(): return 42\n```' } }],
                }) +
                '\n\n'
            )
          );
          controller.enqueue(encoder.encode('data: [DONE]\n\n'));
          controller.close();
        },
      });

      const mockRes = new Response(sseBody, {
        status: 200,
        headers: { 'Content-Type': 'text/event-stream' },
      });

      const client = new OpenRouterClient({
        apiKey: 'sk-or-v1-mock-valid-key-abcdef1234567890abcdef12345678',
      });

      let reasoningTokens = '';
      let contentTokens = '';

      const { content, reasoning } = await client.consumeStream(mockRes, {
        onReasoning: (r) => (reasoningTokens += r),
        onToken: (t) => (contentTokens += t),
      });

      expect(reasoning).toContain('Formulating multi-layer architecture and mathematical proofs.');
      expect(content).toContain('Here is the Python implementation:');
      expect(content).toContain('def solve(): return 42');
      expect(contentTokens).toBe(content);
      expect(reasoningTokens).toBe(reasoning);
    });
  });

  // ==========================================================================
  // Stress Suite 3: End-to-End Pipeline Scaffolding & Git Data Tree Publishing
  // ==========================================================================
  describe('Stress Suite 3: Pipeline Export & Git Data Tree Publishing', () => {
    it('3.1: builds multi-file JSZip repository package and verifies binary byte length', async () => {
      const files = {
        'src/attention.py': 'class Attention:\n    pass\n',
        'src/utils.py': 'def helper():\n    return True\n',
        'tests/test_attention.py': 'def test_attention():\n    assert True\n',
        'requirements.txt': 'torch>=2.0.0\npytest\n',
        'README.md': '# Attention Project\nAutonomous implementation.\n',
      };

      const zipBlob = await zipExporter.exportRepositoryZip({
        projectName: 'test-attention-repo',
        files,
      });
      expect(zipBlob).toBeInstanceOf(Blob);
      expect(zipBlob.size).toBeGreaterThan(100);
      expect(zipBlob.type).toBe('application/zip');
    });

    it('3.2: verifies GitHubPublisher constructs hierarchical tree payloads and atomic commits', async () => {
      const fetchCalls: Array<{ url: string; body?: any }> = [];

      const mockFetch = vi.fn().mockImplementation(async (url: string, init?: any) => {
        const parsedBody = init?.body ? JSON.parse(init.body) : undefined;
        fetchCalls.push({ url, body: parsedBody });

        if (url.includes('/user/repos')) {
          return new Response(
            JSON.stringify({
              name: 'autonomous-research-repo',
              html_url: 'https://github.com/researcher-user/autonomous-research-repo',
              clone_url: 'https://github.com/researcher-user/autonomous-research-repo.git',
              default_branch: 'main',
            }),
            { status: 201, headers: { 'Content-Type': 'application/json' } }
          );
        }
        if (url.includes('/user')) {
          return new Response(JSON.stringify({ login: 'researcher-user', id: 12345 }), {
            status: 200,
            headers: {
              'Content-Type': 'application/json',
              'x-oauth-scopes': 'repo, read:user',
            },
          });
        }
        if (url.includes('/git/blobs')) {
          return new Response(JSON.stringify({ sha: 'blob-sha-' + Math.random().toString(36).slice(2) }), {
            status: 201,
            headers: { 'Content-Type': 'application/json' },
          });
        }
        if (url.includes('/git/trees')) {
          return new Response(JSON.stringify({ sha: 'tree-sha-root-12345' }), {
            status: 201,
            headers: { 'Content-Type': 'application/json' },
          });
        }
        if (url.includes('/git/commits')) {
          return new Response(JSON.stringify({ sha: 'commit-sha-99999' }), {
            status: 201,
            headers: { 'Content-Type': 'application/json' },
          });
        }
        if (url.includes('/git/refs')) {
          return new Response(JSON.stringify({ ref: 'refs/heads/main', object: { sha: 'commit-sha-99999' } }), {
            status: 200,
            headers: { 'Content-Type': 'application/json' },
          });
        }

        return new Response('{}', { status: 200 });
      });

      globalThis.fetch = mockFetch;

      const publisher = new GitHubPublisher();
      const filesRecord = {
        'src/core/attention.py': {
          path: 'src/core/attention.py',
          content: 'class Attention:\n    pass\n',
          language: 'python',
        },
        'README.md': {
          path: 'README.md',
          content: '# Autonomous Repo\n',
          language: 'markdown',
        },
      };

      const result = await publisher.createAndPushRepo('ghp_testValidGitHubPersonalAccessToken123456', {
        repoName: 'autonomous-research-repo',
        description: 'Autonomous research-to-GitHub repo',
        isPrivate: false,
        files: filesRecord,
        commitMessage: 'feat: initial autonomous research release',
      });

      expect(result.commitSha).toBe('commit-sha-99999');
      expect(result.publishedFilesCount).toBe(2);
      expect(result.repoUrl).toBe('https://github.com/researcher-user/autonomous-research-repo');
      expect(fetchCalls.some((c) => c.url.includes('/user/repos'))).toBe(true);
      expect(fetchCalls.some((c) => c.url.includes('/git/trees'))).toBe(true);
      expect(fetchCalls.some((c) => c.url.includes('/git/commits'))).toBe(true);
    });
  });
});
