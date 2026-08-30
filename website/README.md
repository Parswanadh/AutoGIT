# 🌐 AutoGIT Web Studio (`website/`)

[![Next.js 14](https://img.shields.io/badge/Next.js-14.2.15-black?logo=next.js)](https://nextjs.org/)
[![TypeScript](https://img.shields.io/badge/TypeScript-5.4-blue?logo=typescript)](https://www.typescriptlang.org/)
[![Tailwind CSS](https://img.shields.io/badge/Tailwind-3.4-38bdf8?logo=tailwind-css)](https://tailwindcss.com/)
[![Vitest](https://img.shields.io/badge/Vitest-630%2B%20Tests%20Passing-6e9f18?logo=vitest)](https://vitest.dev/)
[![OpenRouter Free](https://img.shields.io/badge/OpenRouter-100%25%20Free--Tier-6366f1)](https://openrouter.ai/)
[![Vercel Ready](https://img.shields.io/badge/Vercel-Deployment%20Ready-black?logo=vercel)](https://vercel.com/)

> **AutoGIT Web Studio** is the client-side Next.js 14 web application implementing a zero-backend, Bring-Your-Own-Key (BYOK) autonomous research-to-GitHub workspace.

---

## 🏗️ Architecture & Modules

The application is structured into modular layers located in `lib/` and `components/`:

```
website/
├── app/                          # Next.js 14 App Router
│   ├── layout.tsx                # Root layout with dark theme & font optimization
│   ├── page.tsx                  # DualMode controller (Showcase vs Studio mode)
│   └── globals.css               # Tailwind CSS & design tokens
├── components/
│   ├── studio/
│   │   ├── StudioHeader.tsx      # Top bar with model status, BYOK indicators, & actions
│   │   ├── ApiKeyModal.tsx       # WebCrypto AES-GCM BYOK credential manager
│   │   ├── InputConfigPanel.tsx  # arXiv / topic input & pipeline configuration
│   │   ├── PipelineVisualizer.tsx# Reactive 15+ node DAG stepper
│   │   ├── DebateStreamViewer.tsx# 6-agent debate visualizer with <think> blocks
│   │   ├── CodeWorkspace.tsx     # Monaco editor tabs, syntax highlighter, & file tree
│   │   ├── DiffViewer.tsx        # Side-by-side git-style diff comparison
│   │   ├── GitHubPublishModal.tsx# Direct GitHub Git Data API repository publisher
│   │   ├── ZipExportModal.tsx    # Client-side JSZip packaging & download
│   │   └── TerminalLogViewer.tsx # Real-time streaming execution log console
│   └── ui/                       # Reusable UI primitives (dialogs, buttons, badges)
├── lib/
│   ├── storage/
│   │   └── keyStore.ts           # WebCrypto AES-GCM encrypted client key storage
│   ├── openrouter/
│   │   ├── client.ts             # SSE streaming client with 429 jitter backoff
│   │   ├── models.ts             # OpenRouter :free model catalog & health cache
│   │   └── guardrails.ts         # Paid model blocker & localhost disabler
│   ├── research/
│   │   └── arxivParser.ts        # arXiv API & Atom XML parser
│   │   ├── engine.ts             # 19-stage autonomous workflow state machine
│   │   ├── prompts.ts            # 6 expert persona prompt templates
│   │   └── astValidator.ts       # In-browser Python AST & syntax validator
│   ├── github/
│   │   └── publisher.ts          # Direct browser Git Data API publisher
│   └── export/
│       └── zipExporter.ts        # JSZip archive builder
├── tests/                        # 22 test files, 630+ automated tests
│   ├── e2e/                      # 4-tier requirement & scenario tests
│   └── unit/                     # Unit, component, and stress tests
├── vercel.json                   # Security headers (CSP, X-Frame-Options, etc.)
└── package.json                  # Scripts & dependencies
```

---

## 🔑 Bring-Your-Own-Key (BYOK) Setup

AutoGIT runs without any backend database or server storage. Keys remain exclusively in your browser memory or encrypted storage.

### 1. OpenRouter API Key (Free-Tier Only)
1. Sign up at [OpenRouter.ai](https://openrouter.ai/).
2. Create an API key at [OpenRouter Keys](https://openrouter.ai/keys).
3. The AutoGIT router strictly uses `:free` models:
   - `google/gemini-2.0-flash-exp:free` (1M context)
   - `meta-llama/llama-3.3-70b-instruct:free` (128k context)
   - `qwen/qwen-2.5-coder-32b-instruct:free` (32k context)
   - `deepseek/deepseek-r1:free` (64k context)
   - `mistralai/mistral-small-24b-instruct-2501:free` (32k context)

### 2. GitHub Personal Access Token (PAT)
1. Generate a token at [GitHub Token Settings](https://github.com/settings/tokens).
2. Required permissions:
   - Classic: `repo` or `public_repo`
   - Fine-Grained: `Administration (Read & Write)` and `Contents (Read & Write)`

---

## 🛠️ Development & Testing

### Installation & Local Run
```bash
npm install
npm run dev
```

### Run All Tests
```bash
# Run Vitest suite (630+ tests)
npm test

# Run Vitest in watch mode
npm run test:watch
```

### Production Build & Lint
```bash
# Next.js production build & typecheck
npm run build

# ESLint validation
npm run lint
```

---

## 🚀 Deploy to Vercel

```bash
# Install Vercel CLI if needed: npm i -g vercel
vercel --version

# Deploy to production
npm run deploy
# or
vercel --prod
```

### Security Headers Configured in `vercel.json`
- `Content-Security-Policy`: Disallows unauthorized third-party scripts; whitelists OpenRouter, GitHub API, and arXiv.
- `X-Frame-Options`: `DENY`
- `X-Content-Type-Options`: `nosniff`
- `Referrer-Policy`: `strict-origin-when-cross-origin`
- `Permissions-Policy`: `camera=(), microphone=(), geolocation=()`

---

## 📄 License

MIT License — see root [LICENSE](../LICENSE) file.
