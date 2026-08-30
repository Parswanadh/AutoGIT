/**
 * Test Utilities & Mock Infrastructures for AutoGIT Web Studio E2E Tests
 * Supports Tier 1 (Feature Coverage), Tier 2 (Boundaries), Tier 3 (Pairwise), and Tier 4 (Real-World)
 */

import { vi } from 'vitest';

// ============================================================================
// Types & Contracts (from PROJECT.md)
// ============================================================================

export interface ApiKeys {
  openRouterKey: string;
  githubPat: string;
}

export interface IKeyStore {
  getKeys(): Promise<ApiKeys>;
  saveKeys(keys: Partial<ApiKeys>, persistent?: boolean): Promise<void>;
  clearKeys(): Promise<void>;
  hasOpenRouterKey(): Promise<boolean>;
  hasGitHubPat(): Promise<boolean>;
}

export interface ModelInfo {
  id: string;
  name: string;
  contextLength: number;
  isFree: boolean;
  pricing?: { prompt: string; completion: string };
}

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

export type WorkflowStage =
  | 'idle'
  | 'research_discovery'
  | 'perspectives_generation'
  | 'problem_extraction'
  | 'multi_agent_debate'
  | 'solution_selection'
  | 'architect_specification'
  | 'code_generation'
  | 'code_review'
  | 'code_testing'
  | 'feature_verification'
  | 'self_healing_fix'
  | 'scaffolding'
  | 'ready_to_publish'
  | 'published'
  | 'error';

export interface WorkflowFile {
  path: string;
  content: string;
  language: string;
}

export interface WorkflowState {
  stage: WorkflowStage;
  topicOrArxiv: string;
  paperTitle?: string;
  paperSummary?: string;
  debateTurns: Array<{ agent: string; message: string; round: number }>;
  generatedFiles: Record<string, WorkflowFile>;
  logs: Array<{ timestamp: string; level: 'info' | 'warn' | 'error'; stage: string; message: string }>;
  activeModel: string;
  status: 'idle' | 'running' | 'paused' | 'completed' | 'error';
  errorMessage?: string;
}

export interface PublishOptions {
  repoName: string;
  description: string;
  isPrivate: boolean;
  files: Record<string, WorkflowFile>;
  commitMessage: string;
}

export interface PublishResult {
  repoUrl: string;
  cloneUrl: string;
  commitSha: string;
  publishedFilesCount: number;
}

// ============================================================================
// Free Models Catalog
// ============================================================================

export const FREE_MODELS: ModelInfo[] = [
  { id: 'google/gemini-2.0-flash-exp:free', name: 'Gemini 2.0 Flash Experimental (Free)', contextLength: 1048576, isFree: true },
  { id: 'meta-llama/llama-3.3-70b-instruct:free', name: 'Llama 3.3 70B Instruct (Free)', contextLength: 131072, isFree: true },
  { id: 'qwen/qwen-2.5-coder-32b-instruct:free', name: 'Qwen 2.5 Coder 32B (Free)', contextLength: 32768, isFree: true },
  { id: 'deepseek/deepseek-r1:free', name: 'DeepSeek R1 (Free)', contextLength: 65536, isFree: true },
  { id: 'mistralai/mistral-small-24b-instruct-2501:free', name: 'Mistral Small 24B (Free)', contextLength: 32768, isFree: true },
];

export const PAID_MODELS: string[] = [
  'openai/gpt-4o',
  'anthropic/claude-3-5-sonnet',
  'meta-llama/llama-3.1-405b-instruct',
  'google/gemini-pro-1.5',
];

// ============================================================================
// WebCrypto AES-GCM Client KeyStore Reference Implementation
// ============================================================================

export class ClientKeyStore implements IKeyStore {
  private static readonly STORAGE_KEY = 'autogit_keys_v1';
  private static readonly SALT = 'autogit-salt-v1-client-only';

  private async getEncryptionKey(): Promise<CryptoKey> {
    const enc = new TextEncoder();
    const keyMaterial = await crypto.subtle.importKey(
      'raw',
      enc.encode('autogit-client-session-passphrase-fixed-v1'),
      { name: 'PBKDF2' },
      false,
      ['deriveKey']
    );
    return crypto.subtle.deriveKey(
      {
        name: 'PBKDF2',
        salt: enc.encode(ClientKeyStore.SALT),
        iterations: 100000,
        hash: 'SHA-256',
      },
      keyMaterial,
      { name: 'AES-GCM', length: 256 },
      false,
      ['encrypt', 'decrypt']
    );
  }

