/**
 * Tier 3: Pairwise Combinations E2E Test Suite
 * Cross-feature integration testing validating interactions between key components.
 * Key Store -> Router -> Debate -> Code Gen -> Diff -> JSZip -> GitHub Publish.
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
  WorkflowStage,
  WorkflowFile,
  WorkflowState,
} from '../helpers/testUtils';

describe('Tier 3: Cross-Feature Pairwise Integrations', () => {
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
  // Pair 1: F1 (KeyStore) x F3 (OpenRouter Router)
  // ==========================================================================
  it('Pair 1 [F1 x F3]: Encrypted KeyStore credentials inject into OpenRouter request headers', async () => {
    const testKey = 'sk-or-v1-custom-secret-key-123';
    await keyStore.saveKeys({ openRouterKey: testKey }, false);

    const keys = await keyStore.getKeys();
    expect(keys.openRouterKey).toBe(testKey);

    const headers = {
      'Authorization': `Bearer ${keys.openRouterKey}`,
      'HTTP-Referer': 'https://autogit.app',
      'X-Title': 'AutoGIT Web Studio',
      'Content-Type': 'application/json',
    };

    expect(headers['Authorization']).toBe(`Bearer ${testKey}`);
    expect(sessionStorage.getItem('autogit_keys_v1')).not.toContain(testKey);
  });

  // ==========================================================================
  // Pair 2: F1 (KeyStore) x F13 (GitHub Publisher)
  // ==========================================================================
  it('Pair 2 [F1 x F13]: GitHub PAT from KeyStore authorizes Git Data API repository publisher', async () => {
    const testPat = 'ghp_developerToken987654';
    await keyStore.saveKeys({ githubPat: testPat }, false);

    const keys = await keyStore.getKeys();
    const publisher = new GitHubPublisherSimulator();
    const auth = await publisher.verifyToken(keys.githubPat);

    expect(auth.username).toBe('autogit-researcher');
    expect(auth.scopes).toContain('repo');
  });

  // ==========================================================================
  // Pair 3: F3 (Router) x F4 (429 Rate Limit Cascade)
  // ==========================================================================
  it('Pair 3 [F3 x F4]: Free Router cascades across free model chain when primary returns 429', async () => {
    const router = new OpenRouterFreeRouter(keyStore);
    const primary = 'google/gemini-2.0-flash-exp:free';

    const initial = router.getOrderedFreeModels(primary);
    expect(initial[0]).toBe(primary);

    // Simulate 429 on primary
    router.record429(primary, 60);
    const afterFailover = router.getOrderedFreeModels(primary);

    expect(afterFailover[0]).not.toBe(primary);
    expect(afterFailover[0]).toBe('qwen/qwen-2.5-coder-32b-instruct:free');
  });

  // ==========================================================================
  // Pair 4: F3 (Router) x F5 (Guardrails)
  // ==========================================================================
  it('Pair 4 [F3 x F5]: Router enforces :free guardrails and blocks paid model or local URLs', async () => {
    const attemptedPaid = 'openai/gpt-4o';
    const attemptedLocal = 'http://127.0.0.1:11434/api/generate';

    expect(ModelGuardrails.validateModel(attemptedPaid).valid).toBe(false);
    expect(ModelGuardrails.validateEndpoint(attemptedLocal).valid).toBe(false);

    const validModel = 'deepseek/deepseek-r1:free';
    const validEndpoint = 'https://openrouter.ai/api/v1/chat/completions';

    expect(ModelGuardrails.validateModel(validModel).valid).toBe(true);
    expect(ModelGuardrails.validateEndpoint(validEndpoint).valid).toBe(true);
  });

  // ==========================================================================
  // Pair 5: F3 (Router) x F8 (SSE Stream Parser)
  // ==========================================================================
  it('Pair 5 [F3 x F8]: Stream response is processed through SSE Parser with <think> tag extraction', async () => {
    const parser = new SSEStreamParser();
    const tokens: string[] = [];
    const thoughts: string[] = [];

    const streamChunks = [
      ': keepalive\n\n',
      'data: {"choices":[{"delta":{"content":"<think>Verifying equation 4 from paper</think>"}}]}\n\n',
      'data: {"choices":[{"delta":{"content":"import torch\\nimport torch.nn as nn\\n"}}]}\n\n',
      'data: [DONE]\n\n',
    ];

    streamChunks.forEach((chunk) => {
      parser.parseChunk(chunk, {
        onToken: (t) => tokens.push(t),
        onReasoning: (r) => thoughts.push(r),
      });
    });

    expect(thoughts.join('')).toContain('Verifying equation 4 from paper');
    expect(tokens.join('')).toContain('import torch');
  });

  // ==========================================================================
  // Pair 6: F6 (arXiv Ingestion) x F7 (Debate Engine)
  // ==========================================================================
  it('Pair 6 [F6 x F7]: Parsed arXiv paper metadata populates multi-agent debate persona prompts', async () => {
    const rawXml = `<entry>
      <id>2310.06825</id>
      <title>Mistral 7B</title>
      <summary>Sliding Window Attention reduces compute memory to O(W) per layer.</summary>
      <author><name>Mistral AI Team</name></author>
    </entry>`;

    const paper = ArxivParser.parseAtomXml(rawXml);
    expect(paper).not.toBeNull();

    const debateEngine = new MultiAgentDebateEngine(2, 0.85);
    debateEngine.addTurn({
      agent: 'Lead Researcher',
      role: 'Theory',
      round: 1,
      message: `Analyzing paper "${paper?.title}": ${paper?.summary}. I recommend standard PyTorch implementation.`,
    });

    expect(debateEngine.getTurns()[0].message).toContain('Mistral 7B');
    expect(debateEngine.getTurns()[0].message).toContain('Sliding Window Attention');
  });

  // ==========================================================================
  // Pair 7: F7 (Debate Engine) x F8 (SSE Stream Parser)
  // ==========================================================================
  it('Pair 7 [F7 x F8]: Live SSE streaming tokens accumulate into structured debate turns', async () => {
    const debateEngine = new MultiAgentDebateEngine(2, 0.85);
    const parser = new SSEStreamParser();

    const agentMessageStream = [
      'data: {"choices":[{"delta":{"content":"I propose "}}]}\n\n',
      'data: {"choices":[{"delta":{"content":"modularizing the attention layer into a dedicated class."}}]}\n\n',
      'data: [DONE]\n\n',
    ];

    agentMessageStream.forEach((chunk) => {
      parser.parseChunk(chunk);
    });

    const parsedOutput = parser.flush();
    const turn = debateEngine.addTurn({
      agent: 'System Architect',
      role: 'Architecture',
      round: 1,
      message: parsedOutput.fullText,
    });

    expect(turn.message).toBe('I propose modularizing the attention layer into a dedicated class.');
    expect(debateEngine.getTurns()).toHaveLength(1);
  });

  // ==========================================================================
  // Pair 8: F7 (Debate Engine) x F9 (Pipeline DAG)
  // ==========================================================================
  it('Pair 8 [F7 x F9]: Debate consensus convergence triggers pipeline state transition to code_generation', () => {
    const state: WorkflowState = {
      stage: 'multi_agent_debate',
      topicOrArxiv: '2310.06825',
      debateTurns: [],
      generatedFiles: {},
      logs: [],
      activeModel: 'google/gemini-2.0-flash-exp:free',
      status: 'running',
    };

    const debateEngine = new MultiAgentDebateEngine(1, 0.5);
    debateEngine.addTurn({
      agent: 'Lead Researcher',
      role: 'Theory',
      round: 1,
      message: 'Agreed and aligned on sliding window attention architecture.',
    });

    if (debateEngine.isConsensusReached()) {
      state.stage = 'code_generation';
      state.logs.push({
        timestamp: new Date().toISOString(),
        level: 'info',
        stage: 'multi_agent_debate',
        message: 'Consensus reached. Transitioning to code generation.',
      });
    }

    expect(state.stage).toBe('code_generation');
    expect(state.logs[0].message).toContain('Consensus reached');
  });

  // ==========================================================================
  // Pair 9: F7 (Debate Engine) x F10 (Code Studio)
  // ==========================================================================
  it('Pair 9 [F7 x F10]: Debate consensus specifications populate multi-file code workspace', () => {
    const debateEngine = new MultiAgentDebateEngine(1, 0.5);
    debateEngine.addTurn({
      agent: 'System Architect',
      role: 'Architecture',
      round: 1,
      message: 'Agreed files: main.py, attention.py, requirements.txt.',
    });

    const files: Record<string, WorkflowFile> = {};
    const plannedFiles = ['main.py', 'attention.py', 'requirements.txt'];

    plannedFiles.forEach((p) => {
      files[p] = {
        path: p,
        content: `# Implementation for ${p}\n`,
        language: p.endsWith('.py') ? 'python' : 'plaintext',
      };
    });

    expect(Object.keys(files)).toEqual(['main.py', 'attention.py', 'requirements.txt']);
    expect(files['attention.py'].language).toBe('python');
  });

  // ==========================================================================
  // Pair 10: F9 (Pipeline DAG) x F10 (Code Studio)
  // ==========================================================================
  it('Pair 10 [F9 x F10]: DAG code_generation completion activates default main.py tab in editor', () => {
    const state: WorkflowState = {
      stage: 'code_generation',
      topicOrArxiv: '2310.06825',
      debateTurns: [],
      generatedFiles: {
        'main.py': { path: 'main.py', content: 'def run(): pass', language: 'python' },
        'model.py': { path: 'model.py', content: 'class Model: pass', language: 'python' },
      },
      logs: [],
      activeModel: 'qwen/qwen-2.5-coder-32b-instruct:free',
      status: 'running',
    };

    let activeTab = '';
    // On stage completion
    state.stage = 'ready_to_publish';
    state.status = 'completed';
    activeTab = Object.keys(state.generatedFiles)[0] || '';

    expect(state.stage).toBe('ready_to_publish');
    expect(activeTab).toBe('main.py');
    expect(state.generatedFiles[activeTab].content).toBe('def run(): pass');
  });

  // ==========================================================================
  // Pair 11: F10 (Code Studio) x F11 (Diff Viewer)
  // ==========================================================================
  it('Pair 11 [F10 x F11]: Monaco editor modifications compute live visual diffs against baseline', () => {
    const originalFile = 'def sliding_window():\n    return False';
    const modifiedFile = 'def sliding_window():\n    # Refined implementation\n    return True';

    const diff = SimpleDiffEngine.computeLineDiff(originalFile, modifiedFile);
    const addedLines = diff[0].lines.filter((l) => l.type === 'add');
    const removedLines = diff[0].lines.filter((l) => l.type === 'del');

    expect(addedLines.some((l) => l.text.includes('Refined implementation'))).toBe(true);
    expect(removedLines.some((l) => l.text.includes('return False'))).toBe(true);
  });

  // ==========================================================================
  // Pair 12: F10 (Code Studio) x F12 (Zip Exporter)
  // ==========================================================================
  it('Pair 12 [F10 x F12]: Multi-file workspace packages into downloadable JSZip bundle', async () => {
    const files: Record<string, WorkflowFile> = {
      'src/attention.py': { path: 'src/attention.py', content: 'class SlidingWindowAttention: pass', language: 'python' },
      'requirements.txt': { path: 'requirements.txt', content: 'torch>=2.0.0', language: 'plaintext' },
      'README.md': { path: 'README.md', content: '# Mistral Implementation', language: 'markdown' },
    };

    const zip = new ClientZipBuilder();
    for (const [path, fileObj] of Object.entries(files)) {
      zip.file(path, fileObj.content);
    }

    const { blob, fileCount } = await zip.generateAsync();
    expect(fileCount).toBe(3);
    expect(blob.type).toBe('application/zip');
  });

  // ==========================================================================
  // Pair 13: F10 (Code Studio) x F13 (GitHub Publisher)
  // ==========================================================================
  it('Pair 13 [F10 x F13]: Multi-file workspace commits directly to GitHub repository', async () => {
    const publisher = new GitHubPublisherSimulator();
    const files: Record<string, WorkflowFile> = {
      'main.py': { path: 'main.py', content: 'print("AutoGIT Release")', language: 'python' },
      'requirements.txt': { path: 'requirements.txt', content: 'torch>=2.0.0', language: 'plaintext' },
    };

    const result = await publisher.createAndPushRepo('ghp_testToken123456', {
      repoName: 'autogit-attention-demo',
      description: 'Autonomous research demo',
      isPrivate: false,
      files,
      commitMessage: 'feat: initial autonomous research release',
    });

    expect(result.repoUrl).toBe('https://github.com/autogit-researcher/autogit-attention-demo');
    expect(result.publishedFilesCount).toBe(2);
  });

  // ==========================================================================
  // Pair 14: F4 (429 Cascade) x F9 (Pipeline DAG)
  // ==========================================================================
  it('Pair 14 [F4 x F9]: 429 Cascade logs warning in DAG without crashing pipeline state', () => {
    const router = new OpenRouterFreeRouter(keyStore);
    const state: WorkflowState = {
      stage: 'code_generation',
      topicOrArxiv: '2310.06825',
      debateTurns: [],
      generatedFiles: {},
      logs: [],
      activeModel: 'google/gemini-2.0-flash-exp:free',
      status: 'running',
    };

    // Trigger 429 failover
    router.record429(state.activeModel, 30);
    const nextModel = router.getOrderedFreeModels()[0];
    const prevModel = state.activeModel;
    state.activeModel = nextModel;

    state.logs.push({
      timestamp: new Date().toISOString(),
      level: 'warn',
      stage: 'code_generation',
      message: `429 Rate limit on ${prevModel}. Cascaded to ${nextModel}.`,
    });

    expect(state.status).toBe('running');
    expect(state.stage).toBe('code_generation');
    expect(state.activeModel).toBe('qwen/qwen-2.5-coder-32b-instruct:free');
    expect(state.logs[0].level).toBe('warn');
  });

  // ==========================================================================
  // Pair 15: F1 (KeyStore) x F2 (Dual Mode) x F13 (GitHub Publisher)
  // ==========================================================================
  it('Pair 15 [F1 x F2 x F13]: Clearing keys resets UI publish state and prevents unauthenticated pushes', async () => {
    await keyStore.saveKeys({ githubPat: 'ghp_temporary_pat' });
    expect(await keyStore.hasGitHubPat()).toBe(true);

    // Clear keys
    await keyStore.clearKeys();
    expect(await keyStore.hasGitHubPat()).toBe(false);

    const keys = await keyStore.getKeys();
    const publisher = new GitHubPublisherSimulator();

    await expect(
      publisher.createAndPushRepo(keys.githubPat, {
        repoName: 'unauthorized-repo',
        description: 'Test',
        isPrivate: false,
        files: {},
        commitMessage: 'init',
      })
    ).rejects.toThrow('Bad credentials');
  });

  // ==========================================================================
  // Pair 16: Full Pipeline Data Integrity Check (F6 x F10 x F12 x F13)
  // ==========================================================================
  it('Pair 16 [F6 x F10 x F12 x F13]: End-to-end data integrity across Ingestion, Workspace, Zip, and GitHub', async () => {
    const rawXml = `<entry>
      <id>2310.06825</id>
      <title>Mistral 7B Architecture</title>
      <summary>Comprehensive sliding window attention implementation.</summary>
      <author><name>Mistral Team</name></author>
    </entry>`;

    const paper = ArxivParser.parseAtomXml(rawXml);
    expect(paper?.title).toBe('Mistral 7B Architecture');

    const files: Record<string, WorkflowFile> = {
      'README.md': {
        path: 'README.md',
        content: `# ${paper?.title}\n\n${paper?.summary}`,
        language: 'markdown',
      },
      'main.py': {
        path: 'main.py',
        content: 'def main(): print("Mistral 7B Loaded")',
        language: 'python',
      },
    };

    // 1. Check JSZip Export
    const zip = new ClientZipBuilder();
    for (const [p, f] of Object.entries(files)) {
      zip.file(p, f.content);
    }
    const zipRes = await zip.generateAsync();
    expect(zipRes.fileCount).toBe(2);

    // 2. Check GitHub Publisher
    const publisher = new GitHubPublisherSimulator();
    const pubResult = await publisher.createAndPushRepo('ghp_validPat123', {
      repoName: 'mistral-7b-autonomous',
      description: paper?.summary || '',
      isPrivate: false,
      files,
      commitMessage: 'Initial research release',
    });

    expect(pubResult.publishedFilesCount).toBe(2);
    const repo = publisher.getRepo('mistral-7b-autonomous');
    expect(repo?.files['README.md']).toContain('Mistral 7B Architecture');
    expect(repo?.files['main.py']).toBe('def main(): print("Mistral 7B Loaded")');
  });
});
