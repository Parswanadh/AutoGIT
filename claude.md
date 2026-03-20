# 🤖 CLAUDE.MD - Auto-GIT Session Context & System State

**Last Updated**: March 12, 2026  
**Purpose**: Comprehensive session context for AI agents working on Auto-GIT  
**Status**: System is ~92% complete, 19-node pipeline with full execution policy coverage  

---

## 🎯 CURRENT SESSION CONTEXT (Read This First!)

### What We're Working On RIGHT NOW
**Priority**: Quality & Reliability hardening

1. **Enhanced Validation** (✅ COMPLETE)
   - 5-stage validation (syntax, types, security, linting) via `EnhancedValidator`
   - Traceback parser, error pattern DB (12 patterns), Docker sandbox, incremental compiler

2. **VRAM Thrashing Fix** (✅ COMPLETE)
   - `src/utils/model_manager.py` keeps models loaded
   - All nodes use `get_llm()` / `get_fallback_llm()` instead of raw `ChatOllama()`

3. **Pipeline Bug Fixes** (✅ COMPLETE)
   - Fixed: consensus_check_node IndexError, problem_extraction_node NoneType
   - Fixed: 85 bugs found and resolved across full audit
   - Fixed: 30 silent failure patterns (4 CRITICAL, 16 HIGH)

4. **Resource Monitoring** (✅ INTEGRATED)
   - `get_monitor()` called in `workflow_enhanced.py` at pipeline entry
   - `_with_execution_policy()` wrapper gates every node with resource checks
   - ALL 19 nodes now wrapped with execution policy (S26)

5. **Execution Policy** (✅ ALL NODES COVERED)
   - 11 heavy nodes: full budgets (120-480s soft, 300-1500s hard)
   - 8 lightweight nodes (S26): short budgets (45-90s soft, 120-240s hard)
   - Hard timeouts via `asyncio.wait_for()`, soft budget warnings logged

6. **Skeleton/Artifact Hardening** (✅ ENHANCED S26)
   - 6 known skeleton markers detected
   - Semantic stub detection: catches functions returning only None/empty
   - README.md placeholder validation
   - Incomplete artifacts routed to fix loop automatically

7. **Test Provenance** (✅ ADDED S26)
   - Auto-generated test_main.py includes provenance header
   - Feature verification tests marked with trust level metadata

8. **Prompt Bloat Protection** (✅ TRACKED)
   - 400K char budget with 70/30 head/tail split
   - Warning logged when trimming occurs (S26)

---

## 🏗️ SYSTEM ARCHITECTURE OVERVIEW

### What Auto-GIT Does
**One-Line Summary**: Research → Multi-Agent Debate → Code Generation → GitHub Publishing

**Pipeline Flow** (19 nodes):
```
 1. Requirements Extraction → Parse user idea into structured requirements
 2. Research Node → Gathers arXiv papers + web + GitHub repos
 3. Generate Perspectives → Create 3 expert viewpoints
 4. Problem Extraction → Identifies novel problems from research
 5. Solution Generation → 3 expert perspectives propose solutions
 6. Critique Node → Each expert critiques all proposals
 7. Consensus Check → Determines if more debate needed (loop back to 5 or forward)
 8. Solution Selection → Picks best solution via weighted voting
 9. Architect Spec → Produces architecture specification
10. Code Generation → Creates production-ready multi-file code
11. Code Review Agent → Reviews generated code for issues
12. Code Testing → AST validation, import checks, sandbox execution
13. Feature Verification → Runtime per-feature PASS/FAIL in sandbox
14. Strategy Reasoner → Analyzes failures, plans fix strategy
15. Code Fixing → Applies deterministic + LLM-driven fixes
16. Smoke Test → Full runtime verification in isolated venv
17. Pipeline Self-Eval → LLM-as-Judge quality assessment
18. Goal Achievement Eval → Checks requirements satisfaction
19. Git Publishing → Creates repo, pushes code to GitHub
```