  private async encrypt(data: string): Promise<string> {
    const key = await this.getEncryptionKey();
    const iv = crypto.getRandomValues(new Uint8Array(12));
    const encoded = new TextEncoder().encode(data);
    const ciphertext = await crypto.subtle.encrypt(
      { name: 'AES-GCM', iv },
      key,
      encoded
    );
    const combined = new Uint8Array(iv.length + ciphertext.byteLength);
    combined.set(iv, 0);
    combined.set(new Uint8Array(ciphertext), iv.length);
    return btoa(String.fromCharCode(...combined));
  }

  private async decrypt(ciphertextB64: string): Promise<string> {
    try {
      const binary = atob(ciphertextB64);
      const bytes = new Uint8Array(binary.length);
      for (let i = 0; i < binary.length; i++) {
        bytes[i] = binary.charCodeAt(i);
      }
      if (bytes.length < 13) {
        throw new Error('Ciphertext too short');
      }
      const iv = bytes.slice(0, 12);
      const data = bytes.slice(12);
      const key = await this.getEncryptionKey();
      const decrypted = await crypto.subtle.decrypt(
        { name: 'AES-GCM', iv },
        key,
        data
      );
      return new TextDecoder().decode(decrypted);
    } catch {
      throw new Error('Decryption failed: corrupted or invalid ciphertext');
    }
  }

  async getKeys(): Promise<ApiKeys> {
    const raw =
      (typeof sessionStorage !== 'undefined' ? sessionStorage.getItem(ClientKeyStore.STORAGE_KEY) : null) ||
      (typeof localStorage !== 'undefined' ? localStorage.getItem(ClientKeyStore.STORAGE_KEY) : null);
    if (!raw) {
      return { openRouterKey: '', githubPat: '' };
    }
    try {
      const decryptedJson = await this.decrypt(raw);
      const parsed = JSON.parse(decryptedJson);
      return {
        openRouterKey: parsed.openRouterKey || '',
        githubPat: parsed.githubPat || '',
      };
    } catch {
      return { openRouterKey: '', githubPat: '' };
    }
  }

  private saveQueue: Promise<void> = Promise.resolve();

  async saveKeys(keys: Partial<ApiKeys>, persistent: boolean = false): Promise<void> {
    this.saveQueue = this.saveQueue.then(async () => {
      const current = await this.getKeys();
      const updated: ApiKeys = {
        openRouterKey: keys.openRouterKey !== undefined ? keys.openRouterKey.trim() : current.openRouterKey,
        githubPat: keys.githubPat !== undefined ? keys.githubPat.trim() : current.githubPat,
      };
      const encrypted = await this.encrypt(JSON.stringify(updated));
      if (persistent) {
        if (typeof localStorage !== 'undefined') localStorage.setItem(ClientKeyStore.STORAGE_KEY, encrypted);
        if (typeof sessionStorage !== 'undefined') sessionStorage.removeItem(ClientKeyStore.STORAGE_KEY);
      } else {
        if (typeof sessionStorage !== 'undefined') sessionStorage.setItem(ClientKeyStore.STORAGE_KEY, encrypted);
        if (typeof localStorage !== 'undefined') localStorage.removeItem(ClientKeyStore.STORAGE_KEY);
      }
    });
    return this.saveQueue;
  }

  async clearKeys(): Promise<void> {
    if (typeof sessionStorage !== 'undefined') sessionStorage.removeItem(ClientKeyStore.STORAGE_KEY);
    if (typeof localStorage !== 'undefined') localStorage.removeItem(ClientKeyStore.STORAGE_KEY);
  }

  async hasOpenRouterKey(): Promise<boolean> {
    const keys = await this.getKeys();
    return Boolean(keys.openRouterKey && keys.openRouterKey.length > 0);
  }

  async hasGitHubPat(): Promise<boolean> {
    const keys = await this.getKeys();
    return Boolean(keys.githubPat && keys.githubPat.length > 0);
  }
}

// ============================================================================
// Guardrails Validator
// ============================================================================

