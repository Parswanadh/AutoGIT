# AutoGIT Ox-Alpha Exclusive Revival — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development to implement task-by-task. Steps use checkbox syntax. Free-only, no paid models, OOM-safe, 20-way parallel where file-disjoint.

**Goal:** Pipeline runs E2E on `stealth/ox-alpha:free` only, mid-depth scraper + reuse RAG, zero crash/OOM, free-tier guards enforced.

**Architecture:** Fix wiring → free-gate → reliability → research (reuse) → purge behind tests → CI. 20 subagents via isolated worktrees where possible, else direct disjoint files. Fresh agent per task + spec→quality double-review.

**Tech Stack:** Existing `tavily-python`, `chromadb==0.4.18`, `sentence-transformers`, `httpx`, `tenacity`, `pytest-asyncio`, `vcrpy`. No new heavy dep unless eval proves need. Stdlib first.

---
## Task 0: Plan save + worktree prep (already done)
- [x] `docs/superpowers/plans/2026-08-22-autogit-ox-alpha-revival.md` committed

## Wave 0 — Purge (1 wave, 4 parallel where disjoint, else sequential)
### Task 1: Purge legacy pipeline + dup caches
**Files:** delete `src/pipeline/*` legacy, keep `langraph_pipeline/*`; deduplicate `cached_llm` vs `local_cached_llm` vs `semantic_cache`. Guard: `rg -n "from src.pipeline"` -> 0.
### Task 2: Purge stale docs/ephemeral
**Files:** delete/rotate `data/test_env_cache`, `.pytest_cache`, `BUILD_STATUS_TODO` stale sections.

## Wave 1a — Free-gate ox-alpha exclusive (2 parallel, then join)
### Task 3: model_manager filter
**Files:** `src/utils/model_manager.py:640`, `config/model_backends.yaml`
- Add `stealth/ox-alpha:free` (1M ctx) as `ox_alpha_exclusive` profile; predicate `_is_free = ":free" in name or name in FREE_ALLOWLIST`; gate `openai/groq_paid` behind `OPENROUTER_PAID`; expose `free_gate_enabled`.
- Test: `OPENROUTER_PAID=false` -> `get_fallback_llm("powerful")` never selects paid; cost 0.

### Task 4: hybrid_router passthrough
**Files:** `src/llm/hybrid_router.py`, `src/utils/llm_providers/hybrid/dual_provider.py`
- Passthrough `free_gate` flag, disable `parallel_*` fan-out when ox-alpha exclusive (single call), respect `200 RPD / 20 RPM`.

## Wave 1b — Wiring (2 serial, file-lock workflow_enhanced)
### Task 5: checkpointer_factory
**Files:** create `src/langraph_pipeline/checkpointer_factory.py` (<80 lines) returns `Bundle(provider, location, checkpointer, close)` for sqlite/memory/local/redis, fallback MemorySaver. Fix `workflow_enhanced.py:64` import.
### Task 6: CLI fix
**Files:** create `src/cli/app.py` re-export `auto_git_cli:app`; fix `cli_entry.py:14`; setup.py entry `auto-git=cli_entry:main`. Add `--free-only` passthrough.

## Wave 1c — Scraper mid-depth (6 shards, parallel)
### Task 7: Shared SQLiteCache WAL
**Files:** `src/utils/cache.py` add WAL, `src/scraper/cache.py` new
### Task 8: RateLimiter+Breaker
**Files:** `src/utils/rate_limiter.py`, `src/utils/retry.py` wiring into searchers
### Task 9: Canonicalizer
**Files:** new `src/scraper/canonical.py` stdlib `urlparse`
### Task 10: JSON probe
**Files:** new `src/scraper/probe.py` wraps `json_parser.extract_json_from_text`
### Task 11: Tavily quota
**Files:** new `src/scraper/tavily_quota.py` + `config.yaml` quota
### Task 12: Coordinator reuse
**Files:** `src/agents/research/research_coordinator.py` dedupe via canonical

## Wave 1d — RAG reuse (5 shards)
### Task 13: embedder factory
**Files:** new `src/utils/embeddings/embedder_factory.py`
### Task 14: vector_store singleton
**Files:** new `src/state_management/vector_store.py`
### Task 15: hierarchical_memory persist fix
**Files:** `src/agents/memory/hierarchical_memory.py:549`
### Task 16: SCAN fix
**Files:** `src/state_management/cache_manager.py:163`, `src/llm/semantic_cache.py:205`, `cached_llm.py:142`
### Task 17: eval harness
**Files:** new `scripts/eval/rag_eval_harness.py`, `tests/unit/test_rag_eval.py`

## Wave 2 — Reliability (8 shards, post-wiring)
### Task 18: loop_detector, resource_gate, artifact_cache, fanout_limiter, fingerprint, middleware restore, executor allowlist, checkpoint JSON (each new `src/utils/<name>.py`, patch `workflow_enhanced.py` wrapper order)

## Wave 3 — Security (3 shards)
### Task 19: allowlist env (`src/utils/safe_env.py`), pickle->json, validator policy

## Wave 4 — Tests+CI (4 shards)
### Task 20: pytest.ini, conftest VCR, 429 injection, free-tier guards + 4 Actions workflows

## OOM/Crash guards (applies to all)
- `resource_gate` advisory timeout 3-10s, never block >30s
- `RateLimiter` per-engine, `Semaphore(20)` on parallel agents
- `Artifact cache` key includes `trust_mode`, not just length
- `CostTracker` hard fail before paid call

## Execution waves
W0 purge → W1 6-way (free-gate+scraper+RAG) → W2 wiring 2 serial → W3 reliability 8 via worktrees → W4 tests+CI. Merge order A→B→C with rebase on `workflow_enhanced.py` hotspot.
