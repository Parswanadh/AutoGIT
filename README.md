# 🚀 AutoGIT — Autonomous BYOK Research-to-GitHub Web Studio

[![Next.js 14](https://img.shields.io/badge/Next.js-14.2.15-black?logo=next.js)](https://nextjs.org/)
[![TypeScript](https://img.shields.io/badge/TypeScript-5.4-blue?logo=typescript)](https://www.typescriptlang.org/)
[![Tailwind CSS](https://img.shields.io/badge/Tailwind-3.4-38bdf8?logo=tailwind-css)](https://tailwindcss.com/)
[![Vitest](https://img.shields.io/badge/Vitest-Tested%20(630%2B%20Tests)-6e9f18?logo=vitest)](https://vitest.dev/)
[![OpenRouter](https://img.shields.io/badge/OpenRouter-100%25%20Free--Tier%20Routing-6366f1)](https://openrouter.ai/)
[![Vercel](https://img.shields.io/badge/Deploy-Vercel%20Ready-black?logo=vercel)](https://vercel.com/)
[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](LICENSE)

> **AutoGIT** is a pure client-side, zero-backend **Bring-Your-Own-Key (BYOK)** Web Application. It autonomously transforms arXiv papers, research URLs, or conceptual prompts into production-grade, tested repositories published directly to GitHub — executing entirely within your browser using OpenRouter `:free` LLMs.

---

## 🏛️ System Architecture

AutoGIT eliminates backend server vulnerabilities by running all orchestration, LLM streaming, AST validation, and GitHub API interactions directly in the client browser runtime.

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
│  │  - TerminalLogViewer    │  │  - 19-Stage AutoGIT State Machine        │ │
│  └────────────┬────────────┘  │  - Research / arXiv Ingestion            │ │
│               │               │  - 6-Persona Multi-Agent Debate          │ │
│               ▼               │  - Code Gen & AST Validator              │ │
│  ┌─────────────────────────┐  │  - Self-Healing Error Reflection Loops   │ │
│  │ OpenRouter Free Router  │  └────────────────────┬─────────────────────┘ │
│  │ - :free Model Cascades  │                       │                       │
│  │ - 429 Exponential Jitter│                       │                       │
│  │ - SSE Stream Parser     │                       │                       │
│  │ - Localhost/Paid Blocker│                       │                       │
│  └────────────┬────────────┘                       │                       │
└───────────────┼────────────────────────────────────┼───────────────────────┘
                │ Direct Browser REST / SSE          │ Direct Git Data API
                ▼                                    ▼
      ┌──────────────────┐                 ┌──────────────────┐
      │  OpenRouter API  │                 │  GitHub REST API │
      │  (:free models)  │                 │  (repos / trees) │
      └──────────────────┘                 └──────────────────┘
```

---

## ✨ Key Features

- **🔐 Pure Client-Side BYOK Security**: OpenRouter API keys and GitHub PATs are encrypted with WebCrypto AES-GCM in browser storage (`sessionStorage` or `localStorage`). Zero credentials ever touch a third-party server.
- **⚡ Strict OpenRouter Free-Tier Dynamic Router**: Automatically routes through verified OpenRouter `:free` models with capability ranking, intelligent 429 rate-limit exponential backoff, and seamless fallback cascades.
- **🛡️ Paid Model & Localhost Guardrails**: Hard client-side guards block paid models and prevent accidental calls to `localhost`, `127.0.0.1`, or local Ollama instances.
- **🧠 6-Persona Multi-Agent Debate**: Orchestrates consensus between 6 specialized AI roles:
  1. *Lead AI Researcher* — Problem discovery & mathematical formulation.
  2. *Systems Architect* — Module hierarchy & interface design.
  3. *ML Theorist* — Loss formulation, tensor shapes & optimization.
  4. *Applied Scientist* — Data pipelines & baseline benchmarks.
  5. *Senior Code Reviewer* — Typing, clean code & linting.
  6. *QA Automation Engineer* — Pytest suites & edge case coverage.
- **🔄 19-Stage Autonomous State Machine**: Complete pipeline tracking from discovery, multi-turn debate, solution specification, code generation, client-side AST syntax validation, self-healing reflection, to repo scaffolding.
- **💻 Monaco Code Workspace & Diff Viewer**: Full-featured in-browser code editor with syntax highlighting, multi-tab file navigation, and side-by-side diff comparison between iterations.
- **📦 Dual Export Options**:
  - **Direct GitHub Publishing**: Creates GitHub repositories and commits complete multi-file trees in a single atomic commit using the GitHub Git Data API.
  - **Client-Side JSZip Export**: Instant browser compilation and download of `.zip` archives containing all code, README, tests, and configuration files.

---

## 🔑 BYOK Setup Guides

### 1. OpenRouter Free API Key

AutoGIT exclusively utilizes OpenRouter's free-tier models (`:free`).

1. Create an account at [openrouter.ai](https://openrouter.ai/).
2. Navigate to **Keys** at [openrouter.ai/keys](https://openrouter.ai/keys).
3. Click **Create Key**, give it a name (e.g., `AutoGIT-Web`), and copy the key (`sk-or-v1-...`).
4. Click the **API Keys** button in the AutoGIT Studio header and enter your key.

#### Supported Free-Tier Models:
| Model ID | Context | Recommended Task |
|---|---|---|
| `google/gemini-2.0-flash-exp:free` | 1M tokens | Fast research, discovery, and debate |
| `meta-llama/llama-3.3-70b-instruct:free` | 128k tokens | Architectural design & code review |
| `qwen/qwen-2.5-coder-32b-instruct:free` | 32k tokens | Complex PyTorch code generation |
| `deepseek/deepseek-r1:free` | 64k tokens | Deep reasoning & `<think>` CoT analysis |
| `mistralai/mistral-small-24b-instruct-2501:free` | 32k tokens | Fallback & scaffolding |

---

### 2. GitHub Personal Access Token (PAT)

A GitHub PAT allows AutoGIT to create new repositories and push code directly under your GitHub account.

1. Go to [github.com/settings/tokens](https://github.com/settings/tokens).
2. Choose **Generate new token (classic)** or **Fine-grained token**.
3. Set the required permissions:
   - **Classic Token**: Select the `repo` scope (or `public_repo` if you only publish public repositories).
   - **Fine-grained Token**: Select Repository Permissions -> **Administration (Read & Write)** and **Contents (Read & Write)**.
4. Click **Generate Token** and copy the value (`ghp_...` or `github_pat_...`).
5. Open AutoGIT Studio **API Keys** modal and paste the token.

---

## 🚀 Quick Start & Local Development

### Prerequisites
- Node.js 18.17+ or 20+
- npm 9+

### 1. Installation

```bash
# Clone the repository
git clone https://github.com/your-username/AutoGIT.git
cd AutoGIT

# Install dependencies in website/
cd website
npm install
```

### 2. Run Local Development Server

```bash
npm run dev
```

Open [http://localhost:3000](http://localhost:3000) in your browser.

---

## 🧪 Comprehensive Verification & Test Suite

AutoGIT includes a comprehensive Vitest test suite with over **630+ automated tests** covering unit, integration, stress, and 4-tier E2E scenarios.

```bash
# Run full test suite
cd website
npm test

# Run tests in watch mode
npm run test:watch

# Run linter
npm run lint

# Run production build & typecheck
npm run build
```

### Test Suite Structure
```
website/tests/
├── e2e/
│   ├── tier1_feature_coverage.test.ts      # 75 isolated feature tests (F1-F15)
│   ├── tier2_boundary_corner.test.ts       # 75 boundary & edge condition tests
│   ├── tier3_pairwise_combinations.test.ts # 16 combinatorial cross-feature tests
│   └── tier4_real_world_scenarios.test.ts  # 5 end-to-end user workflows
└── unit/
    ├── keyStore.test.ts & stress.test.tsx  # WebCrypto AES-GCM encryption tests
    ├── openrouterRouter.test.ts & stress   # Free-tier routing & 429 failover
    ├── guardrails.test.ts & cascades.stress# Strict paid/local LLM blockers
    ├── workflowEngine.test.ts & stress     # 19-stage state machine & reflection
    ├── gitPublisher.test.ts                # GitHub Git Data API & repo push
    ├── zipExporter.test.ts                 # JSZip archive creation
    └── studioComponents.test.tsx & stress  # Monaco, Diff, and UI state tests
```

---

## ☁️ Vercel Deployment Guide

Deploy AutoGIT instantly to Vercel with zero backend servers and zero environment variables required.

### 1. Using Vercel CLI

```bash
# Ensure Vercel CLI is installed
vercel --version

# Deploy from repository root
vercel --prod website

# Or navigate to website/ and deploy directly
cd website
vercel --prod
```

### 2. Using Vercel Web Dashboard

1. Push your repository to GitHub.
2. Import the repository into [Vercel Dashboard](https://vercel.com/new).
3. Set **Root Directory** to `website`.
4. Framework Preset: **Next.js** (automatically detected).
5. Click **Deploy**. No Environment Variables are needed!

### 3. Security Configuration (`vercel.json`)
AutoGIT's `vercel.json` includes strict security headers:
- `Content-Security-Policy`: Restricts scripts and network connections strictly to `self`, `openrouter.ai`, `api.github.com`, and `export.arxiv.org`.
- `X-Frame-Options`: `DENY` (Prevents clickjacking).
- `X-Content-Type-Options`: `nosniff`.
- `Referrer-Policy`: `strict-origin-when-cross-origin`.

---

## 📂 Project Directory Layout

```
AutoGIT/
├── website/                      # Full Next.js 14 BYOK Web Studio Application
│   ├── app/                      # Next.js App Router (page.tsx, layout.tsx, globals.css)
│   ├── components/
│   │   ├── studio/               # StudioHeader, CodeWorkspace, DiffViewer, etc.
│   │   └── ui/                   # Modular UI components (buttons, modals, badges)
│   ├── lib/
│   │   ├── storage/              # WebCrypto keyStore (AES-GCM encryption)
│   │   ├── openrouter/           # Dynamic router, models catalog, guardrails
│   │   ├── research/             # arXiv XML ingestion and parser
│   │   ├── workflow/             # 19-stage state machine & AST validator
│   │   ├── github/               # Direct browser Git Data API publisher
│   │   └── export/               # Client-side JSZip packaging
│   ├── tests/                    # 630+ unit, integration, stress, and E2E tests
│   ├── vercel.json               # Vercel security headers and routing
│   ├── package.json              # Website dependencies and scripts
│   └── vitest.config.ts          # Vitest test configuration
├── vercel.json                   # Root deployment redirect to website/
├── package.json                  # Root workspace helper scripts
├── PROJECT.md                    # System architecture & interface specifications
├── TEST_INFRA.md                 # 4-Tier E2E testing framework specification
└── README.md                     # Main documentation (this file)
```

---

## 📜 License

This project is licensed under the MIT License - see the [LICENSE](LICENSE) file for details.
