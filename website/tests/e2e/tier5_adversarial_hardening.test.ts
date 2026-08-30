/**
 * Tier 5: Adversarial Coverage Hardening E2E Test Suite
 * White-box adversarial testing, edge-case stress testing, and boundary hardening.
 * 
 * Features Tested:
 * - Multi-turn debate with conflicting persona stances and dynamic consensus convergence.
 * - AST validation of obfuscated / nested Python code with deterministic AST repairing.
 * - Rapid retry cascades across 5 fallback free models when 429 errors trigger backoff.
 * - Multi-file Git Data API tree creation with nested directory paths and atomic ref update.
 * - End-to-end user journey: arXiv input -> 19-stage debate & repair -> Monaco code editing -> JSZip download -> GitHub publish.
 */

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import {
  ClientKeyStore,
  ModelGuardrails,
  OpenRouterFreeRouter,
  SSEStreamParser,
  ArxivParser,
  MultiAgentDebateEngine,
  SimpleDiffEngine,
  ClientZipBuilder,
  GitHubPublisherSimulator,
  DEBATE_PERSONAS,
  FREE_MODELS,
  PAID_MODELS,
  WorkflowState,
  WorkflowFile,
} from '../helpers/testUtils';

import { PythonAstValidator } from '@/lib/workflow/astValidator';
import { GitHubPublisher } from '@/lib/github/publisher';
import { ZipExporter } from '@/lib/export/zipExporter';
import {
  isValidOpenRouterKeyFormat,
  isValidGitHubPatFormat,
  validateOpenRouterKey,
  validateGitHubPat,
  maskKey,
} from '@/lib/storage/keyStore';
import {
  isFreeModel,
  assertFreeModel,
  validateModelId,
  validateEndpoint,
  verifyZeroCost,
} from '@/lib/openrouter/guardrails';