### Key Technologies
- **Orchestration**: LangGraph (state machine workflow)
- **LLMs**: Ollama (local), Groq/OpenAI (cloud fallback)
- **Research**: arXiv API, DuckDuckGo, SearXNG, GitHub
- **Multi-Agent**: 3 perspectives (ML Researcher, Systems Engineer, Applied Scientist)
- **Validation**: Python AST, imports, sandbox execution
- **Storage**: JSON state, memory checkpoints

---

## 📂 PROJECT STRUCTURE (What's Where)

### Core Directories
```
src/
├── langraph_pipeline/       # Main pipeline (THIS IS THE HEART)
│   ├── workflow_enhanced.py # Pipeline orchestration & entry point
│   ├── nodes.py             # 19 pipeline node functions
│   └── state.py             # AutoGITState definition
│
├── agents/                  # Legacy multi-agent system (still used)
│   ├── tier2_debate/        # Debate agents (solution gen, critique)
│   └── sequential_orchestrator.py
│
├── research/                # Research capabilities
│   ├── extensive_researcher.py  # Multi-iteration research (3 rounds)
│   └── searxng_client.py        # Privacy-first search
│
├── llm/                     # LLM management
│   ├── hybrid_router.py     # Routes to best LLM (cloud vs local)
│   ├── multi_backend_manager.py # Manages Groq/OpenAI/Anthropic
│   └── semantic_cache.py    # Caches LLM responses
│
├── utils/                   # Utilities
│   ├── model_manager.py     # Prevents VRAM thrashing
│   ├── resource_monitor.py  # Tracks CPU/RAM/VRAM
│   ├── traceback_parser.py  # NEW S13: Structured error extraction
│   ├── error_pattern_db.py  # NEW S13: 12 regex auto-fix patterns
│   ├── docker_executor.py   # NEW S13: Docker sandbox execution
│   ├── incremental_compiler.py # NEW S13: Per-file validation
│   ├── code_validator.py    # Validates generated code
│   └── web_search.py        # DuckDuckGo + SearXNG
│
├── cli/                     # Command-line interfaces
│   └── claude_code_cli.py   # Claude Code style CLI (has 6 TODOs)
│
└── pydantic_agents/         # Type-safe agents (newer)
    ├── code_generator.py
    └── code_reviewer.py
```

### Entry Points
- `auto_git_interactive.py` - Interactive CLI (original, working)
- `auto_git_cli.py` - Command-line CLI (working)
- `autogit_claude.py` - Claude Code style (has TODOs, partially working)
- `test_system_integrated.py` - System diagnostic tests

### Important Config Files
- `config.yaml` - Main configuration (models, settings, MCP servers)
- `.env` - API keys (Groq, OpenAI, GitHub)
- `requirements.txt` - Python dependencies

---

## 🔧 HOW THE SYSTEM WORKS (Technical Details)

### 1. Pipeline Execution Flow

**Entry Point**: `src/langraph_pipeline/workflow_enhanced.py::run_auto_git_pipeline()`

**State Management**:
```python
class AutoGITState(TypedDict):
    idea: str                      # User's idea/requirement
    research_context: dict         # Papers, web results, GitHub repos
    problems: List[str]            # Extracted problems
    selected_problem: str          # Chosen problem to solve
    debate_rounds: List[DebateRound]  # Multi-agent debate history
    final_solution: dict           # Selected solution
    generated_code: dict           # {filename: code}
    validation_results: dict       # Validation outcomes
    github_repo: Optional[str]     # Published repo URL
    current_stage: str             # Pipeline stage tracker
    errors: List[str]              # Error accumulator
```

**Node Definitions** (in `nodes.py`) — see pipeline flow above for the full 19 nodes.
Key functions: `research_node()`, `code_generation_node()`, `code_testing_node()`,
`feature_verification_node()`, `strategy_reasoner_node()`, `code_fixing_node()`,
`smoke_test_node()`, `pipeline_self_eval_node()`, `goal_achievement_eval_node()`,
`git_publishing_node()`.