export class ModelGuardrails {
  static isFreeModel(modelId: string): boolean {
    if (!modelId || typeof modelId !== 'string') return false;
    return modelId.trim().endsWith(':free');
  }

  static validateModel(modelId: string): { valid: boolean; error?: string } {
    if (!modelId) {
      return { valid: false, error: 'Model ID cannot be empty.' };
    }
    if (!this.isFreeModel(modelId)) {
      return {
        valid: false,
        error: `Model '${modelId}' is not an authorized OpenRouter free-tier model. Only ':free' models are permitted.`,
      };
    }
    return { valid: true };
  }

  static isLocalhostOrOllamaUrl(url: string): boolean {
    if (!url || typeof url !== 'string') return false;
    const lower = url.toLowerCase();
    const blocked = [
      'localhost',
      '127.0.0.1',
      '0.0.0.0',
      '[::1]',
      ':11434', // default Ollama port
      ':8000',
      ':8080',
      ':5000',
      'ollama',
    ];
    return blocked.some((b) => lower.includes(b));
  }

  static validateEndpoint(url: string): { valid: boolean; error?: string } {
    if (this.isLocalhostOrOllamaUrl(url)) {
      return {
        valid: false,
        error: `Local LLM and localhost connections (${url}) are strictly prohibited. AutoGIT is 100% BYOK client-side.`,
      };
    }
    if (!url.startsWith('https://openrouter.ai/') && !url.startsWith('https://api.github.com/') && !url.startsWith('https://export.arxiv.org/')) {
      return {
        valid: false,
        error: `Host not in authorized whitelist: ${url}`,
      };
    }
    return { valid: true };
  }

  static scrubKey(text: string, keys: string[]): string {
    let result = text;
    for (const key of keys) {
      if (key && key.length > 4) {
        result = result.split(key).join('[REDACTED_API_KEY]');
      }
    }
    return result;
  }
}

// ============================================================================
// OpenRouter Free Router & 429 Cascade Engine
// ============================================================================

export interface ModelHealth {
  modelId: string;
  errorCount: number;
  last429Timestamp: number;
  cooldownUntil: number;
  isAvailable: boolean;
}

export class OpenRouterFreeRouter {
  private healthMap: Map<string, ModelHealth> = new Map();
  private defaultModelCascade: string[] = [
    'google/gemini-2.0-flash-exp:free',
    'qwen/qwen-2.5-coder-32b-instruct:free',
    'meta-llama/llama-3.3-70b-instruct:free',
    'deepseek/deepseek-r1:free',
    'mistralai/mistral-small-24b-instruct-2501:free',
  ];

  constructor(private keyStore: IKeyStore) {
    this.defaultModelCascade.forEach((id) => {
      this.healthMap.set(id, {
        modelId: id,
        errorCount: 0,
        last429Timestamp: 0,
        cooldownUntil: 0,
        isAvailable: true,
      });
    });
  }

  getOrderedFreeModels(preferred?: string): string[] {
    const now = Date.now();
    const models = [...this.defaultModelCascade];
    if (preferred && models.includes(preferred)) {
      models.splice(models.indexOf(preferred), 1);
      models.unshift(preferred);
    }
    // Filter out models currently in cooldown
    return models.filter((m) => {
      const health = this.healthMap.get(m);
      if (!health) return true;
      return health.cooldownUntil <= now;
    });
  }

  record429(modelId: string, retryAfterSeconds: number = 30): void {
    const now = Date.now();
    const health = this.healthMap.get(modelId) || {
      modelId,
      errorCount: 0,
      last429Timestamp: now,
      cooldownUntil: 0,
      isAvailable: true,
    };
    health.errorCount += 1;
    health.last429Timestamp = now;
    const exponentialFactor = Math.min(Math.pow(2, health.errorCount - 1), 8);
    const cooldownMs = (retryAfterSeconds * 1000) * exponentialFactor;
    health.cooldownUntil = now + cooldownMs;
    health.isAvailable = false;
    this.healthMap.set(modelId, health);
  }

  recordSuccess(modelId: string): void {
    const health = this.healthMap.get(modelId);
    if (health) {
      health.errorCount = 0;
      health.isAvailable = true;
      health.cooldownUntil = 0;
    }
  }

