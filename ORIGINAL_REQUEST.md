# Original User Request

## 2026-08-30T11:44:15Z

Transform AutoGIT into a full-featured, interactive, client-side rendered BYOK (Bring-Your-Own-Key) Web Application with an amazing frontend that executes autonomous research-to-GitHub workflows directly from the browser, strictly using OpenRouter free-tier models and zero local LLMs, deployable via Vercel CLI with frequent git commits.

Working directory: /home/parshu/projects/AutoGIT
Integrity mode: development

## Requirements

### R1. Pure Client-Side BYOK Web Studio Architecture
Build a responsive, modern web application (in `website/`) that runs pipeline orchestration directly in the browser. Allow users to enter and store their OpenRouter API key and GitHub Personal Access Token in secure browser storage (BYOK). Direct all API requests from the browser to OpenRouter and GitHub REST APIs without requiring a persistent backend server, enabling seamless static/edge deployment to Vercel, Cloudflare Pages, or Oracle Cloud.

### R2. Strict OpenRouter Free-Tier Model Routing & Guardrails
Integrate OpenRouter using exclusively free models (models tagged with `:free`, such as `google/gemini-2.0-flash-exp:free`, `meta-llama/llama-3.3-70b-instruct:free`, `qwen/qwen-2.5-coder-32b-instruct:free`, `deepseek/deepseek-r1:free`). Implement automatic retry and failover between free model endpoints upon rate limits. Strictly block or fail-fast on any paid model IDs, and ensure no local LLM/Ollama processes are spawned or connected.

### R3. End-to-End Autonomous Workflow UI & Live Streaming
Provide a rich interactive UI Studio allowing users to:
1. Input arXiv paper IDs, URLs, search topics, or custom project ideas.
2. Configure workflow tiers (Discovery/Scouting, Multi-Agent Debate, Code Generation, Syntax/Type Validation, GitHub Repository Scaffolding).
3. View real-time streaming progress logs and multi-agent debate turns in the browser.
4. Inspect, diff, edit, and preview generated multi-file codebases and documentation.
5. Create and publish repositories directly to GitHub under the user's account using their provided GitHub PAT, or download a complete zip bundle.

### R4. Test Suite, Automated Verification & Vercel Deployment
Ensure all frontend dependencies are cleanly managed, unit and integration tests are in place, the production build completes with zero errors (`npm run build`), and deploy the completed web application using the Vercel CLI (`vercel --prod`). Maintain frequent, descriptive git commits throughout all stages of development.

## Verification Resources

- Local development & build command: `cd website && npm install && npm run build`
- Unit/E2E test command: `cd website && npm test`
- Vercel CLI deployment tool: `vercel` or `npx vercel`
- Environment reference: `.env.example` in repo root for OpenRouter and GitHub token configurations.

## Acceptance Criteria

### Browser & Client-Side BYOK Functionality
- [ ] `npm run build` in `website/` succeeds with exit code 0 and zero TypeScript/lint errors.
- [ ] Application provides BYOK settings modal/panel allowing users to input and persist OpenRouter API Key and GitHub PAT in local storage.
- [ ] The full research, debate, code generation, and GitHub publishing workflow can be initiated and completed entirely within the web UI.
- [ ] Users can export/download the generated project files as a `.zip` archive directly from the browser.

### Model Policy & Safety Guardrails
- [ ] All LLM calls route strictly to OpenRouter endpoints with `:free` model identifiers.
- [ ] Zero invocations of local Ollama / local LLM instances across the web app runtime.
- [ ] Fallback handling switches between available free models if a rate limit (HTTP 429) occurs.

### GitHub Integration & Publishing
- [ ] Users can publish generated repositories directly to GitHub using GitHub API v3 / REST via their personal access token.
- [ ] Created repositories include complete generated code, tests, and auto-generated README markdown.

### Deployment & Version Control
- [ ] Web application is successfully built and deployable via Vercel CLI.
- [ ] Git commit history shows regular, atomic commits for each major feature implemented.