### 2. Model Management
```python
# OLD WAY (BAD - reloads every time):
llm = ChatOllama(model="qwen3:4b", temperature=0.7, base_url="http://localhost:11434")

# NEW WAY (GOOD - keeps model loaded):
llm = get_llm("balanced")  # Returns cached model instance
```

**Model Profiles**:
- `fast`: qwen3:0.6b (522MB) - Simple tasks, validation
- `balanced`: qwen3:4b (2.5GB) - Most tasks (DEFAULT)
- `powerful`: qwen2.5-coder:7b (4.7GB) - Complex code
- `reasoning`: phi4-mini:3.8b (2.5GB) - Critique, analysis

**Usage in nodes**:
```python
# In nodes.py, all LLM calls now use:
llm = get_llm("balanced")  # or "fast", "powerful", "reasoning"
```

### 3. Multi-Agent Debate System

**Perspectives** (defined in `state.py`):
1. **ML Researcher** - Theory, algorithms, research best practices
2. **Systems Engineer** - Infrastructure, scalability, production
3. **Applied Scientist** - Practical implementation, real-world use

**Debate Process**:
```
Round 1:
  - Each perspective proposes solution
  - Uses research context as grounding
  
Round 2 (Critique):
  - Each perspective critiques ALL proposals (including own)
  - Identifies strengths, weaknesses, risks
  
Round 3 (Consensus Check):
  - Calculate consensus score
  - If low consensus → another debate round
  - If high consensus → proceed to selection
  
Final:
  - Weighted voting (expertise weights: 1.0-1.3x)
  - Security expert has 1.3x weight
  - Select best solution
```

**Consensus Algorithm**:
```python
# Weighted voting
score = Σ(perspective_weight × confidence × quality_metrics)

# Weights:
ML_Researcher: 1.0
Systems_Engineer: 1.2
Security_Expert: 1.3
Applied_Scientist: 1.1
```

### 4. Research System

**ExtensiveResearcher** (3-iteration refinement):
```
Iteration 1:
  - Broad search on original idea
  - Gather initial papers/web results
  
Iteration 2:
  - LLM analyzes gaps in coverage
  - Generate refined queries
  - Target missing aspects
  
Iteration 3:
  - Synthesis and validation
  - Cross-reference findings
  - Final quality check
```

**Sources**:
- **arXiv**: Academic papers (primary source)
- **DuckDuckGo**: Web search (fallback)
- **SearXNG**: Privacy-first search (if available)
- **GitHub**: Code repositories (implementations)

### 5. Validation System (85% complete)

**Current Validation**:
```python
1. Syntax Check → Python AST parsing
2. Import Check → Verify imports exist
3. Structure Check → Basic code structure
4. Execution Check → Run in sandbox (cached venvs)
5. Feature Verification → Per-feature runtime PASS/FAIL
6. Traceback Parser → Structured error extraction (12 patterns)
7. Incremental Compiler → Per-file validation during codegen
8. Skeleton Detection → 6 markers + semantic stubs + README
```

### 6. Resource Monitoring (✅ INTEGRATED)

**ResourceMonitor** (`src/utils/resource_monitor.py`):
```python
monitor = ResourceMonitor()
monitor.start()  # Background thread

# Check before heavy operation
if not monitor.check_safe_to_proceed():
    monitor.wait_for_resources(timeout=60)

# Get current stats
stats = monitor.stats
# Returns: cpu_percent, ram_percent, gpu_vram_used_mb, etc.
```

**Integration**: All 19 nodes gated via `_with_execution_policy()` in `workflow_enhanced.py`. Monitor started at pipeline entry in `run_auto_git_pipeline()`.

---

## 🐛 KNOWN BUGS & ISSUES

### Resolved (Previously Critical)

1. **GGML Assertion Failures** ✅ MITIGATED
   - Switched to cloud LLM (Grok 4.1 Fast via OpenRouter) as primary
   - Local Ollama used only as fallback
   - Model manager prevents VRAM thrashing