  getModelHealth(modelId: string): ModelHealth | undefined {
    return this.healthMap.get(modelId);
  }

  resetHealth(): void {
    this.healthMap.clear();
    this.defaultModelCascade.forEach((id) => {
      this.healthMap.set(id, {
        modelId: id,
        errorCount: 0,
        last429Timestamp: 0,
        cooldownUntil: 0,
        isAvailable: true,
      });
    });
  }
}

// ============================================================================
// SSE Stream Parser & <think> Extractor
// ============================================================================

export class SSEStreamParser {
  private buffer: string = '';
  private fullText: string = '';
  private reasoningText: string = '';
  private inThinkTag: boolean = false;

  parseChunk(
    chunk: string,
    callbacks?: StreamCallbacks
  ): { fullText: string; reasoningText: string } {
    this.buffer += chunk;
    const lines = this.buffer.split('\n');
    this.buffer = lines.pop() || ''; // Keep incomplete line in buffer

    for (const line of lines) {
      const trimmed = line.trim();
      if (!trimmed || trimmed.startsWith(':')) {
        // Keepalive / ping comment - ignore
        continue;
      }
      if (trimmed === 'data: [DONE]') {
        callbacks?.onComplete?.(this.fullText, this.reasoningText);
        continue;
      }
      if (trimmed.startsWith('data: ')) {
        const jsonStr = trimmed.slice(6);
        try {
          const parsed = JSON.parse(jsonStr);
          const delta = parsed.choices?.[0]?.delta;
          if (!delta) continue;

          // Native reasoning field (DeepSeek R1 style)
          if (delta.reasoning) {
            this.reasoningText += delta.reasoning;
            callbacks?.onReasoning?.(delta.reasoning);
          }

          // Content field
          if (delta.content) {
            const content = delta.content;
            // Detect <think> tags in content
            if (content.includes('<think>')) {
              this.inThinkTag = true;
            }
            if (this.inThinkTag) {
              if (content.includes('</think>')) {
                this.inThinkTag = false;
                const parts = content.split('</think>');
                const thoughtPart = parts[0].replace('<think>', '');
                const textPart = parts[1] || '';
                this.reasoningText += thoughtPart;
                callbacks?.onReasoning?.(thoughtPart);
                if (textPart) {
                  this.fullText += textPart;
                  callbacks?.onToken?.(textPart);
                }
              } else {
                const thought = content.replace('<think>', '');
                this.reasoningText += thought;
                callbacks?.onReasoning?.(thought);
              }
            } else {
              this.fullText += content;
              callbacks?.onToken?.(content);
            }
          }
        } catch {
          // Incomplete or non-JSON data line
        }
      }
    }
    return { fullText: this.fullText, reasoningText: this.reasoningText };
  }

  flush(callbacks?: StreamCallbacks): { fullText: string; reasoningText: string } {
    if (this.buffer.length > 0) {
      this.parseChunk('\n', callbacks);
    }
    callbacks?.onComplete?.(this.fullText, this.reasoningText);
    return { fullText: this.fullText, reasoningText: this.reasoningText };
  }
}

// ============================================================================
// arXiv Ingestion & XML Parser
// ============================================================================

export interface ArxivPaperMetadata {
  id: string;
  title: string;
  summary: string;
  authors: string[];
  published: string;
  pdfUrl?: string;
  categories: string[];
}

export class ArxivParser {
  static extractArxivId(input: string): string | null {
    if (!input) return null;
    const trimmed = input.trim();
    // Patterns: 2310.06825, 2310.06825v1, arxiv:2310.06825, https://arxiv.org/abs/2310.06825
    const match = trimmed.match(/(?:arxiv\.org\/(?:abs|pdf)\/|arxiv:)?([0-9]{4}\.[0-9]{4,5}(?:v[0-9]+)?)/i);
    return match ? match[1] : null;
  }

