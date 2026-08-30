# Project: AutoGIT BYOK Client-Side Web Studio

## Architecture

AutoGIT Web Studio is a pure client-side, zero-backend, Bring-Your-Own-Key (BYOK) web application located in `website/`. It executes autonomous research-to-GitHub workflows directly in the browser using OpenRouter free-tier LLMs, Pyodide in-browser Python WASM / AST validation, and the GitHub REST API.

```
┌────────────────────────────────────────────────────────────────────────────┐
│                             BROWSER RUNTIME                                │
│                                                                            │
│  ┌─────────────────────────┐  ┌──────────────────────────────────────────┐ │
│  │   UI & Studio Studio    │  │           Key & Session Store            │ │
│  │  - StudioHeader         │  │  - AES-GCM / WebCrypto                   │ │
│  │  - InputConfigPanel     │  │  - localStorage / sessionStorage        │ │
│  │  - PipelineVisualizer   │  │  - OpenRouter API Key                    │ │
│  │  - DebateStreamViewer   │  │  - GitHub Personal Access Token (PAT)   │ │
│  │  - CodeWorkspace/Monaco │  └──────────────────────────────────────────┘ │
│  │  - DiffViewer           │                                               │
│  │  - GitHubPublishModal   │  ┌──────────────────────────────────────────┐ │
│  │  - ZipExportModal       │  │        Workflow Execution Engine         │ │
│  └────────────┬────────────┘  │  - 19-Stage AutoGIT State Machine        │ │
│               │               │  - Research / arXiv Parser               │ │
│               ▼               │  - 6-Persona Multi-Agent Debate          │ │
│  ┌─────────────────────────┐  │  - Code Gen & AST Validator              │ │
│  │ OpenRouter Free Router  │  │  - Self-Healing Error Reflection Loops   │ │
│  │ - :free Model Cascades  │  └────────────────────┬─────────────────────┘ │
│  │ - 429 Exponential Jitter│                       │                       │
│  │ - SSE Stream Parser     │                       │                       │
│  │ - Localhost/Paid Blocker│                       │                       │
│  └────────────┬────────────┘                       │                       │
└───────────────┼────────────────────────────────────┼───────────────────────┘
                │ Direct REST / SSE                  │ Direct Git Data API
                ▼                                    ▼
      ┌──────────────────┐                 ┌──────────────────┐
      │  OpenRouter API  │                 │  GitHub REST API │
      │  (:free models)  │                 │  (repos / trees) │
      └──────────────────┘                 └──────────────────┘
```

---

## Feature Inventory

| # | Feature | Description | Milestone | Source |
|---|---------|-------------|-----------|--------|
| F1 | BYOK Key Management & Security | Client-side secure storage (WebCrypto AES-GCM, localStorage/sessionStorage) for OpenRouter API key and GitHub PAT with zero server storage. | M1 | R1 |
| F2 | Client-Side Studio Framework & Dual-Mode UI | Interactive studio workspace layout with mode switching (Studio vs Marketing Showcase), responsive drawer, tabs, and theme support. | M1 | R1 |
| F3 | OpenRouter Free-Tier Dynamic Router | Client-side HTTP/SSE client targeting OpenRouter `:free` models with automatic capability scoring. | M2 | R2 |
| F4 | 429 Rate-Limit Exponential Backoff & Cascade | In-memory health cache, automatic fallback chain across free models on 429/503 errors. | M2 | R2 |
| F5 | Strict Paid Model & Local LLM Guardrails | Hard client-side validator rejecting any non-`:free` model ID and blocking any `localhost` / `127.0.0.1` / Ollama URLs. | M2 | R2 |
| F6 | Research Ingestion & arXiv Parser | Direct browser fetching of arXiv IDs/URLs/topics with Atom XML parsing and metadata extraction. | M3 | R3 |
| F7 | Multi-Agent Debate & Consensus Engine | 6 expert personas (Researcher, Architect, ML Theorist, Systems Engineer, Applied Scientist, Code Reviewer) with turn-by-turn debate and consensus scoring. | M3 | R3 |
| F8 | Real-Time SSE Stream Parser & `<think>` Visualizer | Parsing OpenRouter SSE chunks with keepalive handling and expandable Chain-of-Thought `<think>` blocks for reasoning models. | M3 | R3 |
| F9 | Interactive Pipeline DAG Visualizer | 15+ node reactive state graph stepper showing live status (pending, running, complete, failed, skipped). | M3 | R3 |
| F10 | Multi-File Code Studio & Monaco Editor | Code editor with syntax highlighting, multi-tab file explorer, file creation, editing, and preview. | M4 | R3 |
| F11 | Side-by-Side Diff Viewer | Visual diff component comparing original paper baseline / initial code with generated multi-round improvements. | M4 | R3 |
| F12 | Client-Side JSZip Package Exporter | Instant client-side generation and download of complete repository `.zip` archives with README, requirements.txt, tests, and LICENSE. | M4 | R3 |
| F13 | Direct GitHub Repository Publisher | Direct browser-to-GitHub repo creation and atomic multi-file commit tree push via Git Data API using user PAT. | M4 | R3 |
| F14 | Vitest Unit & Integration Test Suite | Comprehensive client-side test suite covering key storage, openrouter router, workflow engine, github publisher, and UI components. | M5 | R4 |
| F15 | Zero-Error Production Build & Vercel Deployment | Clean dependency management, Next.js static / SPA build with 0 errors, and Vercel CLI deployment configuration. | M5 | R4 |
| F16 | E2E Test Suite Pass (Tiers 1-4) | Passing 100% of requirement-driven E2E tests for the full research-to-GitHub workflow. | Final M6 (Phase 1) | R4 |
| F17 | Adversarial Coverage Hardening (Tier 5) | White-box adversarial testing, edge-case stress testing, and boundary hardening. | Final M6 (Phase 2) | R4 |