2. **VRAM Thrashing** ✅ FIXED
   - All nodes use `get_llm()` / `get_fallback_llm()` — no raw ChatOllama()
   - `src/utils/model_manager.py` keeps models loaded

3. **Pipeline Crashes** ✅ FIXED
   - Fixed: consensus_check_node IndexError
   - Fixed: problem_extraction_node NoneType
   - Fixed: 85 bugs across full audit
   - Fixed: 30 silent failure patterns

### Known Limitations

1. **MCP Integration Incomplete** ⚠️
   - Architecture designed, not implemented
   - 6 TODOs in `src/cli/claude_code_cli.py`

2. **Python Only** ⚠️
   - Can't generate Rust, Go, JavaScript
   - No multi-language support

---

## 📋 TODO LIST (Priority Order)

### 🔥 CRITICAL (Next Session)

- [ ] **End-to-End Testing**
  - Test simple case: calculator
  - Test moderate case: todo app
  - Document success rate
  - Fix any new issues

### ⚠️ HIGH PRIORITY (Next 2-3 Weeks)

- [ ] **Ranks 6-10 from PIPELINE_IMPROVEMENT_PLAN.md**
  - Rank 6: Speculative Diff-Based Editing
  - Rank 7: Repo Map / Code Graph
  - Rank 8: TDD Loop
  - Rank 9: Multi-Model Ensemble
  - Rank 10: Semgrep SAST

### 🟢 MEDIUM PRIORITY (1 Month)

- [ ] **Complete MCP Integration**
  - Implement MCP server process management
  - Implement JSON-RPC 2.0 client
  - Test with 3+ MCP servers

- [ ] **Add Performance Profiling**
  - Time each node, track token usage
  - Create performance dashboard

---

## 🔑 KEY FILES TO KNOW

### Most Important Files (Work Here Most Often)

1. **`src/langraph_pipeline/nodes.py`** (~10,400 lines)
   - All 19 pipeline node functions
   - WHERE: Most bugs and TODOs
   - RECENTLY: S26 — semantic stub detection, test provenance, prompt trim warnings

2. **`src/langraph_pipeline/workflow_enhanced.py`** (~1,100 lines)
   - Pipeline orchestration with execution policy
   - Entry point: `run_auto_git_pipeline()`
   - S26: ALL 19 nodes wrapped with `_with_execution_policy`

3. **`src/utils/traceback_parser.py`** (240 lines)
   - Parses Python tracebacks into structured ParsedError objects

4. **`src/utils/error_pattern_db.py`** (470 lines)
   - 12 regex auto-fix patterns (missing_self, imports, encoding, etc.)

5. **`src/utils/feature_verifier.py`** (~300 lines)
   - Runtime feature verification in sandbox
   - S26: Provenance header in HARNESS_TEMPLATE

6. **`src/utils/model_manager.py`** (200 lines)
   - Prevents VRAM thrashing — 4 model profiles

7. **`src/utils/resource_monitor.py`** (~330 lines)
   - System resource monitoring (CPU/RAM/VRAM)
   - Integrated via `_with_execution_policy` in workflow

8. **`config.yaml`** (426 lines)
   - Main configuration — model settings, thresholds

### Test Files

1. **`tests/unit/test_nodes_zero_cost.py`** - 41 zero-cost unit tests
2. **`tests/unit/test_state_contracts.py`** - 14 state contract tests
3. **`tests/conftest.py`** - FakeLLM, make_state(), patch_get_llm fixtures
4. **`pytest.ini`** - Test configuration

### Documentation Files (Keep These)

1. **`claude.md`** - THIS FILE (session context)
2. **`PIPELINE_IMPROVEMENT_PLAN.md`** - 55 free MCPs + 10 ranked improvements
3. **`BUILD_STATUS_TODO.md`** - Detailed TODO list
4. **`COMPLETE_SYSTEM_DOCUMENTATION.md`** - System docs
5. **`PROGRESS.md`** - Detailed session history
6. **`README.md`** - User-facing docs

