/**
 * Tier 4: Real-World Research-to-GitHub Application Scenarios
 * End-to-end user journeys simulating complete autonomous research workflows.
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
  WorkflowState,
  WorkflowFile,
} from '../helpers/testUtils';

describe('Tier 4: Real-World Research-to-GitHub Application Scenarios', () => {
  let keyStore: ClientKeyStore;

  beforeEach(() => {
    sessionStorage.clear();
    localStorage.clear();
    keyStore = new ClientKeyStore();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  // ==========================================================================
  // Scenario 1: Quantum / ML Transformer Paper to GitHub Publication
  // ==========================================================================
  it('Scenario 1: Complete Autonomous arXiv Ingestion -> 6-Agent Debate -> Code Gen -> GitHub Push', async () => {
    // 1. User configures BYOK keys in client store
    const openRouterKey = 'sk-or-v1-production-free-key-888';
    const githubPat = 'ghp_developerPersonalAccessToken123';
    await keyStore.saveKeys({ openRouterKey, githubPat }, false);

    expect(await keyStore.hasOpenRouterKey()).toBe(true);
    expect(await keyStore.hasGitHubPat()).toBe(true);

    // 2. User inputs arXiv URL in Studio
    const inputUrl = 'https://arxiv.org/abs/2310.06825';
    const arxivId = ArxivParser.extractArxivId(inputUrl);
    expect(arxivId).toBe('2310.06825');

    // 3. arXiv Atom XML ingestion
    const mockArxivAtomXml = `<?xml version="1.0" encoding="UTF-8"?>
<feed xmlns="http://www.w3.org/2005/Atom">
  <entry>
    <id>http://arxiv.org/abs/2310.06825v1</id>
    <title>Mistral 7B: Efficient Open Weights Architecture</title>
    <summary>Mistral 7B leverages sliding window attention (SWA) with theoretical cache reduction.</summary>
    <author><name>Albert Q. Jiang</name></author>
    <author><name>Guillaume Lample</name></author>
    <published>2023-10-10T12:00:00Z</published>
    <category term="cs.CL" />
  </entry>
</feed>`;

    const paper = ArxivParser.parseAtomXml(mockArxivAtomXml);
    expect(paper?.title).toContain('Mistral 7B');
    expect(paper?.authors).toHaveLength(2);

    // 4. Initialize Pipeline State Machine
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

    // 5. 6-Persona Multi-Agent Debate Execution (Round 1 + Round 2 Convergence)
    workflow.stage = 'multi_agent_debate';
    const debate = new MultiAgentDebateEngine(2, 0.85);

    DEBATE_PERSONAS.forEach((persona) => {
      debate.addTurn({
        agent: persona.name,
        role: persona.focus,
        round: 1,
        message: `Round 1 analysis on ${paper?.title}: Analyzing sliding window attention specs.`,
      });
    });

    DEBATE_PERSONAS.forEach((persona) => {
      debate.addTurn({
        agent: persona.name,
        role: persona.focus,
        round: 2,
        message: `Round 2 consensus: Fully agree and aligned with proposed sliding window attention architecture. Approved.`,
      });
    });

    expect(debate.getTurns()).toHaveLength(12);
    expect(debate.isConsensusReached()).toBe(true);
    const synthesis = debate.generateSynthesis();
    expect(synthesis).toContain('Multi-Agent Debate Synthesis');

    // 6. Code Generation Engine creates repository files
    workflow.stage = 'code_generation';
    workflow.generatedFiles = {
      'mistral/__init__.py': {
        path: 'mistral/__init__.py',
        content: '__version__ = "0.1.0"\n',
        language: 'python',
      },
      'mistral/attention.py': {
        path: 'mistral/attention.py',
        content: `import torch
import torch.nn as nn

class SlidingWindowAttention(nn.Module):
    """Implements Sliding Window Attention from Mistral 7B paper (arXiv:2310.06825)"""
    def __init__(self, d_model: int = 4096, n_heads: int = 32, window_size: int = 4096):
        super().__init__()
        self.d_model = d_model
        self.n_heads = n_heads
        self.window_size = window_size
        self.q_proj = nn.Linear(d_model, d_model, bias=False)
        self.k_proj = nn.Linear(d_model, d_model, bias=False)
        self.v_proj = nn.Linear(d_model, d_model, bias=False)
        self.out_proj = nn.Linear(d_model, d_model, bias=False)

    def forward(self, x: torch.Tensor) -> torch.Tensor:
        # Standard causal sliding window forward pass
        return self.out_proj(x)
`,
        language: 'python',
      },
      'tests/test_attention.py': {
        path: 'tests/test_attention.py',
        content: `import pytest
from mistral.attention import SlidingWindowAttention

def test_sliding_window_init():
    layer = SlidingWindowAttention(d_model=512, n_heads=8, window_size=256)
    assert layer.window_size == 256
`,
        language: 'python',
      },
      'requirements.txt': {
        path: 'requirements.txt',
        content: 'torch>=2.0.0\npytest>=8.0.0\n',
        language: 'plaintext',
      },
      'README.md': {
        path: 'README.md',
        content: `# ${paper?.title}\n\nAutonomous implementation generated by AutoGIT Web Studio.\n\n## Paper Summary\n${paper?.summary}\n`,
        language: 'markdown',
      },
    };

    expect(Object.keys(workflow.generatedFiles)).toHaveLength(5);

    // 7. Scaffolding & Verification
    workflow.stage = 'ready_to_publish';
    workflow.status = 'completed';

    // 8. Direct GitHub Repo Creation & Atomic Commit
    const publisher = new GitHubPublisherSimulator();
    const publishRes = await publisher.createAndPushRepo(githubPat, {
      repoName: 'mistral-7b-sliding-window-impl',
      description: `Autonomous implementation of arXiv:2310.06825 (${paper?.title})`,
      isPrivate: false,
      files: workflow.generatedFiles,
      commitMessage: 'feat: initial autonomous research release via AutoGIT Web Studio',
    });

    expect(publishRes.repoUrl).toBe('https://github.com/autogit-researcher/mistral-7b-sliding-window-impl');
    expect(publishRes.publishedFilesCount).toBe(5);
    expect(publishRes.commitSha).toHaveLength(40);

    workflow.stage = 'published';
    expect(workflow.stage).toBe('published');
  });

  // ==========================================================================
  // Scenario 2: 429 Rate-Limit Cascade & Deep Reasoning during Debate
  // ==========================================================================
  it('Scenario 2: Resilient Failover on 429 Rate Limits and SSE Reasoning Stream', async () => {
    const router = new OpenRouterFreeRouter(keyStore);
    const parser = new SSEStreamParser();

    // Primary model starts
    const primaryModel = 'google/gemini-2.0-flash-exp:free';
    expect(router.getOrderedFreeModels()[0]).toBe(primaryModel);

    // OpenRouter returns 429 Too Many Requests
    router.record429(primaryModel, 30);

    // Automatic cascade to backup model
    const cascadeList = router.getOrderedFreeModels();
    const backupModel = cascadeList[0];
    expect(backupModel).toBe('qwen/qwen-2.5-coder-32b-instruct:free');

    // Live SSE stream from backup model with DeepSeek/Qwen thinking tokens
    const tokens: string[] = [];
    const reasoning: string[] = [];

    const streamChunks = [
      'data: {"choices":[{"delta":{"content":"<think>Comparing Graph Convolutional Networks with Message Passing Neural Networks for molecular affinity.</think>"}}]}\n\n',
      'data: {"choices":[{"delta":{"content":"class GNNLayer(nn.Module):\\n    def __init__(self):\\n        super().__init__()\\n"}}]}\n\n',
      'data: [DONE]\n\n',
    ];

    streamChunks.forEach((chunk) => {
      parser.parseChunk(chunk, {
        onToken: (t) => tokens.push(t),
        onReasoning: (r) => reasoning.push(r),
      });
    });

    expect(reasoning.join('')).toContain('Graph Convolutional Networks');
    expect(tokens.join('')).toContain('class GNNLayer');

    // Mark successful completion on backup model
    router.recordSuccess(backupModel);
    expect(router.getModelHealth(backupModel)?.errorCount).toBe(0);
  });

  // ==========================================================================
  // Scenario 3: BYOK Security Isolation & Zero-Leakage Lifecycle
  // ==========================================================================
  it('Scenario 3: WebCrypto Session Key Storage, Domain Whitelisting, and Clean Revocation', async () => {
    const openRouterKey = 'sk-or-v1-confidential-user-key-99999';
    const githubPat = 'ghp_sensitiveGitHubPersonalToken88888';

    // 1. Save in sessionStorage (ephemeral, zero server persistence)
    await keyStore.saveKeys({ openRouterKey, githubPat }, false);

    // 2. Verify raw storage does NOT expose keys in plaintext
    const rawStored = sessionStorage.getItem('autogit_keys_v1') || '';
    expect(rawStored.includes('confidential')).toBe(false);
    expect(rawStored.includes('sensitive')).toBe(false);

    // 3. Intercept outbound network targets to verify strict whitelist
    const targetUrl1 = 'https://openrouter.ai/api/v1/chat/completions';
    const targetUrl2 = 'https://api.github.com/user/repos';
    const maliciousUrl = 'https://telemetry-harvesting.com/collect';

    expect(ModelGuardrails.validateEndpoint(targetUrl1).valid).toBe(true);
    expect(ModelGuardrails.validateEndpoint(targetUrl2).valid).toBe(true);
    expect(ModelGuardrails.validateEndpoint(maliciousUrl).valid).toBe(false);

    // 4. Test error log scrubbing
    const leakedLog = `Error: HTTP 401 Unauthorized using key ${openRouterKey}`;
    const scrubbed = ModelGuardrails.scrubKey(leakedLog, [openRouterKey]);
    expect(scrubbed).not.toContain(openRouterKey);
    expect(scrubbed).toContain('[REDACTED_API_KEY]');

    // 5. User clicks "Clear Keys"
    await keyStore.clearKeys();
    expect(await keyStore.hasOpenRouterKey()).toBe(false);
    expect(await keyStore.hasGitHubPat()).toBe(false);
    expect(sessionStorage.getItem('autogit_keys_v1')).toBeNull();
  });

  // ==========================================================================
  // Scenario 4: Full Client-Side Zip Archive Construction
  // ==========================================================================
  it('Scenario 4: Research-to-JSZip Multi-File Package Creation & Binary Blob Validation', async () => {
    const topic = 'LoRA Low-Rank Adaptation PyTorch';
    const zip = new ClientZipBuilder();

    // Generated files
    zip.file('lora/__init__.py', '__version__ = "0.1.0"\n');
    zip.file(
      'lora/layers.py',
      `import torch
import torch.nn as nn

class LoRALinear(nn.Module):
    def __init__(self, in_features: int, out_features: int, rank: int = 8, alpha: float = 16.0):
        super().__init__()
        self.rank = rank
        self.scaling = alpha / rank
        self.lora_A = nn.Parameter(torch.zeros(rank, in_features))
        self.lora_B = nn.Parameter(torch.zeros(out_features, rank))
`
    );
    zip.file('tests/test_lora.py', 'def test_lora_shape(): pass\n');
    zip.file('requirements.txt', 'torch>=2.0.0\npytest\n');
    zip.file('README.md', `# ${topic}\n\nAutonomous LoRA implementation.\n`);
    zip.file('LICENSE', 'MIT License\nCopyright (c) 2026 AutoGIT\n');

    const result = await zip.generateAsync();

    expect(result.fileCount).toBe(6);
    expect(result.blob.type).toBe('application/zip');
    expect(result.uint8Array.byteLength).toBeGreaterThan(100);

    // Verify synthetic zip header integrity
    const decoder = new TextDecoder();
    const rawHeader = decoder.decode(result.uint8Array.slice(0, 30));
    expect(rawHeader).toContain('PK\x03\x04FILE:lora/__init__.py');
  });

  // ==========================================================================
  // Scenario 5: Diff Inspection & Manual Code Refinement
  // ==========================================================================
  it('Scenario 5: Multi-Round Self-Healing Code Refinement, Diff Viewer, and Manual Edit Commit', async () => {
    // Initial Draft (Round 1)
    const round1Code = `def query_engine(prompt: str):
    data = fetch_documents(prompt)
    return synthesize(data)
`;

    // Self-Healing Refined Code (Round 2)
    const round2Code = `def query_engine(prompt: str):
    try:
        data = fetch_documents(prompt)
        if not data:
            return "No documents found."
        return synthesize(data)
    except Exception as e:
        logger.error(f"Error querying engine: {e}")
        return "Internal query error."
`;

    // 1. Side-by-Side Diff Viewer verification
    const diff = SimpleDiffEngine.computeLineDiff(round1Code, round2Code);
    expect(diff).toHaveLength(1);

    const addedLines = diff[0].lines.filter((l) => l.type === 'add');
    const removedLines = diff[0].lines.filter((l) => l.type === 'del');

    expect(addedLines.length).toBeGreaterThan(4);
    expect(addedLines.some((l) => l.text.includes('try:'))).toBe(true);
    expect(removedLines.some((l) => l.text.includes('return synthesize(data)'))).toBe(true);

    // 2. User manually refines the file in Monaco Editor
    const userModifiedCode = round2Code + '\n# Verified by User in Monaco Editor\n';

    const files: Record<string, WorkflowFile> = {
      'rag/engine.py': {
        path: 'rag/engine.py',
        content: userModifiedCode,
        language: 'python',
      },
      'README.md': {
        path: 'README.md',
        content: '# RAG Engine with Error Recovery\n',
        language: 'markdown',
      },
    };

    // 3. User commits refined version to GitHub
    const publisher = new GitHubPublisherSimulator();
    const result = await publisher.createAndPushRepo('ghp_userPat123', {
      repoName: 'rag-engine-self-healing',
      description: 'Autonomous RAG with Self-Healing Error Recovery',
      isPrivate: false,
      files,
      commitMessage: 'feat: self-healing query engine with error handling',
    });

    expect(result.publishedFilesCount).toBe(2);
    const repo = publisher.getRepo('rag-engine-self-healing');
    expect(repo?.files['rag/engine.py']).toContain('Verified by User in Monaco Editor');
  });
});
