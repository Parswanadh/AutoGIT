# E2E Test Infra: AutoGIT BYOK Web Studio

## Test Philosophy
- **Opaque-box & Requirement-driven**: Derived directly from `ORIGINAL_REQUEST.md` requirements (R1, R2, R3, R4) and user workflows.
- **Independent from Internal Implementation**: Exercises public browser entry points, state APIs, mock endpoints, and UI actions.
- **Methodology**: Systematic 4-tier testing (Category-Partition, Boundary Value Analysis, Pairwise Combinatorial Testing, Real-World Application Scenarios).

---

## Feature Inventory & Test Mapping

| # | Feature | Requirement | Tier 1 (Coverage) | Tier 2 (Boundaries) | Tier 3 (Pairwise) |
|---|---------|-------------|:-----------------:|:-------------------:|:-----------------:|
| F1 | BYOK Key Storage & Security | R1 (Pure Client-Side) | 5 | 5 | ✓ |
| F2 | Client-Side Studio Framework & Dual-Mode UI | R1 (Web Studio) | 5 | 5 | ✓ |
| F3 | OpenRouter Free-Tier Dynamic Router | R2 (Free Models) | 5 | 5 | ✓ |
| F4 | 429 Rate-Limit Exponential Backoff & Cascade | R2 (Resilience) | 5 | 5 | ✓ |
| F5 | Strict Paid Model & Local LLM Guardrails | R2 (Guardrails) | 5 | 5 | ✓ |
| F6 | Research Ingestion & arXiv Parser | R3 (Research Inputs) | 5 | 5 | ✓ |
| F7 | Multi-Agent Debate & Consensus Engine | R3 (Debate & Agents) | 5 | 5 | ✓ |
| F8 | Real-Time SSE Stream Parser & `<think>` Visualizer | R3 (Live Streaming) | 5 | 5 | ✓ |
| F9 | Interactive Pipeline DAG Visualizer | R3 (Workflow DAG) | 5 | 5 | ✓ |
| F10 | Multi-File Code Studio & Monaco Editor | R3 (Code Workspace) | 5 | 5 | ✓ |
| F11 | Side-by-Side Diff Viewer | R3 (Diff Viewer) | 5 | 5 | ✓ |
| F12 | Client-Side JSZip Package Exporter | R3 (.zip Download) | 5 | 5 | ✓ |
| F13 | Direct GitHub Repository Publisher | R3 (GitHub PAT Push) | 5 | 5 | ✓ |
| F14 | Vitest Unit & Integration Test Suite | R4 (Automated Tests) | 5 | 5 | ✓ |
| F15 | Production Build & Vercel CLI Deployment | R4 (Vercel Deploy) | 5 | 5 | ✓ |

---

## Test Architecture

### 1. Test Runner
- **Framework**: Vitest (`npm test` in `website/`) + Node test script integration.
- **Environment**: JSDOM / Browser simulation with mocked WebCrypto, Fetch, and LocalStorage APIs.
- **Pass/Fail Semantics**: All test suites must exit with status `0` and 0 assertion failures.

### 2. Directory Layout
```
website/
└── tests/
    ├── e2e/
    │   ├── tier1_feature_coverage.test.ts      # Feature-by-feature isolated verification
    │   ├── tier2_boundary_corner.test.ts       # Rate limit bounds, malformed keys, invalid arXiv
    │   ├── tier3_pairwise_combinations.test.ts # Cross-feature state flow interactions
    │   └── tier4_real_world_scenarios.test.ts  # End-to-end autonomous research-to-GitHub workflows
    └── unit/
        ├── keyStore.test.ts
        ├── openrouterRouter.test.ts
        ├── guardrails.test.ts
        ├── workflowEngine.test.ts
        ├── gitPublisher.test.ts
        └── zipExporter.test.ts
```

---

## Real-World Application Scenarios (Tier 4)

| # | Scenario | Features Exercised | Complexity |
|---|----------|--------------------|------------|
| 1 | **Quantum / ML Transformer Paper to GitHub**: arXiv URL input -> Paper discovery -> 6-Agent debate -> Code Gen -> AST Validation -> Multi-file editor preview -> GitHub Repo Push | F1, F2, F3, F6, F7, F8, F9, F10, F13 | High |
| 2 | **429 Rate-Limit Cascade during Deep Research**: Multi-turn debate triggers mock OpenRouter 429 -> Exponential backoff -> Dynamic fallback from Gemini-2.0-flash:free to Qwen-2.5-coder:free -> Successful code generation | F3, F4, F5, F7, F8, F10 | High |
| 3 | **BYOK Key Session Management & Security Isolation**: User enters OpenRouter key & GitHub PAT -> Encrypted in sessionStorage -> Zero network leakage to non-OpenRouter/non-GitHub hosts -> Key deletion test | F1, F2, F5 | Medium |
| 4 | **Full Client-Side Zip Archive Construction**: Research workflow runs -> Generates 5 files (main.py, model.py, utils.py, requirements.txt, README.md) -> JSZip compiles .zip -> Binary blob validated | F6, F7, F10, F12 | Medium |
| 5 | **Diff Inspection & Manual Code Refinement**: Generated code displayed in Monaco editor -> User switches to DiffViewer to compare initial proposal vs final code -> Edits file manually -> Prepares commit | F2, F10, F11, F13 | Medium |

---

## Coverage Thresholds
- **Tier 1 (Feature Coverage)**: ≥ 75 test cases (15 features × 5 cases)
- **Tier 2 (Boundary & Corner)**: ≥ 75 test cases (15 features × 5 cases)
- **Tier 3 (Cross-Feature Combinations)**: ≥ 15 pairwise interaction test suites
- **Tier 4 (Real-World Scenarios)**: ≥ 5 comprehensive end-to-end workflow scenarios
- **Total Minimum Target**: ~170+ automated test cases