---

## 🎓 WORKING ON AUTO-GIT

### Rules
- Always `get_llm("balanced")` — never raw `ChatOllama()`
- Start with `workflow_enhanced.py` (entry point), then `nodes.py` (core logic)
- Test with simple cases first (calculator, todo app)
- Run `conda activate auto-git` then `pytest tests/unit/ -v --tb=short`
- **Industry Research Protocol** (MANDATORY for architectural blocks — see below)

### 🔬 Industry Research Protocol (IRP)

**When**: You hit an architectural block, a design decision with multiple approaches, or a
fundamental quality/correctness issue that simple bug-fixing won't resolve.

**Trigger examples**:
- Fix loop can't resolve a class of errors (e.g. dependency resolution)
- Code generation quality stalls below target (e.g. self-eval < 7/10)
- A subsystem needs redesign (e.g. validation, caching, sandbox)
- Performance bottleneck with no obvious fix
- New capability needed (e.g. multi-language, TDD, diff-based editing)

**Protocol** (follow in order):

1. **Identify the block** — Write a clear 1-2 sentence problem statement
2. **Research how industry solves it** — Study 4-6 production systems:
   - **Claude Code / Anthropic**: Sandbox-first, run-see-fix OODA loop
   - **Aider**: Repo map, git-based undo, diff-based edits
   - **SWE-Agent / OpenHands**: Full Docker sandbox, shell-based agent
   - **LangGraph Deep Agents**: Middleware pattern, PreCompletionChecklist
   - **Devin**: Multi-hour planning, isolated VM, full autonomy
   - **GPT-Engineer / MetaGPT**: Role-based agents, QA validation
   - Also check: arXiv papers, SWE-bench leaderboards, blog posts
3. **Extract the universal principle** — What do ALL top systems agree on?
4. **Adapt to Auto-GIT** — Map the principle to our 19-node pipeline architecture
5. **Implement** — Write the code, wire it in, add unit tests
6. **Validate** — Run `pytest tests/unit/ -v` + E2E test if applicable

**Key insights from past IRP sessions**:
- Dependencies: Never trust LLM-generated requirements.txt — cross-reference with actual imports (deterministic > LLM)
- Fix loops: Separate dependency fixes from code fixes — they're independent concerns
- Rollback safety: Make infrastructure fixes (deps, config) rollback-proof — if LLM code fix reverts, infra stays
- Validation: Run-then-fix beats static-analysis-then-guess (Claude Code, SWE-Agent pattern)
- Circuit breakers: Don't suppress the symptom — fix the root cause first, THEN the circuit breaker is unnecessary

**Reference systems for common problems**:
| Problem | Best Reference | Their Solution |
|---------|---------------|----------------|
| Dependency resolution | Claude Code, SWE-Agent | Run → see error → pip install → re-run |
| Fix loop oscillation | Aider | Git-based undo, diff-only patches |
| Code quality stall | Deep Agents | PreCompletionChecklist middleware |
| Cross-file consistency | Aider | Repo map / code graph |
| Test generation | SWE-Agent | Run pytest, read output, fix |
| Sandbox isolation | Claude Code, Devin | Container per run, fresh venv |

### Quick Commands
```bash
conda activate auto-git
python auto_git_interactive.py          # Interactive CLI
python auto_git_cli.py generate "..."   # Single command
pytest tests/unit/test_nodes_zero_cost.py tests/unit/test_state_contracts.py -v  # Unit tests
ollama list                             # Check models
```

### Common Pitfalls
- Creating new ChatOllama instances (use `get_llm()`)
- Not checking for None values (add null checks)
- Testing with complex cases first (start simple)

---

## 📊 SYSTEM METRICS

- **Pipeline Duration**: 5-10 minutes typical
- **Overall Completion**: ~92%
- **Unit Tests**: 55 passing ($0 cost)
- **Nodes**: 19, all wrapped with execution policy