---

## Milestones

| # | Name | Scope | Dependencies | Status |
|---|------|-------|-------------|--------|
| M1 | Client-Side Studio Architecture & Key Management (R1) | Pure client-side SPA shell in `website/`, WebCrypto key store, StudioHeader, Settings modal, DualMode switcher, status bar. | none | DONE |
| M2 | Strict OpenRouter Free-Tier Router & Guardrails (R2) | OpenRouter client, `:free` model discovery, SSE streaming parser with keepalive, 429 exponential backoff, fallback cascade, local LLM blocker. | M1 | DONE |
| M3 | Autonomous Workflow Engine & Live Streaming UI (R3) | arXiv ingestion, 6-persona multi-agent debate, code generation engine, AST validator, self-healing reflection, reactive DAG visualizer, stream logs. | M2 | DONE |
| M4 | Code Workspace, Diff Viewer, Zip Exporter & GitHub Publisher (R3) | Multi-file Monaco/CodeMirror editor, side-by-side diff viewer, JSZip package builder, GitHub REST Git Data API publisher modal. | M3 | DONE |
| M5 | Test Suite, Verification & Vercel CLI Deployment (R4) | Unit & integration tests in `website/tests/`, Next.js build verification (`npm run build`), Vercel CLI deployment setup (`vercel --prod`). | M4 | PLANNED |
| M6 | Final Milestone: E2E Test Suite Pass & Coverage Hardening | Phase 1: Pass 100% of E2E tests (Tiers 1-4 published by E2E track). Phase 2: Adversarial Coverage Hardening (Tier 5). | M5, TEST_READY | PLANNED |

---

## Interface Contracts

### 1. KeyStore (`website/lib/storage/keyStore.ts`)
```ts
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
```

### 2. OpenRouter Client (`website/lib/openrouter/client.ts`)
```ts
export interface ModelInfo {
  id: string;
  name: string;
  contextLength: number;
  isFree: boolean;
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

export interface IOpenRouterClient {
  getAvailableFreeModels(): Promise<ModelInfo[]>;
  chatStream(messages: ChatMessage[], preferredModel?: string, callbacks?: StreamCallbacks): Promise<string>;
  chat(messages: ChatMessage[], preferredModel?: string): Promise<string>;
}
```

### 3. Workflow Engine (`website/lib/workflow/engine.ts`)
```ts
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
```

### 4. GitHub Publisher (`website/lib/github/publisher.ts`)
```ts
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

export interface IGitHubPublisher {
  verifyToken(pat: string): Promise<{ username: string; scopes: string[] }>;
  createAndPushRepo(pat: string, options: PublishOptions): Promise<PublishResult>;
}
```

---

## Code Layout

```
website/
├── app/
│   ├── layout.tsx                # Root layout with fonts, metadata, theme provider
│   ├── page.tsx                  # Dual-mode landing / studio controller
│   └── globals.css               # Tailwind CSS & custom styling
├── components/
│   ├── studio/
│   │   ├── StudioHeader.tsx      # Top bar with model status, BYOK indicators, actions
│   │   ├── ApiKeyModal.tsx       # Secure BYOK modal for OpenRouter key & GitHub PAT
│   │   ├── InputConfigPanel.tsx  # arXiv / topic input & workflow configuration
│   │   ├── PipelineVisualizer.tsx# Live 15+ node DAG stepper
│   │   ├── DebateStreamViewer.tsx# Multi-agent debate visualizer with thinking collapsible
│   │   ├── CodeWorkspace.tsx     # Monaco editor tabs and file tree
│   │   ├── DiffViewer.tsx        # Side-by-side diff comparison
│   │   ├── GitHubPublishModal.tsx# Direct GitHub repo creation & commit modal
│   │   ├── ZipExportModal.tsx    # JSZip download package modal
│   │   └── TerminalLogViewer.tsx # Real-time streaming execution log console
│   └── ui/                       # Reusable buttons, dialogs, badges, inputs
├── lib/
│   ├── storage/
│   │   └── keyStore.ts           # WebCrypto AES-GCM secure key storage
│   ├── openrouter/
│   │   ├── client.ts             # Free-tier router, streaming, 429 backoff
│   │   ├── models.ts             # Active :free models catalog & ranking
│   │   └── guardrails.ts         # Strict paid & local LLM blocking validator
│   ├── research/
│   │   └── arxivParser.ts        # arXiv API & Atom XML parser
│   ├── workflow/
│   │   ├── engine.ts             # Autonomous 19-stage state machine
│   │   ├── prompts.ts            # Domain expert personas & prompt templates
│   │   └── astValidator.ts       # Client-side syntax & AST validator
│   ├── github/
│   │   └── publisher.ts          # Direct browser Git Data API publisher
│   └── export/
│       └── zipExporter.ts        # JSZip repo archive builder
├── tests/
│   ├── keyStore.test.ts          # Key security and encryption tests
│   ├── openrouter.test.ts        # Free-tier routing and 429 failover tests
│   ├── workflow.test.ts          # State machine and streaming tests
│   ├── github.test.ts            # Git Data API tree creation tests
│   └── components.test.tsx       # Studio UI interaction tests
├── vitest.config.ts              # Vitest test configuration
├── next.config.mjs               # Next.js configuration
├── tailwind.config.ts            # Tailwind styling config
└── package.json                  # Dependencies, test scripts, and build scripts
```