  static parseAtomXml(xmlString: string): ArxivPaperMetadata | null {
    if (!xmlString || !xmlString.includes('<entry>')) {
      return null;
    }
    try {
      const getTag = (xml: string, tag: string): string => {
        const m = xml.match(new RegExp(`<${tag}[^>]*>([\\s\\S]*?)<\\/${tag}>`, 'i'));
        return m ? m[1].trim() : '';
      };

      const entryMatch = xmlString.match(/<entry>([\s\S]*?)<\/entry>/i);
      if (!entryMatch) return null;
      const entryXml = entryMatch[1];

      const id = getTag(entryXml, 'id').replace(/http:\/\/arxiv\.org\/abs\//i, '');
      const rawTitle = getTag(entryXml, 'title').replace(/\s+/g, ' ');
      const rawSummary = getTag(entryXml, 'summary').replace(/\s+/g, ' ');

      // Authors
      const authorMatches = Array.from(entryXml.matchAll(/<author>[\s\S]*?<name>([\s\S]*?)<\/name>[\s\S]*?<\/author>/gi));
      const authors = authorMatches.map((m) => m[1].trim());

      const published = getTag(entryXml, 'published');
      const categories: string[] = [];
      const catMatches = Array.from(entryXml.matchAll(/<category[^>]*term="([^"]+)"/gi));
      catMatches.forEach((m) => categories.push(m[1]));

      return {
        id,
        title: rawTitle,
        summary: rawSummary,
        authors: authors.length > 0 ? authors : ['Unknown Author'],
        published,
        categories,
        pdfUrl: `https://arxiv.org/pdf/${id}.pdf`,
      };
    } catch {
      return null;
    }
  }
}

// ============================================================================
// Multi-Agent Debate Engine
// ============================================================================

export interface DebateTurn {
  agent: string;
  role: string;
  round: number;
  message: string;
  timestamp: number;
}

export const DEBATE_PERSONAS = [
  { name: 'Lead Researcher', focus: 'Theoretical foundation, arXiv paper fidelity, and core mathematical algorithms' },
  { name: 'System Architect', focus: 'Modular system design, clean interfaces, separation of concerns, and scalability' },
  { name: 'ML Theorist', focus: 'Model architecture, tensor shapes, gradient computation, and loss formulations' },
  { name: 'Systems Engineer', focus: 'Performance, memory efficiency, asynchronous execution, and zero-dependency runtime' },
  { name: 'Applied Scientist', focus: 'Real-world data ingestion, evaluation metrics, and end-to-end reproducibility' },
  { name: 'Code Reviewer & QA', focus: 'Type safety, unit test coverage, edge cases, and documentation' },
];

export class MultiAgentDebateEngine {
  private turns: DebateTurn[] = [];

  constructor(public maxRounds: number = 3, public consensusThreshold: number = 0.85) {}

  addTurn(turn: Omit<DebateTurn, 'timestamp'>): DebateTurn {
    const fullTurn: DebateTurn = { ...turn, timestamp: Date.now() };
    this.turns.push(fullTurn);
    return fullTurn;
  }

  getTurns(): DebateTurn[] {
    return [...this.turns];
  }

  calculateConsensusScore(): number {
    if (this.turns.length === 0) return 0;
    // Score based on rounds completed and turn sentiment agreement
    const roundCount = new Set(this.turns.map((t) => t.round)).size;
    const agreeKeywords = ['agree', 'consensus', 'solid', 'aligned', 'approved', 'converged', 'optimal'];
    let agreementMatches = 0;
    for (const turn of this.turns) {
      const lower = turn.message.toLowerCase();
      if (agreeKeywords.some((k) => lower.includes(k))) {
        agreementMatches++;
      }
    }
    const ratio = agreementMatches / Math.max(this.turns.length, 1);
    const roundBoost = Math.min(roundCount / this.maxRounds, 1) * 0.5;
    return Math.min(roundBoost + ratio * 0.5, 1.0);
  }

  isConsensusReached(): boolean {
    return this.calculateConsensusScore() >= this.consensusThreshold || (new Set(this.turns.map(t => t.round)).size >= this.maxRounds);
  }