describe('Tier 5: Adversarial Coverage Hardening', () => {
  let keyStore: ClientKeyStore;
  const originalFetch = globalThis.fetch;

  beforeEach(() => {
    sessionStorage.clear();
    localStorage.clear();
    keyStore = new ClientKeyStore();
    vi.restoreAllMocks();
  });

  afterEach(() => {
    globalThis.fetch = originalFetch;
    vi.restoreAllMocks();
  });

  // ==========================================================================
  // Suite 1: Adversarial Multi-Turn Debate & Dynamic Consensus Convergence
  // ==========================================================================
  describe('Suite 1: Adversarial Multi-Turn Debate & Consensus Convergence', () => {
    it('1.1: resolves polarized debate where personas hold opposing stances and converge over multiple rounds', () => {
      const debate = new MultiAgentDebateEngine(3, 0.80);

      // Round 1: Extreme disagreement / conflicting architectural proposals
      debate.addTurn({
        agent: 'Lead Researcher',
        role: 'Theoretical foundation',
        round: 1,
        message: 'We must strictly implement full $O(N^2)$ cross-attention with exact paper fidelity.',
      });
      debate.addTurn({
        agent: 'Systems Engineer',
        role: 'Performance & memory',
        round: 1,
        message: 'Strongly disagree. $O(N^2)$ memory explodes on GPU. We must use FlashAttention or Sliding Window with fixed buffer.',
      });
      debate.addTurn({
        agent: 'Code Reviewer & QA',
        role: 'Testing & safety',
        round: 1,
        message: 'Rejecting both until tensor shapes and boundary tests are mathematically specified.',
      });

      // After Round 1: consensus should NOT be reached
      const scoreR1 = debate.calculateConsensusScore();
      expect(scoreR1).toBeLessThan(0.70);
      expect(debate.isConsensusReached()).toBe(false);

      // Round 2: Compromise and partial consensus formation
      debate.addTurn({
        agent: 'Lead Researcher',
        role: 'Theoretical foundation',
        round: 2,
        message: 'Sliding window attention is acceptable if receptive field meets paper theorems. I agree with compromise.',
      });
      debate.addTurn({
        agent: 'System Architect',
        role: 'Modular design',
        round: 2,
        message: 'Proposing modular SlidingWindowAttention module with fallback causal mask. Solid and clean architecture.',
      });
      debate.addTurn({
        agent: 'Systems Engineer',
        role: 'Performance & memory',
        round: 2,
        message: 'Agreed. Chunked block-sparse memory buffers will keep VRAM under 8GB. Approved.',
      });

      // Round 3: Unanimous consensus
      DEBATE_PERSONAS.forEach((persona) => {
        debate.addTurn({
          agent: persona.name,
          role: persona.focus,
          round: 3,
          message: `Round 3 consensus: Optimal design approved. Fully aligned with paper specifications and performance criteria.`,
        });
      });

      expect(debate.getTurns().length).toBe(12);
      expect(debate.calculateConsensusScore()).toBeGreaterThanOrEqual(0.80);
      expect(debate.isConsensusReached()).toBe(true);

      const synthesis = debate.generateSynthesis();
      expect(synthesis).toContain('Multi-Agent Debate Synthesis');
      expect(synthesis).toContain('Round 3');
      expect(synthesis).toContain('Lead Researcher');
      expect(synthesis).toContain('Code Reviewer & QA');
    });

    it('1.2: handles stagnant debate rounds and gracefully forces majority synthesis at max rounds', () => {
      const debate = new MultiAgentDebateEngine(2, 0.95); // Unusually high threshold

      // Round 1: Neutral remarks without consensus keywords
      debate.addTurn({
        agent: 'ML Theorist',
        role: 'Model architecture',
        round: 1,
        message: 'Investigating latent space representations.',
      });
      debate.addTurn({
        agent: 'Applied Scientist',
        role: 'Evaluation',
        round: 1,
        message: 'Running benchmark tests against synthetic baseline datasets.',
      });

      // Round 2: Reaching max rounds forces consensus completion
      debate.addTurn({
        agent: 'ML Theorist',
        role: 'Model architecture',
        round: 2,
        message: 'Continuing experiments with custom loss functions.',
      });
      debate.addTurn({
        agent: 'Applied Scientist',
        role: 'Evaluation',
        round: 2,
        message: 'Empirical metrics gathered on batch size variations.',
      });

      expect(debate.isConsensusReached()).toBe(true); // Should reach true because maxRounds (2) reached
      const synthesis = debate.generateSynthesis();
      expect(synthesis).toContain('Multi-Agent Debate Synthesis');
      expect(synthesis).toContain('Round 2');
    });

    it('1.3: parses real-time SSE stream chunks with interleaved reasoning and token emissions', () => {
      const parser = new SSEStreamParser();
      const emittedTokens: string[] = [];
      const emittedThoughts: string[] = [];
      let streamCompleted = false;

      const chunks = [
        ': ping keepalive comment\n\n',
        'data: {"choices":[{"delta":{"role":"assistant"}}}\n\n',
        'data: {"choices":[{"delta":{"content":"<think>Considering tensor dimensions: [batch, heads, seq, dim]. "}}]}\n\n',
        'data: {"choices":[{"delta":{"content":"Sliding window size should be 512.</think>"}}]}\n\n',
        'data: {"choices":[{"delta":{"content":"class Attention(nn.Module):\\n"}}]}\n\n',
        'data: {"choices":[{"delta":{"content":"    def __init__(self):\\n        super().__init__()\\n"}}]}\n\n',
        ': ping\n\n',
        'data: [DONE]\n\n',
      ];

      chunks.forEach((chunk) => {
        parser.parseChunk(chunk, {
          onToken: (tok) => emittedTokens.push(tok),
          onReasoning: (th) => emittedThoughts.push(th),
          onComplete: () => {
            streamCompleted = true;
          },
        });
      });

      expect(streamCompleted).toBe(true);
      expect(emittedThoughts.join('')).toContain('Considering tensor dimensions');
      expect(emittedThoughts.join('')).toContain('Sliding window size should be 512');
      expect(emittedTokens.join('')).toContain('class Attention(nn.Module):');
      expect(emittedTokens.join('')).toContain('super().__init__()');
    });

    it('1.4: handles DeepSeek R1 native reasoning delta field without <think> tags', () => {
      const parser = new SSEStreamParser();
      const tokens: string[] = [];
      const thoughts: string[] = [];

      const r1Chunk = `data: {"choices":[{"delta":{"reasoning":"Analyzing paper theorem 4.1 on convergence rate.\\n"}}]}\n\ndata: {"choices":[{"delta":{"content":"def compute_loss(logits, targets):\\n    return F.cross_entropy(logits, targets)\\n"}}]}\n\ndata: [DONE]\n\n`;

      parser.parseChunk(r1Chunk, {
        onToken: (t) => tokens.push(t),
        onReasoning: (r) => thoughts.push(r),
      });

      expect(thoughts.join('')).toContain('Analyzing paper theorem 4.1');
      expect(tokens.join('')).toContain('def compute_loss');
    });
  });

  // ==========================================================================
  // Suite 2: Adversarial AST Validation & Deterministic Python Repair
  // ==========================================================================
  describe('Suite 2: Adversarial AST Validation & Deterministic Python Repair', () => {
    it('2.1: validates deeply nested Python structures with async methods, decorators, and try/finally blocks', () => {
      const nestedPythonCode = `
import asyncio
from typing import AsyncGenerator, Dict, Any

class ModelExecutor:
    """Manages asynchronous streaming execution of transformer blocks."""
    
    def __init__(self, config: Dict[str, Any]):
        self.config = config
        self._lock = asyncio.Lock()
        
    async def stream_inference(self, prompt: str) -> AsyncGenerator[str, None]:
        async with self._lock:
            try:
                for chunk in ["token1", "token2", "token3"]:
                    if chunk == "error":
                        raise ValueError("Invalid chunk")
                    elif chunk == "skip":
                        continue
                    else:
                        yield chunk
            except Exception as e:
                yield f"ERROR: {str(e)}"
            finally:
                pass

if __name__ == '__main__':
    executor = ModelExecutor(config={"d_model": 512})
    print("Executor initialized")
`;

      const result = PythonAstValidator.validateFile(nestedPythonCode, 'executor.py');
      expect(result.valid).toBe(true);
      expect(result.errors).toHaveLength(0);
      expect(result.metrics.classesCount).toBe(1);
      expect(result.metrics.functionsCount).toBe(2); // __init__, stream_inference
      expect(result.metrics.hasMainBlock).toBe(true);
      expect(result.metrics.importedModules).toContain('asyncio');
      expect(result.metrics.importedModules).toContain('typing');
    });

    it('2.2: deterministically repairs markdown code fences, smart unicode quotes, and non-breaking spaces', () => {
      const dirtyCode = '```python\r\n' +
        'class TransformerBlock:\n' +
        '    def __init__(self, name=\u201Cmistral\u201D):\n' +
        '        self.name\u00A0=\u00A0name\u2013\u2018v1\u2019\n' +
        '        self.layers = []\n' +
        '```';

      const preFixed = PythonAstValidator.deterministicPreFix(dirtyCode);
      expect(preFixed.includes('```')).toBe(false);
      expect(preFixed.includes('\u201C')).toBe(false);
      expect(preFixed.includes('\u00A0')).toBe(false);
      expect(preFixed.includes('"mistral"')).toBe(true);
      expect(preFixed.endsWith('\n')).toBe(true);

      const val = PythonAstValidator.validateFile(dirtyCode, 'transformer.py');
      expect(val.valid).toBe(true);
    });

    it('2.3: detects unbalanced brackets and unterminated strings with precise line diagnostics', () => {
      const brokenBrackets = `
def calculate_attention(q, k, v):
    scores = torch.matmul(q, k.transpose(-2, -1) / math.sqrt(d_k)
    weights = F.softmax(scores, dim=-1)
    return torch.matmul(weights, v)
`;
      const result = PythonAstValidator.validateFile(brokenBrackets, 'broken.py');
      expect(result.valid).toBe(false);
      expect(result.errors.length).toBeGreaterThan(0);
      expect(result.errors[0].rule).toBe('syntax-bracket-unclosed');
      expect(result.errors[0].line).toBe(3);

      const unterminatedDocstring = `
def execute():
    """This docstring is never closed properly
    val = 42
    return val
`;
      const docResult = PythonAstValidator.validateFile(unterminatedDocstring, 'unterminated.py');
      expect(docResult.valid).toBe(false);
      expect(docResult.errors.some((e) => e.rule === 'syntax-unterminated-string')).toBe(true);
    });

    it('2.4: sanitizes relative imports and validates multi-file workspace consistency with requirements.txt', () => {
      const projectFiles: Record<string, string> = {
        'model/attention.py': `
import torch
import torch.nn as nn
from math import sqrt

class Attention(nn.Module):
    def __init__(self, d_model: int):
        super().__init__()
        self.d_model = d_model
`,
        'model/transformer.py': `
import torch
import torch.nn as nn
from model.attention import Attention

class Transformer(nn.Module):
    def __init__(self):
        super().__init__()
        self.attn = Attention(512)
`,
        'tests/test_model.py': `
import pytest
import torch
from model.transformer import Transformer

def test_init():
    m = Transformer()
    assert m.attn.d_model == 512
`,
        'requirements.txt': 'torch>=2.0.0\npytest>=8.0.0\n',
      };

      const projectValidation = PythonAstValidator.validateProject(projectFiles);
      expect(projectValidation.allValid).toBe(true);
      expect(projectValidation.crossFileErrors).toHaveLength(0);
      expect(projectValidation.missingDependencies).toHaveLength(0);
      expect(projectValidation.summary.hasTestSuite).toBe(true);
      expect(projectValidation.summary.validFilesCount).toBe(3);
    });

    it('2.5: catches unnecessary standard library modules placed in requirements.txt', () => {
      const projectFiles: Record<string, string> = {
        'main.py': 'import os\nimport sys\nimport json\nimport requests\n\nif __name__ == "__main__":\n    pass\n',
        'requirements.txt': 'os\nrequests\njson\nsys\n',
      };

      const res = PythonAstValidator.validateProject(projectFiles);
      expect(res.unnecessaryStdlibInRequirements).toContain('os');
      expect(res.unnecessaryStdlibInRequirements).toContain('json');
      expect(res.unnecessaryStdlibInRequirements).toContain('sys');
      expect(res.allValid).toBe(false);
    });
  });

  // ==========================================================================
  // Suite 3: Rapid 429 Cascade & Guardrails Resilience Under Load
  // ==========================================================================
  describe('Suite 3: Rapid 429 Cascade & Guardrails Resilience Under Load', () => {
    it('3.1: cascades sequentially across all 5 free models on consecutive 429 rate limit errors', () => {
      const router = new OpenRouterFreeRouter(keyStore);

      const m1 = 'google/gemini-2.0-flash-exp:free';
      const m2 = 'qwen/qwen-2.5-coder-32b-instruct:free';
      const m3 = 'meta-llama/llama-3.3-70b-instruct:free';
      const m4 = 'deepseek/deepseek-r1:free';
      const m5 = 'mistralai/mistral-small-24b-instruct-2501:free';

      expect(router.getOrderedFreeModels()[0]).toBe(m1);

      // 1st 429 on Gemini
      router.record429(m1, 30);
      expect(router.getOrderedFreeModels()[0]).toBe(m2);

      // 2nd 429 on Qwen
      router.record429(m2, 30);
      expect(router.getOrderedFreeModels()[0]).toBe(m3);

      // 3rd 429 on Llama
      router.record429(m3, 30);
      expect(router.getOrderedFreeModels()[0]).toBe(m4);

      // 4th 429 on DeepSeek
      router.record429(m4, 30);
      expect(router.getOrderedFreeModels()[0]).toBe(m5);

      // 5th 429 on Mistral Small
      router.record429(m5, 30);
      expect(router.getOrderedFreeModels()).toHaveLength(0); // All in cooldown
    });

    it('3.2: recovers healthy state when cooldown expires or successful response is recorded', () => {
      const router = new OpenRouterFreeRouter(keyStore);
      const m1 = 'google/gemini-2.0-flash-exp:free';

      router.record429(m1, 10);
      expect(router.getModelHealth(m1)?.isAvailable).toBe(false);

      // Successful request resets health
      router.recordSuccess(m1);
      const health = router.getModelHealth(m1);
      expect(health?.isAvailable).toBe(true);
      expect(health?.errorCount).toBe(0);
      expect(health?.cooldownUntil).toBe(0);
    });

    it('3.3: strictly blocks paid model identifiers and unauthorized localhost URLs', () => {
      // Test paid model blockers
      PAID_MODELS.forEach((paid) => {
        expect(ModelGuardrails.isFreeModel(paid)).toBe(false);
        const val = ModelGuardrails.validateModel(paid);
        expect(val.valid).toBe(false);
        expect(val.error).toContain('Only \':free\' models are permitted');
      });

      // Test local LLM URL blockers
      const prohibitedUrls = [
        'http://localhost:11434/api/generate',
        'http://127.0.0.1:8000/v1/chat',
        'http://0.0.0.0:5000/predict',
        'http://[::1]:8080/v1',
        'http://my-local-ollama-box:11434/v1',
      ];

      prohibitedUrls.forEach((url) => {
        expect(ModelGuardrails.isLocalhostOrOllamaUrl(url)).toBe(true);
        const val = ModelGuardrails.validateEndpoint(url);
        expect(val.valid).toBe(false);
        expect(val.error).toContain('strictly prohibited');
      });

      // Authorized endpoints
      expect(ModelGuardrails.validateEndpoint('https://openrouter.ai/api/v1/chat/completions').valid).toBe(true);
      expect(ModelGuardrails.validateEndpoint('https://api.github.com/user/repos').valid).toBe(true);
      expect(ModelGuardrails.validateEndpoint('https://export.arxiv.org/api/query').valid).toBe(true);
    });

    it('3.4: sanitizes API keys and PATs from log streams and error outputs', () => {
      const sensitiveKey = 'sk-or-v1-998877665544332211aabbcc';
      const sensitivePat = 'ghp_developerSuperSecretPatToken999';

      const dirtyLog = `Failed connecting with key ${sensitiveKey} for PAT ${sensitivePat} at endpoint.`;
      const clean = ModelGuardrails.scrubKey(dirtyLog, [sensitiveKey, sensitivePat]);

      expect(clean.includes(sensitiveKey)).toBe(false);
      expect(clean.includes(sensitivePat)).toBe(false);
      expect(clean).toContain('[REDACTED_API_KEY]');
    });

    it('3.5: validates openrouter keys and github tokens formats and masks keys cleanly', () => {
      expect(isValidOpenRouterKeyFormat('sk-or-v1-abc1234567890123456789012345')).toBe(true);
      expect(isValidOpenRouterKeyFormat('invalid-key')).toBe(false);
      expect(isValidOpenRouterKeyFormat('')).toBe(false);

      expect(isValidGitHubPatFormat('ghp_123456789012345678901234567890123456')).toBe(true);
      expect(isValidGitHubPatFormat('github_pat_1234567890123456789012_abcdef')).toBe(true);
      expect(isValidGitHubPatFormat('invalid_token')).toBe(false);

      const masked = maskKey('sk-or-v1-abcdef0123456789');
      expect(masked.startsWith('sk-or-v1')).toBe(true);
      expect(masked.endsWith('6789')).toBe(true);
      expect(masked.includes('••••')).toBe(true);
    });
  });

  // ==========================================================================
  // Suite 4: Complex Multi-File Git Data API Tree & Atomic Commit Push
  // ==========================================================================
  describe('Suite 4: Complex Multi-File Git Data API Tree & Atomic Commit Push', () => {
    it('4.1: simulates deep nested file tree creation with Git Data API architecture', async () => {
      const publisher = new GitHubPublisherSimulator();
      const pat = 'ghp_validDeveloperPatToken12345';

      const complexFiles: Record<string, WorkflowFile> = {
        'src/core/attention/sliding_window.py': {
          path: 'src/core/attention/sliding_window.py',
          content: 'import torch\n\nclass SlidingWindow: pass\n',
          language: 'python',
        },
        'src/core/models/transformer.py': {
          path: 'src/core/models/transformer.py',
          content: 'from src.core.attention.sliding_window import SlidingWindow\n\nclass Transformer: pass\n',
          language: 'python',
        },
        'src/utils/data/dataloader.py': {
          path: 'src/utils/data/dataloader.py',
          content: 'class CustomLoader: pass\n',
          language: 'python',
        },
        'tests/unit/test_sliding.py': {
          path: 'tests/unit/test_sliding.py',
          content: 'import pytest\n\ndef test_init(): assert True\n',
          language: 'python',
        },
        '.github/workflows/ci.yml': {
          path: '.github/workflows/ci.yml',
          content: 'name: CI\non: [push]\njobs:\n  test:\n    runs-on: ubuntu-latest\n    steps:\n      - uses: actions/checkout@v4\n',
          language: 'yaml',
        },
        'README.md': {
          path: 'README.md',
          content: '# Sliding Window Transformer\n\nFull deep-tree implementation.',
          language: 'markdown',
        },
      };

      const result = await publisher.createAndPushRepo(pat, {
        repoName: 'deep-tree-transformer-impl',
        description: 'Autonomous research release with nested tree',
        isPrivate: false,
        files: complexFiles,
        commitMessage: 'feat(core): initial deep tree release',
      });

      expect(result.repoUrl).toBe('https://github.com/autogit-researcher/deep-tree-transformer-impl');
      expect(result.publishedFilesCount).toBe(6);
      expect(result.commitSha).toHaveLength(40);

      const storedRepo = publisher.getRepo('deep-tree-transformer-impl');
      expect(storedRepo).toBeDefined();
      expect(storedRepo?.files['src/core/attention/sliding_window.py']).toContain('class SlidingWindow');
      expect(storedRepo?.files['.github/workflows/ci.yml']).toContain('actions/checkout@v4');
    });

    it('4.2: real GitHubPublisher client performs token verification and error extraction', async () => {
      const publisher = new GitHubPublisher();

      // Mock fetch for GitHub /user
      globalThis.fetch = vi.fn().mockImplementation((url: string, init?: RequestInit) => {
        if (url.endsWith('/user')) {
          const auth = (init?.headers as any)?.Authorization || '';
          if (!auth.includes('ghp_valid')) {
            return Promise.resolve(new Response(JSON.stringify({ message: 'Bad credentials' }), {
              status: 401,
              statusText: 'Unauthorized',
              headers: { 'Content-Type': 'application/json' },
            }));
          }
          return Promise.resolve(new Response(JSON.stringify({
            login: 'autogit-bot',
            name: 'AutoGIT Research Bot',
            avatar_url: 'https://github.com/images/autogit.png',
          }), {
            status: 200,
            headers: {
              'Content-Type': 'application/json',
              'x-oauth-scopes': 'repo, read:user, workflow',
            },
          }));
        }
        return Promise.resolve(new Response(null, { status: 404 }));
      });

      const user = await publisher.verifyToken('ghp_validToken12345');
      expect(user.username).toBe('autogit-bot');
      expect(user.scopes).toContain('repo');
      expect(user.scopes).toContain('workflow');

      await expect(publisher.verifyToken('ghp_invalidToken')).rejects.toThrow('Invalid GitHub Personal Access Token (401 Unauthorized)');
    });

    it('4.3: handles rate limit 403 with x-ratelimit-remaining: 0', async () => {
      const publisher = new GitHubPublisher();

      globalThis.fetch = vi.fn().mockResolvedValue(new Response(JSON.stringify({ message: 'API rate limit exceeded' }), {
        status: 403,
        statusText: 'Forbidden',
        headers: {
          'Content-Type': 'application/json',
          'x-ratelimit-remaining': '0',
        },
      }));

      await expect(publisher.verifyToken('ghp_validToken12345')).rejects.toThrow('GitHub API rate limit exceeded');
    });
  });

  // ==========================================================================
  // Suite 5: End-to-End Adversarial User Journey & Pipeline Simulation
  // ==========================================================================
  describe('Suite 5: End-to-End Adversarial User Journey & Pipeline Simulation', () => {
    it('5.1: executes end-to-end flow: malformed arXiv input -> multi-round debate -> self-healing code fix -> Monaco diff -> JSZip build -> GitHub push', async () => {
      // 1. BYOK Storage Setup
      const openRouterKey = 'sk-or-v1-valid-free-user-key-999';
      const githubPat = 'ghp_productionResearcherPatToken777';
      await keyStore.saveKeys({ openRouterKey, githubPat }, false);

      // 2. Adversarial arXiv URL parsing with extra whitespaces and parameters
      const noisyUrl = '   https://arxiv.org/abs/2401.12345v2?context=cs.AI#section1   ';
      const arxivId = ArxivParser.extractArxivId(noisyUrl);
      expect(arxivId).toBe('2401.12345v2');

      const mockArxivXml = `<?xml version="1.0" encoding="utf-8"?>
<feed xmlns="http://www.w3.org/2005/Atom">
  <entry>
    <id>http://arxiv.org/abs/2401.12345v2</id>
    <title>   FlashLinearAttention: Fast Linear Attention with Kernel Fusion  </title>
    <summary>   Introduces chunkwise linear attention kernel fusion in Triton for $O(N)$ sequence scaling.  </summary>
    <author><name>Songlin Yang</name></author>
    <author><name>Yu Zhang</name></author>
    <published>2024-01-20T10:00:00Z</published>
    <category term="cs.LG" />
    <category term="cs.CL" />
  </entry>
</feed>`;

      const paper = ArxivParser.parseAtomXml(mockArxivXml);
      expect(paper?.id).toBe('2401.12345v2');
      expect(paper?.title).toBe('FlashLinearAttention: Fast Linear Attention with Kernel Fusion');
      expect(paper?.authors).toEqual(['Songlin Yang', 'Yu Zhang']);

      // 3. Workflow State Progression through 19-Stage Machine
      const workflow: WorkflowState = {
        stage: 'research_discovery',
        topicOrArxiv: arxivId!,
        paperTitle: paper?.title,
        paperSummary: paper?.summary,
        debateTurns: [],
        generatedFiles: {},
        logs: [],
        activeModel: 'google/gemini-2.0-flash-exp:free',
        status: 'running',
      };

      // 4. Multi-Agent Debate Simulation (2 Rounds)
      workflow.stage = 'multi_agent_debate';
      const debate = new MultiAgentDebateEngine(2, 0.85);

      DEBATE_PERSONAS.forEach((p) => {
        debate.addTurn({
          agent: p.name,
          role: p.focus,
          round: 1,
          message: `Round 1 analysis on ${paper?.title}: Evaluating kernel fusion formulas and Triton GPU constraints.`,
        });
      });

      DEBATE_PERSONAS.forEach((p) => {
        debate.addTurn({
          agent: p.name,
          role: p.focus,
          round: 2,
          message: `Round 2 agreement: Full alignment achieved on chunkwise parallel scan architecture. Solid consensus.`,
        });
      });

      expect(debate.isConsensusReached()).toBe(true);

      // 5. Code Generation with initial draft containing markdown fences & syntax flaw
      workflow.stage = 'code_generation';
      const initialCodeDraft = '```python\n' +
        'import torch\n' +
        'import torch.nn as nn\n\n' +
        'class FlashLinearAttention(nn.Module):\n' +
        '    def __init__(self, d_model: int = 512):\n' +
        '        super().__init__()\n' +
        '        self.d_model = d_model\n' +
        '        self.scale = 1.0 / (d_model ** 0.5)\n\n' +
        '    def forward(self, q, k, v):\n' +
        '        # Initial formula\n' +
        '        kv = torch.matmul(k.transpose(-2, -1), v)\n' +
        '        return torch.matmul(q, kv) * self.scale\n' +
        '```';

      // 6. AST Validation & Self-Healing Reflection
      workflow.stage = 'code_testing';
      const sanitizedCode = PythonAstValidator.deterministicPreFix(initialCodeDraft);
      const testResult = PythonAstValidator.validateFile(sanitizedCode, 'fla.py');
      expect(testResult.valid).toBe(true);

      const finalImprovedCode = `import torch
import torch.nn as nn
import math

class FlashLinearAttention(nn.Module):
    """Chunkwise Linear Attention with O(N) memory complexity."""
    def __init__(self, d_model: int = 512, chunk_size: int = 64):
        super().__init__()
        self.d_model = d_model
        self.chunk_size = chunk_size
        self.scale = 1.0 / math.sqrt(d_model)

    def forward(self, q: torch.Tensor, k: torch.Tensor, v: torch.Tensor) -> torch.Tensor:
        # Optimized chunkwise linear scan implementation
        kv = torch.matmul(k.transpose(-2, -1), v)
        out = torch.matmul(q, kv) * self.scale
        return out

if __name__ == '__main__':
    layer = FlashLinearAttention(d_model=256)
    x = torch.randn(2, 128, 256)
    res = layer(x, x, x)
    print("Output shape:", res.shape)
`;

      workflow.generatedFiles = {
        'fla/linear_attention.py': {
          path: 'fla/linear_attention.py',
          content: finalImprovedCode,
          language: 'python',
        },
        'tests/test_fla.py': {
          path: 'tests/test_fla.py',
          content: `import pytest\nimport torch\nfrom fla.linear_attention import FlashLinearAttention\n\ndef test_fla():\n    m = FlashLinearAttention(d_model=128)\n    x = torch.randn(1, 32, 128)\n    out = m(x, x, x)\n    assert out.shape == x.shape\n`,
          language: 'python',
        },
        'requirements.txt': {
          path: 'requirements.txt',
          content: 'torch>=2.0.0\npytest>=8.0.0\n',
          language: 'plaintext',
        },
        'README.md': {
          path: 'README.md',
          content: `# ${paper?.title}\n\nGenerated autonomously by AutoGIT Web Studio.\n\n## Abstract\n${paper?.summary}\n`,
          language: 'markdown',
        },
      };

      // 7. Diff Viewer Inspection
      const diffHunks = SimpleDiffEngine.computeLineDiff(sanitizedCode, finalImprovedCode);
      expect(diffHunks).toHaveLength(1);
      expect(diffHunks[0].lines.some((l) => l.type === 'add')).toBe(true);

      // 8. JSZip Package Export
      const zipBuilder = new ClientZipBuilder();
      for (const [p, f] of Object.entries(workflow.generatedFiles)) {
        zipBuilder.file(p, f.content);
      }
      const zipResult = await zipBuilder.generateAsync();
      expect(zipResult.fileCount).toBe(4);
      expect(zipResult.uint8Array.byteLength).toBeGreaterThan(100);

      // 9. GitHub Publisher Git Data API Push
      workflow.stage = 'ready_to_publish';
      const publisher = new GitHubPublisherSimulator();
      const pubRes = await publisher.createAndPushRepo(githubPat, {
        repoName: 'flash-linear-attention-autonomous',
        description: `Autonomous implementation of arXiv:${arxivId} (${paper?.title})`,
        isPrivate: false,
        files: workflow.generatedFiles,
        commitMessage: 'feat(research): initial autonomous release via AutoGIT BYOK Web Studio',
      });

      expect(pubRes.repoUrl).toContain('flash-linear-attention-autonomous');
      expect(pubRes.publishedFilesCount).toBe(4);
      expect(pubRes.commitSha).toHaveLength(40);

      workflow.stage = 'published';
      workflow.status = 'completed';
      expect(workflow.stage).toBe('published');
      expect(workflow.status).toBe('completed');
    });
  });
});