### Completion Status
- **Overall**: 92% complete
- **Core Infrastructure**: 100%
- **Research**: 95%
- **Multi-Agent**: 95%
- **LLM Integration**: 95%
- **Code Generation**: 90%
- **Validation**: 85%
- **Execution Policy / Resource Monitoring**: 100%
- **CLI**: 80%
- **Documentation**: 95%

---

## 🎯 SUCCESS CRITERIA

- **Phase 1: Stability** ✅ COMPLETE — 80%+ completion rate, no crashes, resource monitoring
- **Phase 2: Quality** — 85%+ correctness, 85/100 quality, 80%+ test coverage
- **Phase 3: Features** — MCP integration, 20-30% faster, 95%+ error recovery
- **Phase 4: Scale** — Multi-language, SaaS, VSCode extension

---

## 💡 FOR NEW AI AGENTS

1. Read this file first, then check `BUILD_STATUS_TODO.md`
2. Start with `workflow_enhanced.py` → `nodes.py` → subsystems
3. Use `get_llm()` not `ChatOllama()`, test locally first
4. Run `pytest tests/unit/ -v` to verify changes
5. **When you hit an architectural block → follow the Industry Research Protocol (IRP) in the Rules section above**
   - Don't guess or brute-force. Research how Claude Code, Aider, SWE-Agent, Devin etc. solve the same problem.
   - Extract the universal principle, adapt it to our pipeline, implement, test.
   - This is NOT optional — it's how we maintain SOTA quality.

---

##  SESSION UPDATE LOG

> **Full session history moved to [`PROGRESS.md`](PROGRESS.md)** to keep this file focused on architecture & current state.
> 
> Latest session: **Session 26 (Mar 12, 2026)** — Resolved all 7 remaining issues from SPEED_QUALITY_REMEDIATION_REPORT. All 19 nodes wrapped with execution policy. Semantic stub detection, test provenance, prompt trim warnings added.

---

## 🎬 NEXT STEPS (What to Do Now)

### Immediate (Next Session)
1. **End-to-End Test**: Run pipeline with all improvements on a fresh project
2. **Measure Impact**: Target 8.5+/10 self-eval, fewer fix-loop iterations, faster error recovery

### Next Priority (Ranks 6-10 from PIPELINE_IMPROVEMENT_PLAN.md)
1. **Rank 6**: Speculative Diff-Based Editing (30-40% faster fixes)
2. **Rank 7**: Repo Map / Code Graph (cross-file consistency)
3. **Rank 8**: TDD Loop (85%+ correctness)
4. **Rank 9**: Multi-Model Ensemble (-10% error rate)
5. **Rank 10**: Semgrep SAST (security scanning)

### MCP Integration (from PIPELINE_IMPROVEMENT_PLAN.md)
1. **Tier 1**: E2B Code Sandbox, Daytona Sandbox (Docker-based)
2. **Tier 2**: Semgrep, pip-audit (security scanning)
3. **Tier 3**: Brave Search, ArXiv, Exa (research enhancement)
4. **Tier 4-8**: See PIPELINE_IMPROVEMENT_PLAN.md for full 55-server catalog

---

**Remember**: 
- System is ~92% complete
- Pipeline has **19 nodes**: requirements_extraction → research → ... → git_publishing
- Focus on CORRECTNESS (code that runs AND produces correct output)
- **SOTA integrated**: LLM-as-Judge, RAD, Reflexion, auto test gen, CoT requirements, error memory
- **Session 11**: Artifact stripper, circular import detector, SQL schema checker, 8 silent failure fixes, retry logic, fail-safe defaults
- **Session 12**: Web research + MCP strategy → `PIPELINE_IMPROVEMENT_PLAN.md`
- **Session 13**: Implemented top 5 improvements — traceback parser, error pattern DB (12 patterns), Docker sandbox, incremental compiler. All integrated into nodes.py. 55 free MCPs cataloged.
- See [`PROGRESS.md`](PROGRESS.md) for detailed session history

*Update PROGRESS.md (not this file) after each session.*