  generateSynthesis(): string {
    const lastRound = Math.max(...this.turns.map((t) => t.round), 1);
    const roundTurns = this.turns.filter((t) => t.round === lastRound);
    return `### Multi-Agent Debate Synthesis (Round ${lastRound})
- Consensus Score: ${(this.calculateConsensusScore() * 100).toFixed(1)}%
- Key Architectural Decision: Clean modular Python implementation adhering to arXiv specification.
- Personas Participated: ${roundTurns.map((t) => t.agent).join(', ')}.`;
  }
}

// ============================================================================
// Diff Engine
// ============================================================================

export interface DiffHunk {
  oldStart: number;
  oldLines: number;
  newStart: number;
  newLines: number;
  lines: Array<{ type: 'add' | 'del' | 'same'; text: string }>;
}

export class SimpleDiffEngine {
  static computeLineDiff(original: string, modified: string): DiffHunk[] {
    const origLines = original.split('\n');
    const modLines = modified.split('\n');

    const lines: Array<{ type: 'add' | 'del' | 'same'; text: string }> = [];
    const maxLen = Math.max(origLines.length, modLines.length);

    for (let i = 0; i < maxLen; i++) {
      const o = origLines[i];
      const m = modLines[i];

      if (o === m && o !== undefined) {
        lines.push({ type: 'same', text: o });
      } else {
        if (o !== undefined) lines.push({ type: 'del', text: o });
        if (m !== undefined) lines.push({ type: 'add', text: m });
      }
    }

    return [
      {
        oldStart: 1,
        oldLines: origLines.length,
        newStart: 1,
        newLines: modLines.length,
        lines,
      },
    ];
  }
}

// ============================================================================
// Client-Side JSZip Mock & Builder
// ============================================================================

export class ClientZipBuilder {
  private files: Map<string, string | Uint8Array> = new Map();

  file(path: string, content: string | Uint8Array): this {
    this.files.set(path, content);
    return this;
  }

  getFiles(): Record<string, string | Uint8Array> {
    const result: Record<string, string | Uint8Array> = {};
    this.files.forEach((v, k) => (result[k] = v));
    return result;
  }

  async generateAsync(): Promise<{ blob: Blob; uint8Array: Uint8Array; fileCount: number }> {
    // Generate simple synthetic zip container for client-side download verification
    const enc = new TextEncoder();
    let totalBytes = 0;
    const chunks: Uint8Array[] = [];

    this.files.forEach((content, path) => {
      const header = enc.encode(`PK\x03\x04FILE:${path}\n`);
      const body = typeof content === 'string' ? enc.encode(content) : content;
      chunks.push(header);
      chunks.push(body);
      totalBytes += header.length + body.length;
    });

    const combined = new Uint8Array(totalBytes);
    let offset = 0;
    for (const chunk of chunks) {
      combined.set(chunk, offset);
      offset += chunk.length;
    }

    const blob = new Blob([combined], { type: 'application/zip' });
    return { blob, uint8Array: combined, fileCount: this.files.size };
  }
}

// ============================================================================
// GitHub Publisher Mock & Git Data API Simulator
// ============================================================================

export class GitHubPublisherSimulator {
  private repos: Map<string, { description: string; isPrivate: boolean; files: Record<string, string> }> = new Map();

  async verifyToken(pat: string): Promise<{ username: string; scopes: string[] }> {
    if (!pat || !pat.startsWith('ghp_') && !pat.startsWith('github_pat_')) {
      throw new Error('Bad credentials: PAT must start with ghp_ or github_pat_');
    }
    return {
      username: 'autogit-researcher',
      scopes: ['repo', 'public_repo', 'workflow'],
    };
  }

  async createAndPushRepo(pat: string, options: PublishOptions): Promise<PublishResult> {
    await this.verifyToken(pat);
    if (!options.repoName || options.repoName.length < 2) {
      throw new Error('Invalid repository name.');
    }
    if (this.repos.has(options.repoName)) {
      throw new Error(`Repository '${options.repoName}' already exists.`);
    }

    const storedFiles: Record<string, string> = {};
    for (const [path, fileObj] of Object.entries(options.files)) {
      storedFiles[path] = fileObj.content;
    }

    this.repos.set(options.repoName, {
      description: options.description,
      isPrivate: options.isPrivate,
      files: storedFiles,
    });

    const fakeSha = Array.from({ length: 40 }, () => Math.floor(Math.random() * 16).toString(16)).join('');

    return {
      repoUrl: `https://github.com/autogit-researcher/${options.repoName}`,
      cloneUrl: `https://github.com/autogit-researcher/${options.repoName}.git`,
      commitSha: fakeSha,
      publishedFilesCount: Object.keys(options.files).length,
    };
  }

  getRepo(name: string) {
    return this.repos.get(name);
  }
}
