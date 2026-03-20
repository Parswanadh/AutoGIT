"""
Smart Model Manager for Auto-GIT - Free-First + Multi-Key Edition
==================================================================
Priority order (per profile):
  1. Groq LPU (multi-key pool) - PRIMARY (ultra-fast inference, 5 keys)
  2. OpenRouter FREE models   (if OPENROUTER_API_KEY set)  - $0.00, 27+ models
  3. OpenRouter PAID fallback  (DeepSeek, Gemini etc)      - ~$0.07-0.30/1M
  4. OpenAI gpt-4o-mini       (if OPENAI_API_KEY set)      - $0.15/1M, last resort
  5. Ollama local             (emergency fallback only)    - slow, OOM-prone

Multi-Groq key pool:
  Set GROQ_API_KEY, GROQ_API_KEY_1, GROQ_API_KEY_2, ... GROQ_API_KEY_7 in .env
  Each key is a separate account with its own rate limits.
  The manager expands Groq entries into one slot per key — a 429 on key-0 does NOT
  block key-1, key-2, etc, so combined TPM ≈ N × single-account limit.

Cheap paid OpenRouter models (opt-in):
  Set OPENROUTER_PAID=true in .env to unlock paid tiers after free models are
  rate-limited.  Approximate costs (Feb 2026, OpenRouter):
    deepseek/deepseek-chat-v3-0324  $0.14/1M in, $0.28/1M out  — fast, top quality
    qwen/qwen3-coder                $0.30/1M  — 480B MoE coder specialist
    deepseek/deepseek-r1-0528       $0.55/1M  — faster than :free, still cheap
    microsoft/phi-4-reasoning-plus  $0.07/1M  — small but strong reasoning
    google/gemini-2.0-flash-001     $0.10/1M  — Google's fast Gemini

Get your free Groq key:       https://console.groq.com/keys
Get your free OpenRouter key: https://openrouter.ai/settings/keys
"""

import os
import asyncio
import logging
import gc
import time
import threading
from collections import defaultdict
from typing import Optional, Dict, Any, Set
from langchain_core.language_models import BaseChatModel

logger = logging.getLogger(__name__)

# ── Resolved model tracking (profile → "provider/model_name") ─────────────────
# Populated by ModelManager.get_model() the first time each profile is resolved.
RESOLVED_MODELS: Dict[str, str] = {}

def get_resolved_models() -> Dict[str, str]:
    """Return which actual model was selected for each profile this session."""
    return dict(RESOLVED_MODELS)


# ── Token tracking ─────────────────────────────────────────────────────────────
TOKEN_STATS: Dict[str, Any] = {
    "calls": 0,
    "prompt_tokens": 0,
    "completion_tokens": 0,
    "total_tokens": 0,
    "by_model": defaultdict(int),   # model → total_tokens
    "by_profile": defaultdict(int), # profile → total_tokens
    "call_log": [],                 # list of {model, profile, prompt, completion, total, elapsed_s}
    "estimated_cost_usd": 0.0,     # cumulative estimated cost
    "cost_by_model": defaultdict(float),  # model → estimated cost
}

# ── Cost per 1M tokens (input, output) — approximate Feb 2026 pricing ─────────
# Free models = 0, Groq = 0 (free tier), OpenAI/paid OpenRouter = actual costs.
# Format: model_substring → (input_cost_per_1M, output_cost_per_1M)
MODEL_COSTS: Dict[str, tuple] = {
    # Free models (OpenRouter :free suffix, Groq)
    ":free":                  (0.0, 0.0),
    "compound-beta":          (0.0, 0.0),        # Groq free (legacy)
    "groq/compound":          (0.0, 0.0),        # Groq compound (web search)
    "groq/compound-mini":     (0.0, 0.0),        # Groq compound mini
    "kimi-k2":                (0.0, 0.0),        # Groq free — Moonshot Kimi K2
    "gpt-oss-120b":           (0.0, 0.0),        # Groq free — OpenAI GPT-OSS 120B
    "gpt-oss-20b":            (0.0, 0.0),        # Groq free — OpenAI GPT-OSS 20B
    "llama-4-maverick":       (0.0, 0.0),        # Groq free — Llama 4 Maverick MoE
    "llama-4-scout":          (0.0, 0.0),        # Groq free — Llama 4 Scout
    "llama-3.1-8b-instant":   (0.0, 0.0),        # Groq free
    "llama-3.3-70b-versatile":(0.0, 0.0),        # Groq free
    # Paid OpenRouter / DeepSeek / xAI
    "grok-4.1-fast":          (0.20, 0.50),       # xAI Grok 4.1 Fast — $0.20/1M in, $0.50/1M out, 2M ctx
    "grok-4.1":               (3.00, 15.00),      # xAI Grok 4.1 — slower, higher quality
    "grok-4-fast":            (0.20, 0.50),       # xAI Grok 4 Fast — $0.20/1M in, $0.50/1M out
    "grok-4":                 (3.00, 15.00),      # xAI Grok 4 — $3.00/1M in, $15/1M out
    "grok-code-fast":         (0.20, 1.50),       # xAI Grok Code Fast — $0.20/1M in, $1.50/1M out
    "grok-3-mini":            (0.30, 0.50),       # xAI Grok 3 Mini — $0.30/1M in, $0.50/1M out
    "grok-3":                 (3.00, 15.00),      # xAI Grok 3 — $3.00/1M in, $15/1M out
    "deepseek-v3.2":          (0.30, 0.88),       # DeepSeek V3.2 — $0.30/1M in, $0.88/1M out
    "minimax-m2.5":           (0.27, 0.95),       # MiniMax M2.5 — $0.27/1M in, $0.95/1M out (paid)
    "minimax-m2.5:free":      (0.0, 0.0),         # MiniMax M2.5 free tier
    "step-3.5-flash":         (0.10, 0.30),       # StepFun Step-3.5 Flash — $0.10/$0.30 per 1M
    "step-3.5-flash:free":    (0.0, 0.0),         # StepFun Step-3.5 Flash free tier
    "qwen3-coder-next":       (0.05, 0.15),       # Qwen3-Coder-Next — $0.05/$0.15 per 1M
    "nemotron-3-nano-30b":    (0.20, 0.20),       # Nvidia Nemotron 3 Nano — paid
    "nemotron-3-super":       (0.0, 0.0),         # Nvidia Nemotron 3 Super 120B free
    "hunter-alpha":           (0.0, 0.0),         # OpenRouter Hunter Alpha free
    "cypher-alpha":           (0.0, 0.0),         # OpenRouter Cypher Alpha free
    "trinity-large":          (0.0, 0.0),         # Arcee Trinity Large free
    "qwen3-next-80b":         (0.0, 0.0),         # Qwen3 Next 80B free
    "glm-4.5-air":            (0.0, 0.0),         # GLM-4.5 Air free
    "deepseek-chat":          (0.14, 0.28),       # DeepSeek V3 base pricing
    "deepseek-chat-v3-0324":  (0.14, 0.28),       # $0.14/1M in, $0.28/1M out
    "deepseek-r1-0528":       (0.55, 2.19),       # $0.55/1M in, $2.19/1M out
    "deepseek-r1":            (0.55, 2.19),       # R1 family
    # Google Gemini
    "gemini-2.0-flash":       (0.10, 0.40),       # $0.10/1M in, $0.40/1M out
    "gemini-2.0-flash-001":   (0.10, 0.40),       # $0.10/1M in, $0.40/1M out
    "gemini-2.5-flash":       (0.15, 0.60),       # $0.15/1M in, $0.60/1M out
    "gemini":                 (0.10, 0.40),       # Gemini family fallback
    # Qwen / Phi / StepFun
    "qwen3-coder":            (0.30, 0.30),       # $0.30/1M in+out
    "qwen":                   (0.0, 0.0),         # Local Ollama qwen
    "phi-4-reasoning-plus":   (0.07, 0.07),       # $0.07/1M
    "phi":                    (0.0, 0.0),         # Local Ollama phi
    # OpenAI
    "gpt-4o-mini":            (0.15, 0.60),       # $0.15/1M in, $0.60/1M out
    "gpt-5-nano":             (0.10, 0.40),       # estimated
    "gpt-4o":                 (2.50, 10.00),      # $2.50/1M in, $10.00/1M out
    # Ollama local
    "ollama":                 (0.0, 0.0),
}


def _estimate_cost(model_name: str, prompt_tokens: int, completion_tokens: int) -> float:
    """Estimate USD cost for a single LLM call based on model pricing."""
    name_lower = model_name.lower()
    # Match longest substring
    best_match = ""
    best_costs = (0.0, 0.0)
    for pattern, costs in MODEL_COSTS.items():
        if pattern in name_lower and len(pattern) > len(best_match):
            best_match = pattern
            best_costs = costs
    # Calculate cost
    input_cost = (prompt_tokens / 1_000_000) * best_costs[0]
    output_cost = (completion_tokens / 1_000_000) * best_costs[1]
    return input_cost + output_cost

# ── Timeout tracking (per session) ────────────────────────────────────────────
TIMEOUT_STATS: Dict[str, int] = {}   # model_key → number of timeouts this session

# ── Per-model timeout overrides (seconds) ─────────────────────────────
# Based on real-world latency data from OpenRouter performance dashboard:
#   deepseek-r1-0528: avg latency 101s, E2E 257s → needs 300s
#   Large MoE (235B, 400B, 480B): cold-start 30-60s + generation → needs 90s
#   Flash / instant / small models: <30s
# Matching is substring-based, longest pattern wins.
MODEL_TIMEOUT_OVERRIDES: Dict[str, int] = {
    # ── Reasoning/thinking models ─────────────────────────────────
    # deepseek-r1-0528: OpenRouter measured avg=101s, E2E=257s (ModelRun provider)
    "deepseek-r1":    300,   # entire R1 family (671B, generates long thinking chains)
    "deepseek/r1":    300,
    "-r1-0528":       300,
    "qwq":            240,   # QwQ-32B: reasoning model, ~120-200s typical
    "-thinking":      180,   # any *-thinking variant (qwen3-vl-thinking, etc.)
    "thinking-2507":  180,   # named thinking releases
    "o1-preview":     240,   # OpenAI o1-preview
    "o1-mini":        180,
    # ── Web search models ───────────────────────────────────────────────
    # groq/compound does live grounded web search — Groq infrastructure can be slow
    "groq/compound":   90,  # Groq compound: web search + synthesis = 45-90s
    "compound-beta":   90,  # legacy name (deprecated)
    "compound-mini":   60,  # Groq compound mini: lighter web search
    # ── Cheap paid models (fast by design) ────────────────────────────
    "gemini-2.0-flash":  30,   # Google Gemini Flash — very fast
    "gemini-2.5-flash":  45,   # Gemini 2.5 Flash — slightly slower

    "grok-4.1-fast":   300,   # xAI Grok 4.1 Fast — 75 tok/s, code gen prompts are large → need 5min
    "grok-code-fast":  300,   # xAI Grok Code Fast — code specialist, same timeout
    "grok-4.1":        180,   # xAI Grok 4.1 — slower but higher quality
    "deepseek-chat":     60,   # DeepSeek Chat v3 — fast normally, cut losses early
    "deepseek-v3":       90,   # S21: reduced from 180→90s — if dead, fail fast to cascade
    "minimax-m2":       120,   # MiniMax M2.5 — 197K ctx, large output, needs time for code gen
    # ── Large MoE models ──────────────────────────────────────────
    # 235B-480B MoE models: routing overhead + generation = 60-90s typical
    "qwen3-coder-next": 60,   # 80B MoE, 3B active — fast but agent-optimized (short bursts)
    "qwen3-coder":     90,   # 480B MoE, 35B active
    "trinity-large":   90,  # 400B MoE, 13B active
    "step-3.5":        75,  # 196B MoE, but "flash"-class fast
    # ── Free OpenRouter alpha models ─────────────────────────────────
    "hunter-alpha":   120,  # 1T params, 26 tps, large agentic prompts need time
    "cypher-alpha":   120,  # cloaked model, unknown speed
    "nemotron-3-super":90,  # 120B MoE, 12B active, 19 tps
    "qwen3-next-80b":  60,  # 80B MoE, 3B active, 36 tps — fast
    "glm-4.5-air":     75,  # MoE, 11 tps
    # ── Groq LPU models (ultra-fast inference) ─────────────────────────
    "kimi-k2":         90,   # Moonshot Kimi K2 — top coder, complex code gen needs time
    "gpt-oss-120b":    90,   # OpenAI GPT-OSS 120B — large model, needs time
    "gpt-oss-20b":     45,   # OpenAI GPT-OSS 20B — smaller, faster
    "llama-4-maverick":60,   # Llama 4 Maverick 17B-128E MoE
    "llama-4-scout":   45,   # Llama 4 Scout 17B-16E MoE
    # ── Standard large models ─────────────────────────────────────────
    "llama-3.3-70b":   50,
    "llama-3.1-70b":   50,
    "qwen3-32b":       50,
    "nemotron-3-nano": 45,
    # ── Small / fast / flash models ───────────────────────────────────
    "trinity-mini":    35,  # 26B MoE, 3B active
    "llama-3.1-8b":    25,
    "gemma2:2b":       20,
    "gemma2-2b":       20,
}


def get_model_health_report() -> Dict[str, Any]:
    """
    Return a structured health report of all models encountered this session.

    Returns a dict with:
      dead        – list of permanent-404 models
      cooling     – list of (model_key, remaining_seconds) still rate-limited
      timed_out   – dict model_key → timeout count
      resolved    – dict profile → "provider/model" actually used
      token_usage – per-model token totals (top 20)
    """
    mgr = _manager  # may be None if manager never initialised
    dead: list = []
    cooling: list = []
    if mgr is not None:
        for key, (error_type, expires_at) in mgr._health_cache.items():
            if error_type == "permanent":
                dead.append(key)
            else:
                remaining = expires_at - time.time()
                if remaining > 0:
                    cooling.append({"model": key, "remaining_s": round(remaining)})
    return {
        "dead": dead,
        "cooling": cooling,
        "timed_out": dict(TIMEOUT_STATS),
        "resolved": dict(RESOLVED_MODELS),
        "token_usage": dict(
            sorted(TOKEN_STATS["by_model"].items(), key=lambda x: -x[1])[:20]
        ),
    }


def get_token_stats() -> Dict[str, Any]:
    """Return a copy of the current token stats."""
    return {
        "calls": TOKEN_STATS["calls"],
        "prompt_tokens": TOKEN_STATS["prompt_tokens"],
        "completion_tokens": TOKEN_STATS["completion_tokens"],
        "total_tokens": TOKEN_STATS["total_tokens"],
        "by_model": dict(TOKEN_STATS["by_model"]),
        "by_profile": dict(TOKEN_STATS["by_profile"]),
        "estimated_cost_usd": TOKEN_STATS.get("estimated_cost_usd", 0.0),
        "cost_by_model": dict(TOKEN_STATS.get("cost_by_model", {})),
    }

def print_token_summary():
    """Print a formatted token-usage summary."""
    s = TOKEN_STATS
    print("\n" + "═" * 60)
    print("  📊  TOKEN USAGE SUMMARY")
    print("═" * 60)
    print(f"  Total calls   : {s['calls']}")
    print(f"  Prompt tokens : {s['prompt_tokens']:,}")
    print(f"  Output tokens : {s['completion_tokens']:,}")
    print(f"  Total tokens  : {s['total_tokens']:,}")
    total_cost = s.get("estimated_cost_usd", 0.0)
    print(f"  Est. cost     : ${total_cost:.4f} USD")
    if s["by_profile"]:
        print("\n  By profile:")
        for profile, n in sorted(s["by_profile"].items(), key=lambda x: -x[1]):
            print(f"    {profile:<12} {n:>8,} tokens")
    if s["by_model"]:
        print("\n  By model (top 10):")
        cost_by_model = s.get("cost_by_model", {})
        for model, n in sorted(s["by_model"].items(), key=lambda x: -x[1])[:10]:
            display = model if len(model) <= 45 else "…" + model[-44:]
            cost = cost_by_model.get(model, 0.0)
            cost_str = f"${cost:.4f}" if cost > 0 else "  free"
            print(f"    {display:<45} {n:>8,} {cost_str}")
    print("═" * 60 + "\n")


def _get_env(key: str, default: str = "") -> str:
    """Get env var without triggering platform detection."""
    return os.environ.get(key, default)


def _env_flag_enabled(value: str, default: bool = False) -> bool:
    """Parse common truthy/falsey env flag values."""
    raw = (value or "").strip().lower()
    if raw in ("1", "true", "yes", "on"):
        return True
    if raw in ("0", "false", "no", "off"):
        return False
    return default


def _local_models_enabled() -> bool:
    """Return whether local Ollama-backed models are allowed for this run."""
    # Explicit kill switch takes priority.
    if _env_flag_enabled(_get_env("AUTOGIT_DISABLE_LOCAL_MODELS", ""), default=False):
        return False
    # Optional positive flag for explicit enable/disable in CI or scripts.
    local_override = _get_env("AUTOGIT_LOCAL_MODELS_ENABLED", "")
    if local_override.strip():
        return _env_flag_enabled(local_override, default=True)
    return True


# ── Groq multi-key pool ────────────────────────────────────────────────────────
# Reads GROQ_API_KEY (primary) + GROQ_API_KEY_1 … GROQ_API_KEY_7 (extra accounts).
# Each key is treated as a separate provider slot (groq_0, groq_1 …) so a 429
# on one key does NOT block the others.
_GROQ_KEY_POOL: list = []

def _init_groq_pool():
    """Populate _GROQ_KEY_POOL from env once at import time."""
    pool = []
    primary = os.environ.get("GROQ_API_KEY", "").strip()
    if primary:
        pool.append(primary)
    for i in range(1, 8):  # GROQ_API_KEY_1 … GROQ_API_KEY_7
        k = os.environ.get(f"GROQ_API_KEY_{i}", "").strip()
        if k and k not in pool:
            pool.append(k)
    _GROQ_KEY_POOL.extend(pool)

_init_groq_pool()


def _build_openrouter_model(model_name: str, temperature: float) -> BaseChatModel:
    """Build model via OpenRouter (OpenAI-compatible, many free models).
    S25: Added per-model max_tokens — without it, OpenRouter uses a low default
    (often 4K) which truncates code generation output.  Real model limits (Mar 2026):
      grok-4.1-fast:  30,000       grok-code-fast:  10,000
      deepseek-v3.2:  65,536       minimax-m2.5:   196,608
      qwen3-coder:   262,144       llama-3.3-70b:   16,384
    """
    from langchain_openai import ChatOpenAI
    # ── Determine max_tokens per model (substring match, longest wins) ─────
    _OR_MAX_TOKENS: dict = {
        "grok-4.1-fast":    30_000,   # xAI cap: 30K output
        "grok-4.1":         30_000,   # same family
        "grok-code-fast":   10_000,   # code specialist cap
        "grok-4-fast":      30_000,
        "grok-4":           30_000,
        "grok-3-mini":      30_000,
        "grok-3":           30_000,
        "deepseek-v3":      65_536,   # DeepSeek V3 / V3.2
        "deepseek-r1":      65_536,
        "deepseek-chat":    65_536,
        "minimax-m2":       65_536,   # MiniMax M2.5 supports up to 65K output
        "qwen3-coder-next":  4_096,   # Qwen3-Coder-Next: only 4K output (agent-optimized, short bursts)
        "qwen3-coder":     131_072,   # Qwen3-Coder (480B) supports 262K output, request 131K
        "step-3.5-flash":  131_072,   # StepFun step-3.5-flash supports 256K output, request 131K
        "llama-3.3-70b":    16_384,   # free tier cap
        "gemini-2.0-flash": 65_536,
        "gemini-2.5-flash": 65_536,
        # ── Free OpenRouter models (Mar 2026) ─────────────────────────
        "hunter-alpha":     32_000,   # 1.05M ctx, 32K max output
        "cypher-alpha":    131_072,   # 1M ctx, ~131K output
        "gpt-oss-120b":    131_072,   # 131K ctx, 131K output (shared with Groq entry)
        "gpt-oss-20b":     131_072,   # 131K ctx, ~131K output
        "nemotron-3-super": 65_536,   # 262K ctx, request 65K to be safe
        "trinity-large":    65_536,   # 131K ctx, supports large output
        "qwen3-next-80b":   65_536,   # 262K ctx, request 65K
        "glm-4.5-air":      65_536,   # 131K ctx, 96K max output
    }
    _name_lower = model_name.lower()
    _best_len, _max_tokens = 0, 32_768  # safe default
    for pattern, mt in _OR_MAX_TOKENS.items():
        if pattern in _name_lower and len(pattern) > _best_len:
            _best_len = len(pattern)
            _max_tokens = mt
    return ChatOpenAI(
        model=model_name,
        temperature=temperature,
        api_key=_get_env("OPENROUTER_API_KEY"),
        base_url="https://openrouter.ai/api/v1",
        max_tokens=_max_tokens,
        default_headers={
            "HTTP-Referer": "https://github.com/auto-git",
            "X-Title": "Auto-GIT",
        },
    )


def _build_openai_model(model_name: str, temperature: float) -> BaseChatModel:
    """Build OpenAI model (gpt-5-nano etc) — used only as paid fallback."""
    from langchain_openai import ChatOpenAI
    return ChatOpenAI(
        model=model_name,
        temperature=temperature,
        api_key=_get_env("OPENAI_API_KEY"),
        # No max_tokens cap — gpt-5-nano supports 400K output natively
    )


def _build_groq_model(model_name: str, temperature: float, key_index: int = 0) -> BaseChatModel:
    """Build Groq model using the key at key_index in _GROQ_KEY_POOL.
    Per-model max_tokens to avoid 400 errors from Groq API.
    """
    from langchain_groq import ChatGroq
    api_key = _GROQ_KEY_POOL[key_index] if key_index < len(_GROQ_KEY_POOL) else (
        _GROQ_KEY_POOL[0] if _GROQ_KEY_POOL else _get_env("GROQ_API_KEY")
    )
    # Per-model max_tokens limits (Groq enforces hard caps per model).
    # S25: Verified against Groq docs (console.groq.com/docs/models), Mar 2026.
    #   compound/compound-mini: 8,192
    #   llama-3.1-8b-instant:   8,192
    #   llama-4-scout:          8,192
    #   llama-4-maverick:       8,192
    #   kimi-k2:               16,384
    #   gpt-oss-120b / 20b:   65,536  (highest on Groq!)
    #   qwen3-32b:             32,768
    #   llama-3.3-70b:         32,768
    _name_lower = model_name.lower()
    if any(s in _name_lower for s in ("compound", "llama-3.1-8b", "llama-4-scout", "llama-4-maverick")):
        max_tokens = 8192
    elif any(s in _name_lower for s in ("kimi-k2",)):
        max_tokens = 16_384
    elif any(s in _name_lower for s in ("gpt-oss",)):
        max_tokens = 65_536   # gpt-oss-120b and gpt-oss-20b both support 65K output
    else:
        # qwen3-32b, llama-3.3-70b-versatile etc — 32K
        max_tokens = 32_768
    return ChatGroq(
        model=model_name,
        temperature=temperature,
        api_key=api_key,
        max_tokens=max_tokens,
    )


def _build_ollama_model(model_name: str, temperature: float, base_url: str) -> BaseChatModel:
    """Build Ollama local model (last resort fallback)."""
    from langchain_ollama import ChatOllama
    return ChatOllama(
        model=model_name,
        temperature=temperature,
        base_url=base_url,
        num_ctx=32_768,    # raised from 2048 — needed to fit large code prompts
        num_predict=8_192, # raised from 1024 — allows full file generation
    )


class ModelManager:
    """
    Smart model manager with health cache, per-call timeout, and token tracking.

    Resolution order per profile (v2 — Groq first for speed):
      Groq (fast, reliable) → OpenRouter free → OpenAI gpt-5-nano (paid) → Ollama

    Health cache:
      - 404 (endpoint not found) → skip for the rest of the session  (permanent)
      - 429 (rate limited)       → skip for RATE_LIMIT_COOLDOWN seconds
      - Other retryable errors   → skip for RATE_LIMIT_COOLDOWN seconds

    Per-call timeout: CALL_TIMEOUT_S seconds (skip slow models)

    Profiles:
      fast      - cheap/quick tasks (extraction, validation)
      balanced  - most pipeline tasks (debate, critique, problem extraction)
      powerful  - code generation, architecture design
      reasoning - deep analysis, consensus scoring
    """

    CALL_TIMEOUT_S = 300           # S24: Raised 120→300 — DeepSeek R1 p99 is 257s,
                                   # large code gen prompts take 90-180s. 120s caused intermittent timeouts.
    RATE_LIMIT_COOLDOWN = 60       # BASE cooldown for first 429 (seconds)
    RATE_LIMIT_MAX_COOLDOWN = 600  # max cooldown after repeated 429s (10 min)

    # Circuit breaker: if N+ models from the same provider fail with connection errors
    # within CIRCUIT_BREAKER_WINDOW seconds, skip ALL remaining models from that provider.
    CIRCUIT_BREAKER_THRESHOLD = 2   # 2 connection errors → skip the provider
    CIRCUIT_BREAKER_WINDOW = 120    # 2-minute window
    CIRCUIT_BREAKER_COOLDOWN = 300  # skip provider for 5 minutes

    # ── Candidate lists ───────────────────────────────────────────────────────
    # Priority strategy (Mar 2026 — GROK 4.1 FAST PRIMARY):
    #   • ALL profiles → x-ai/grok-4.1-fast FIRST via OpenRouter
    #     ($0.20/1M in, $0.50/1M out, 2M context, ~75 tok/s)
    #   • Groq LPU as FAST FALLBACK (free tier, multi-key pool)
    #   • OpenRouter free/paid as SECONDARY FALLBACK
    #   • OpenAI / Ollama as last resort
    #
    # Why Grok 4.1 Fast:
    #   - 2M context window (fits entire codebases)
    #   - Very cheap ($0.20/1M in, $0.50/1M out)
    #   - Fast inference (~75 tok/s)
    #   - Top-tier code generation quality
    #
    # Also available on OpenRouter:
    #   x-ai/grok-4.1-fast   — $0.20/$0.50, 2M ctx (PRIMARY)
    #   x-ai/grok-4           — $3.00/$15.00, 256K ctx (heavy reasoning)
    #   minimax/minimax-m2.5  — $0.27/$0.95, 197K ctx, 65K output
    #   stepfun/step-3.5-flash:free — FREE, 256K ctx, 256K output!
    #   qwen/qwen3-coder-next — $0.05/$0.15, 262K ctx, 4K output (agent-optimized)
    #   x-ai/grok-3-mini      — $0.30/$0.50, 131K ctx (cheap reasoning)
    CLOUD_CONFIGS = {
        # ── fast: simple extraction, validation, consensus scoring ────────────
        # Want: quick turnaround. Free OpenRouter models first, paid for testing.
        "fast": [
            # PRIMARY — Free OpenRouter (rotate across models to avoid 20 RPM cap)
            ("openrouter",      "stepfun/step-3.5-flash:free",               0.4),  # 256K ctx, 54 tps, 2.64% tool err — BEST agentic
            ("openrouter",      "openai/gpt-oss-120b:free",                  0.4),  # 131K ctx, 81 tps — fastest free model
            ("openrouter",      "qwen/qwen3-next-80b-a3b-instruct:free",     0.4),  # 262K ctx, 36 tps, 1.99% tool err — lowest errors
            # SECONDARY — Groq LPU (free, ultra-fast)
            ("groq",            "llama-3.1-8b-instant",                      0.4),  # 8B, blazing fast
            ("groq",            "qwen/qwen3-32b",                            0.4),  # 32B, great quality
            ("groq",            "llama-3.3-70b-versatile",                   0.4),  # 70B backup
            # PAID FALLBACK (testing only — set OPENROUTER_PAID=true)
            ("openrouter_paid", "x-ai/grok-4.1-fast",                        0.4),  # 2M ctx, $0.20/1M in
            ("openrouter_paid", "deepseek/deepseek-v3.2",                    0.4),
            ("openai",          "gpt-4o-mini",                               0.4),
            ("ollama",          "gemma2:2b",                                 0.4),
        ],
        # ── balanced: problem extraction, solution gen, most nodes ────────────
        # Quality matters — free models first, rotate to stay under rate limits.
        "balanced": [
            # PRIMARY — Free OpenRouter (best quality free models)
            ("openrouter",      "stepfun/step-3.5-flash:free",               0.7),  # 256K ctx, 90th pctile agentic
            ("openrouter",      "openai/gpt-oss-120b:free",                  0.7),  # 131K ctx, native tools + reasoning
            ("openrouter",      "nvidia/nemotron-3-super-120b-a12b:free",    0.7),  # 262K ctx, GPQA 80%, strong reasoning
            ("openrouter",      "openrouter/hunter-alpha",                   0.7),  # 1M ctx, frontier agentic model
            ("openrouter",      "qwen/qwen3-next-80b-a3b-instruct:free",     0.7),  # 262K ctx, lowest tool error
            # SECONDARY — Groq LPU (free)
            ("groq",            "qwen/qwen3-32b",                            0.7),  # 32B, excellent quality
            ("groq",            "llama-3.3-70b-versatile",                   0.7),  # 70B, reliable
            ("groq",            "moonshotai/kimi-k2-instruct",               0.7),  # Kimi K2, top coder
            # PAID FALLBACK (testing only)
            ("openrouter_paid", "x-ai/grok-4.1-fast",                        0.7),  # 2M ctx, top quality
            ("openrouter_paid", "minimax/minimax-m2.5",                      0.7),
            ("openai",          "gpt-4o-mini",                               0.7),
            ("ollama",          "phi4-mini:3.8b",                            0.7),
        ],
        # ── powerful: code generation, architecture design ────────────────────
        # S24: Temperature 0.3 for code generation — lower temp = more deterministic.
        # Free coding specialists first, paid models as fallback for testing.
        "powerful": [
            # PRIMARY — Free OpenRouter (coding specialists)
            ("openrouter",      "qwen/qwen3-coder:free",                     0.3),  # 480B MoE, purpose-built coder, 262K ctx
            ("openrouter",      "stepfun/step-3.5-flash:free",               0.3),  # 256K ctx, 90th pctile agentic, huge output
            ("openrouter",      "openrouter/hunter-alpha",                   0.3),  # 1M ctx — fits entire codebases
            ("openrouter",      "openai/gpt-oss-120b:free",                  0.3),  # 131K ctx, native function calling
            ("openrouter",      "nvidia/nemotron-3-super-120b-a12b:free",    0.3),  # 262K ctx, strong coding (81st pctile)
            ("openrouter",      "arcee-ai/trinity-large-preview:free",       0.3),  # 131K ctx, 400B MoE, 2.92% tool err
            # SECONDARY — Groq LPU (free)
            ("groq",            "moonshotai/kimi-k2-instruct",               0.3),  # Kimi K2 — top coding benchmarks
            ("groq",            "qwen/qwen3-32b",                            0.3),  # 32B, fast + quality
            ("groq",            "llama-3.3-70b-versatile",                   0.3),  # 70B workhorse
            # PAID FALLBACK (testing only)
            ("openrouter_paid", "x-ai/grok-4.1-fast",                        0.3),  # 2M ctx, 30K output, top-tier coder
            ("openrouter_paid", "minimax/minimax-m2.5",                      0.3),
            ("openrouter_paid", "qwen/qwen3-coder-next",                     0.3),
            ("openai",          "gpt-4o-mini",                               0.3),
            ("ollama",          "qwen2.5-coder:7b",                          0.3),
        ],
        # ── reasoning: critique, debate, consensus ────────────────────────────
        # Deep reasoning — free reasoning specialists first.
        "reasoning": [
            # PRIMARY — Free OpenRouter (reasoning specialists)
            ("openrouter",      "nvidia/nemotron-3-super-120b-a12b:free",    0.8),  # 262K ctx, GPQA 80% — best free reasoning
            ("openrouter",      "deepseek/deepseek-r1-0528:free",            0.8),  # 163K ctx, on par with o1 — pure reasoning
            ("openrouter",      "arcee-ai/trinity-large-preview:free",       0.8),  # 131K ctx, reasoning_details, 2.92% tool err
            ("openrouter",      "stepfun/step-3.5-flash:free",               0.8),  # 256K ctx, reasoning tokens, 84th pctile
            ("openrouter",      "openai/gpt-oss-120b:free",                  0.8),  # 131K ctx, configurable reasoning depth
            ("openrouter",      "openrouter/hunter-alpha",                   0.8),  # 1M ctx, reasoning_details
            # SECONDARY — Groq LPU (free)
            ("groq",            "moonshotai/kimi-k2-instruct-0905",          0.8),  # 262K ctx, strong reasoning
            ("groq",            "qwen/qwen3-32b",                            0.8),  # 32B, solid reasoning
            ("groq",            "llama-3.3-70b-versatile",                   0.8),  # 70B, reliable
            # PAID FALLBACK (testing only)
            ("openrouter_paid", "x-ai/grok-4.1-fast",                        0.8),  # 2M ctx, strong reasoner
            ("openrouter_paid", "deepseek/deepseek-r1-0528",                 0.8),
            ("openai",          "gpt-4o-mini",                               0.8),
            ("ollama",          "phi4-mini:3.8b",                            0.8),
        ],
        # ── research: SOTA web-grounded research ─────────────────────────────
        # Groq compound has built-in web search; free models for synthesis.
        "research": [
            # PRIMARY — Groq compound (live web search)
            ("groq",            "groq/compound",                             0.3),  # live web search
            # SECONDARY — Free OpenRouter (synthesis + long context)
            ("openrouter",      "openrouter/hunter-alpha",                   0.5),  # 1M ctx — fits entire research corpus
            ("openrouter",      "stepfun/step-3.5-flash:free",               0.5),  # 256K ctx, great synthesis
            ("openrouter",      "openai/gpt-oss-120b:free",                  0.5),  # 131K ctx, fast synthesis
            ("openrouter",      "nvidia/nemotron-3-super-120b-a12b:free",    0.5),  # 262K ctx, strong reasoning
            # TERTIARY — Groq LPU (free)
            ("groq",            "qwen/qwen3-32b",                            0.5),  # synthesis
            ("groq",            "llama-3.3-70b-versatile",                   0.5),  # 70B backup
            # PAID FALLBACK (testing only)
            ("openrouter_paid", "x-ai/grok-4.1-fast",                        0.5),  # 2M ctx, great synthesis
            ("openrouter_paid", "deepseek/deepseek-v3.2",                    0.5),
            ("openai",          "gpt-4o-mini",                               0.5),
            ("ollama",          "phi4-mini:3.8b",                            0.5),
        ],
    }

    def __init__(self, base_url: str = "http://localhost:11434"):
        self.base_url = base_url
        self._cache: Dict[str, BaseChatModel] = {}
        self._client_cache: Dict[tuple, BaseChatModel] = {}
        self._active_provider: Optional[str] = None

        # Health cache: model_key → (error_type, expires_at)
        # error_type: "permanent" (404) or "temporary" (429)
        self._health_cache: Dict[str, tuple] = {}
        self._health_lock = threading.Lock()  # async-safe via GIL + lock

        # Progressive backoff: model_key → consecutive 429 count
        # Used to compute exponential cooldown: BASE * 2^(count-1), capped at MAX
        self._rate_limit_strikes: Dict[str, int] = {}

        # Circuit breaker: provider_base → list of failure timestamps
        self._provider_failures: Dict[str, list] = defaultdict(list)
        # provider_base → expires_at (when the circuit breaker resets)
        self._provider_tripped: Dict[str, float] = {}

        # ── Round-robin rotation counter (per profile) ────────────────────────
        # Free models are rate-limited at 20 RPM / 200 RPD each.
        # Instead of always hitting model[0] until 429, we rotate the start
        # index so calls are spread evenly: call1→A, call2→B, call3→C, ...
        # This is proactive — we avoid 429s altogether instead of reacting.
        self._rotation_counter: Dict[str, int] = defaultdict(int)
        self._rotation_lock = threading.Lock()

        openrouter_key  = bool(_get_env("OPENROUTER_API_KEY"))
        openai_key      = bool(_get_env("OPENAI_API_KEY"))
        groq_pool_size  = len(_GROQ_KEY_POOL)
        paid_enabled    = _get_env("OPENROUTER_PAID", "").lower() in ("true", "1", "yes")

        # ── Expand Groq entries: one slot per key in the pool ─────────────────
        # Original config has ("groq", model, temp) entries.
        # We expand each into ("groq_0", model, temp), ("groq_1", model, temp) …
        # so each key has its own health-cache slot.  A 429 on key-0 won't block key-1.
        expanded: dict = {}
        for profile, candidates in self.CLOUD_CONFIGS.items():
            new_candidates = []
            for provider, model_name, temperature in candidates:
                if provider == "groq":
                    if groq_pool_size == 0:
                        continue  # no keys at all — skip
                    for ki in range(groq_pool_size):
                        new_candidates.append((f"groq_{ki}", model_name, temperature))
                elif provider == "openrouter_paid":
                    if paid_enabled and openrouter_key:
                        new_candidates.append(("openrouter", model_name, temperature))
                    # else skip — paid model, user hasn't opted in
                else:
                    new_candidates.append((provider, model_name, temperature))
            expanded[profile] = new_candidates
        # Replace class-level config with expanded per-instance copy
        self.CLOUD_CONFIGS = expanded

        logger.info("Model Manager v4 (multi-key Groq + paid OR opt-in + health cache) initialized")
        logger.info(f"  OpenRouter: {'✅ PRIMARY (27+ free models)' if openrouter_key else '❌ add OPENROUTER_API_KEY → https://openrouter.ai/settings/keys'}")
        logger.info(f"  Groq pool:  {'✅ ' + str(groq_pool_size) + ' key(s) (compound-beta web search + fast fallback)' if groq_pool_size else '❌ add GROQ_API_KEY → https://console.groq.com/keys'}")
        logger.info(f"  OR Paid:    {'✅ enabled (OPENROUTER_PAID=true)' if paid_enabled else '⚪ disabled — set OPENROUTER_PAID=true to unlock cheap paid models'}")
        logger.info(f"  OpenAI:     {'✅ (paid last-resort)' if openai_key else '⚪ not set (optional)'}")
        logger.info(f"  Local LLMs: {'✅ enabled' if _local_models_enabled() else '⛔ disabled (AUTOGIT_DISABLE_LOCAL_MODELS=true)'}")

    def _model_key(self, provider: str, model_name: str) -> str:
        return f"{provider}/{model_name}"

    def _provider_base(self, provider: str) -> str:
        """Extract base provider name: 'groq_2' → 'groq', 'openrouter' → 'openrouter'."""
        if provider.startswith("groq_"):
            return "groq"  # all groq keys share same infrastructure
        if provider == "openrouter_paid":
            return "openrouter"  # same API endpoint
        return provider

    def _is_provider_tripped(self, provider: str) -> bool:
        """Return True if the circuit breaker has tripped for this provider."""
        base = self._provider_base(provider)
        if base not in self._provider_tripped:
            return False
        if time.time() >= self._provider_tripped[base]:
            del self._provider_tripped[base]
            self._provider_failures.pop(base, None)
            logger.info(f"  🔄 Circuit breaker reset for {base}")
            return False
        return True

    def _record_provider_failure(self, provider: str, is_connection_error: bool):
        """Record a connection failure and trip circuit breaker if threshold reached."""
        if not is_connection_error:
            return
        base = self._provider_base(provider)
        now = time.time()
        # Prune old failures outside the window
        self._provider_failures[base] = [
            t for t in self._provider_failures[base]
            if now - t < self.CIRCUIT_BREAKER_WINDOW
        ]
        self._provider_failures[base].append(now)
        if len(self._provider_failures[base]) >= self.CIRCUIT_BREAKER_THRESHOLD:
            self._provider_tripped[base] = now + self.CIRCUIT_BREAKER_COOLDOWN
            logger.warning(
                f"  ⚡ Circuit breaker TRIPPED for {base} — "
                f"skipping all {base} models for {self.CIRCUIT_BREAKER_COOLDOWN}s"
            )

    def _is_healthy(self, provider: str, model_name: str) -> bool:
        """Return True if the model is not currently blacklisted."""
        # Circuit breaker check: skip entire provider if tripped
        if self._is_provider_tripped(provider):
            return False
        key = self._model_key(provider, model_name)
        with self._health_lock:
            if key not in self._health_cache:
                return True
            error_type, expires_at = self._health_cache[key]
            if error_type == "permanent":
                return False   # 404 — never retry
            if time.time() < expires_at:
                return False   # still in cooldown
            # Cooldown expired — remove from cache (but keep strike count
            # so next 429 gets longer cooldown via progressive backoff)
            del self._health_cache[key]
            return True

    def _mark_dead(self, provider: str, model_name: str, is_permanent: bool):
        """Mark a model as temporarily or permanently unavailable.

        For temporary (429) errors, uses progressive backoff:
          1st hit → 60s, 2nd → 120s, 3rd → 240s, 4th → 480s, cap at 600s.
        This prevents the thrashing pattern where a model is retried after
        60s cooldown and immediately 429s again.
        """
        key = self._model_key(provider, model_name)
        with self._health_lock:
            if is_permanent:
                self._health_cache[key] = ("permanent", float("inf"))
                logger.warning(f"  🚫 [{key}] marked DEAD (404, will skip forever this session)")
            else:
                # Progressive backoff: double cooldown on each successive 429
                strikes = self._rate_limit_strikes.get(key, 0) + 1
                self._rate_limit_strikes[key] = strikes
                cooldown = min(
                    self.RATE_LIMIT_COOLDOWN * (2 ** (strikes - 1)),
                    self.RATE_LIMIT_MAX_COOLDOWN,
                )
                expires_at = time.time() + cooldown
                self._health_cache[key] = ("temporary", expires_at)
                logger.info(
                    f"  ⏳ [{key}] rate-limited, cooling down {cooldown:.0f}s "
                    f"(strike {strikes}, next={min(cooldown*2, self.RATE_LIMIT_MAX_COOLDOWN):.0f}s)"
                )

    def _get_model_timeout(self, model_name: str) -> int:
        """
        Return the per-model timeout in seconds.

        Uses MODEL_TIMEOUT_OVERRIDES (module-level dict) with substring matching.
        Longest matching pattern wins; falls back to CALL_TIMEOUT_S if no match.

        Examples
        --------
        deepseek-r1-0528:free  → 300s  (real E2E latency ~257s per OpenRouter)
        qwen3-235b-a22b:free   →  90s  (large MoE, cold start)
        step-3.5-flash:free    →  75s
        llama-3.1-8b-instant   →  25s
        nvidia/nemotron-3-nano →  45s
        """
        name_lower = model_name.lower()
        best_len = 0
        best_timeout = self.CALL_TIMEOUT_S
        for pattern, timeout in MODEL_TIMEOUT_OVERRIDES.items():
            if pattern in name_lower and len(pattern) > best_len:
                best_len = len(pattern)
                best_timeout = timeout
        return best_timeout

    def get_model(self, profile: str = "balanced") -> BaseChatModel:
        """Return best available model for the given profile.

        Uses round-robin rotation so free models (20 RPM each) don't get hammered.
        Each call picks the next healthy model in the rotation.
        """
        if profile not in self.CLOUD_CONFIGS:
            logger.warning(f"Unknown profile '{profile}', using 'balanced'")
            profile = "balanced"
        candidates = self.CLOUD_CONFIGS[profile]
        if not candidates:
            raise RuntimeError(f"No candidates for profile '{profile}'")

        # Round-robin: rotate start index each call to spread load
        n = len(candidates)
        with self._rotation_lock:
            start_idx = self._rotation_counter[profile] % n
            self._rotation_counter[profile] += 1

        for i in range(n):
            idx = (start_idx + i) % n
            provider, model_name, temperature = candidates[idx]
            if not self._has_key(provider):
                continue
            if not self._is_healthy(provider, model_name):
                continue
            try:
                logger.info(f"Loading [{profile}] via {provider}: {model_name}")
                llm = self._build(provider, model_name, temperature)
                self._active_provider = provider
                RESOLVED_MODELS[profile] = f"{provider}/{model_name}"
                logger.info(f"  ✅ [{profile}] → {provider}/{model_name}")
                return llm
            except Exception as e:
                logger.warning(f"  ⚠️ {provider}/{model_name} failed: {e}, trying next...")
                continue
        raise RuntimeError(
            f"No LLM available for profile '{profile}'. "
            "Add GROQ_API_KEY (free!) to .env: https://console.groq.com/keys"
        )

    def get_fast_model(self) -> BaseChatModel:
        return self.get_model("fast")

    def get_balanced_model(self) -> BaseChatModel:
        return self.get_model("balanced")

    def get_powerful_model(self) -> BaseChatModel:
        return self.get_model("powerful")

    def get_reasoning_model(self) -> BaseChatModel:
        return self.get_model("reasoning")

    def clear(self):
        """Clear model cache and free memory."""
        self._cache.clear()
        self._client_cache.clear()
        self._active_provider = None
        gc.collect()
        logger.info("Model cache cleared")

    def get_current_info(self) -> Dict[str, str]:
        """Get info about active provider."""
        return {
            "active_provider": self._active_provider or "none",
            "cached_profiles": list(self._cache.keys()),
            "dead_models": [k for k, (t, _) in self._health_cache.items() if t == "permanent"],
            "cooling_models": [k for k, (t, _) in self._health_cache.items() if t == "temporary"],
        }

    def _has_key(self, provider: str) -> bool:
        if provider in ("openrouter", "openrouter_paid"):
            return bool(_get_env("OPENROUTER_API_KEY"))
        if provider == "openai":
            return bool(_get_env("OPENAI_API_KEY"))
        if provider == "groq" or provider.startswith("groq_"):
            return bool(_GROQ_KEY_POOL)  # True if any key in pool
        return _local_models_enabled()  # ollama - optional via env gate

    def _build(self, provider: str, model_name: str, temperature: float) -> BaseChatModel:
        cache_key = (provider, model_name, float(temperature))
        if cache_key in self._client_cache:
            return self._client_cache[cache_key]

        if provider in ("openrouter", "openrouter_paid"):
            llm = _build_openrouter_model(model_name, temperature)
        elif provider == "openai":
            llm = _build_openai_model(model_name, temperature)
        elif provider == "groq":
            llm = _build_groq_model(model_name, temperature, key_index=0)
        elif provider.startswith("groq_"):
            # groq_0, groq_1, groq_2 … — extract key index
            try:
                ki = int(provider.split("_", 1)[1])
            except (IndexError, ValueError):
                ki = 0
            llm = _build_groq_model(model_name, temperature, key_index=ki)
        else:
            if not _local_models_enabled():
                raise RuntimeError("Local models are disabled via AUTOGIT_DISABLE_LOCAL_MODELS")
            llm = _build_ollama_model(model_name, temperature, self.base_url)

        self._client_cache[cache_key] = llm
        return llm

    def get_fallback_llm(self, profile: str = "balanced") -> "FallbackLLM":
        """Return a FallbackLLM that retries the full candidate list at call-time."""
        if profile not in self.CLOUD_CONFIGS:
            profile = "balanced"
        return FallbackLLM(self, profile)


def _is_retryable(exc: Exception) -> bool:
    """Return True if this is a skip-and-retry error (rate limit, quota, 404, etc.)."""
    msg = str(exc).lower()
    return any(s in msg for s in [
        "413", "429", "402", "404", "500", "524", "503", "502", "529",
        "rate limit", "rate_limit", "ratelimit",
        "data policy", "spend limit", "temporarily",
        "request too large", "payload too large", "context too long", "context length",
        "quota", "too many requests", "overloaded",
        "timeout", "timed out", "context deadline",
        "no endpoints found",
        "internal server error", "server error",
        "decommissioned", "deprecated", "no longer supported",
        "connection error", "connection reset", "connection refused",
        "connectionerror", "remotedisconnected", "broken pipe",
        "network", "ssl", "eof occurred",
        "bad gateway", "service unavailable",
        "unauthorized", "401",
    ])

def _is_permanent_error(exc: Exception) -> bool:
    """Return True if this is a permanent 'model does not exist' error (404)."""
    msg = str(exc).lower()
    return any(s in msg for s in ["404", "no endpoints found", "model not found"])


class FallbackLLM:
    """
    Inference-time fallback wrapper with health cache, timeout, and token tracking.

    - Skips permanently dead models (404) forever
    - Skips rate-limited models for RATE_LIMIT_COOLDOWN seconds
    - Times out slow models after CALL_TIMEOUT_S seconds
    - Accumulates token usage in global TOKEN_STATS
    """

    def __init__(self, manager: "ModelManager", profile: str):
        self.manager = manager
        self.profile = profile

    async def ainvoke(self, messages, **kwargs):
        # ── Per-call timeout override ────────────────────────────────────────
        # Callers can pass timeout=240 to override model-specific timeouts.
        # This is essential for large prompts (architect_spec, code_gen) where
        # the default 120s is insufficient.
        _caller_timeout = kwargs.pop("timeout", None)

        candidates = self.manager.CLOUD_CONFIGS.get(self.profile, [])
        last_exc: Optional[Exception] = None
        t0_total = time.time()

        # Prompt-size aware cascade budgeting (Phase 2): avoid expensive
        # full-chain retries for very large prompts.
        def _estimate_messages_size(msgs) -> int:
            total = 0
            if not isinstance(msgs, (list, tuple)):
                return 0
            for m in msgs:
                content = getattr(m, "content", "") if m is not None else ""
                if isinstance(content, str):
                    total += len(content)
                else:
                    total += len(str(content))
            return total

        _msg_chars = _estimate_messages_size(messages)
        _large_prompt = _msg_chars >= 100_000
        _max_models_to_try = 6 if _large_prompt else 12
        _timed_out_provider_bases: Set[str] = set()

        # ── Round-robin: rotate start index to spread load across free models ─
        # Each free model has 20 RPM / 200 RPD. Without rotation, model[0]
        # gets ALL calls until 429 → stall. With rotation, call N starts at
        # candidate[N % len], spreading load evenly.
        n_candidates = len(candidates)
        with self.manager._rotation_lock:
            start_idx = self.manager._rotation_counter[self.profile] % max(n_candidates, 1)
            self.manager._rotation_counter[self.profile] += 1

        # ── Max consecutive timeout limit ────────────────────────────────────
        # If N models timeout in a row on the same prompt, the prompt is too
        # big/complex for any model in the chain.  Stop wasting time.
        MAX_CONSECUTIVE_TIMEOUTS = 3
        # FIX S21: Session-level timeout skip — if a model has timed out 3+
        # times across the entire session, skip it entirely on future calls
        # instead of wasting another 60-120s each time.
        SESSION_TIMEOUT_SKIP_THRESHOLD = 3
        _consecutive_timeouts = 0

        # Outer retry loop: if ALL models fail with network errors, wait and retry
        for _network_attempt in range(3):
            if _network_attempt > 0:
                wait = 30 * _network_attempt
                logger.warning(
                    f"  🌐 Network error on all models, waiting {wait}s before retry "
                    f"{_network_attempt}/2..."
                )
                await asyncio.sleep(wait)

            _all_network = True   # flip to False if any non-network error occurs
            _models_tried_this_attempt = 0
            # Iterate from rotated start position, wrapping around
            for i in range(n_candidates):
                idx = (start_idx + i) % n_candidates
                provider, model_name, temperature = candidates[idx]
                provider_base = self.manager._provider_base(provider)

                if _models_tried_this_attempt >= _max_models_to_try:
                    logger.warning(
                        f"  🧭 [{self.profile}] reached model-attempt budget "
                        f"({_max_models_to_try}) for this call; stopping cascade"
                    )
                    break

                # For very large prompts, skip provider families that already
                # timed out in this call to prevent repeated long stalls.
                if _large_prompt and provider_base in _timed_out_provider_bases:
                    logger.debug(
                        f"  ⏭️ [{self.profile}] skipping {provider}/{model_name} "
                        f"(provider {provider_base} timed out earlier in this call)"
                    )
                    continue

                if not self.manager._has_key(provider):
                    continue
                if not self.manager._is_healthy(provider, model_name):
                    continue

                # ── FIX S21: Skip models that repeatedly timeout ─────────
                _mkey_check = self.manager._model_key(provider, model_name)
                _session_timeouts = TIMEOUT_STATS.get(_mkey_check, 0)
                if _session_timeouts >= SESSION_TIMEOUT_SKIP_THRESHOLD:
                    logger.debug(
                        f"  ⏭️ [{self.profile}] skipping {provider}/{model_name} "
                        f"({_session_timeouts} session timeouts)"
                    )
                    continue

                # ── Stop cascade if too many consecutive timeouts ────────
                if _consecutive_timeouts >= MAX_CONSECUTIVE_TIMEOUTS:
                    logger.warning(
                        f"  🛑 [{self.profile}] {_consecutive_timeouts} consecutive "
                        f"timeouts — prompt likely too large for remaining models, "
                        f"stopping fallback cascade"
                    )
                    break

                t0 = time.time()
                try:
                    logger.debug(f"  [{self.profile}] trying {provider}/{model_name}…")
                    _models_tried_this_attempt += 1
                    llm = self.manager._build(provider, model_name, temperature)

                    # Per-model dynamic timeout (reasoning models need 300s, flash need 25s)
                    # Caller override takes precedence if provided.
                    _timeout = _caller_timeout or self.manager._get_model_timeout(model_name)
                    response = await asyncio.wait_for(
                        llm.ainvoke(messages, **kwargs),
                        timeout=_timeout,
                    )
                    elapsed = time.time() - t0

                    # ── Token tracking ───────────────────────────────────
                    _track_tokens(provider, model_name, self.profile, response, elapsed)

                    # ── Track resolved model ─────────────────────────────
                    is_first_call = self.profile not in RESOLVED_MODELS
                    RESOLVED_MODELS[self.profile] = f"{provider}/{model_name}"
                    if is_first_call:
                        try:
                            from rich.console import Console as _RichConsole
                            _RichConsole().print(
                                f"  [dim]🤖 [{self.profile}] → [bold]{provider}/{model_name}[/bold][/dim]"
                            )
                        except Exception:
                            pass
                    # ── Empty response guard ─────────────────────────────
                    # Free-tier models sometimes return 200 OK with empty content.
                    # Treat as failure and try the next model in the cascade.
                    content = getattr(response, "content", None) or ""
                    if isinstance(content, str) and len(content.strip()) < 10:
                        logger.warning(
                            f"  ⚠️ [{self.profile}] {provider}/{model_name} returned "
                            f"empty/trivial response ({len(content)} chars), trying next"
                        )
                        last_exc = RuntimeError(f"{provider}/{model_name} returned empty response")
                        _all_network = False
                        continue

                    logger.info(f"  ✅ [{self.profile}] {provider}/{model_name} ({elapsed:.1f}s)")
                    _consecutive_timeouts = 0  # reset on success
                    return response

                except asyncio.TimeoutError:
                    elapsed = time.time() - t0
                    _timeout_used = _caller_timeout or self.manager._get_model_timeout(model_name)
                    _consecutive_timeouts += 1
                    logger.warning(
                        f"  ⏱️ [{self.profile}] {provider}/{model_name} timed out after "
                        f"{elapsed:.0f}s (limit={_timeout_used}s), skipping "
                        f"[cascade {_consecutive_timeouts}/{MAX_CONSECUTIVE_TIMEOUTS}]"
                    )
                    _mkey = self.manager._model_key(provider, model_name)
                    TIMEOUT_STATS[_mkey] = TIMEOUT_STATS.get(_mkey, 0) + 1
                    _timed_out_provider_bases.add(provider_base)
                    # Treat timeout as temporary health failure to avoid immediate re-hit
                    # in subsequent calls, and feed provider circuit breaker to prevent
                    # long-node stalls on repeatedly slow backends.
                    self.manager._mark_dead(provider, model_name, is_permanent=False)
                    self.manager._record_provider_failure(provider, is_connection_error=True)
                    last_exc = asyncio.TimeoutError(f"{provider}/{model_name} timed out")
                    _all_network = False
                    continue

                except Exception as exc:
                    if _is_retryable(exc):
                        is_perm = _is_permanent_error(exc)
                        self.manager._mark_dead(provider, model_name, is_permanent=is_perm)
                        # Check if this is a connection-level error → feed circuit breaker
                        _is_conn = any(s in str(exc).lower() for s in
                                       ["connection", "network", "ssl", "remotedisconnected",
                                        "broken pipe", "eof", "503", "502"])
                        self.manager._record_provider_failure(provider, _is_conn)
                        logger.warning(
                            f"  ⚠️ [{self.profile}] {provider}/{model_name} skipped "
                            f"({'dead' if is_perm else '429/net'}: {str(exc)[:70]})"
                        )
                        last_exc = exc
                        if not _is_conn:
                            _all_network = False
                        continue
                    raise  # hard non-retryable error — propagate

            # All candidates exhausted — only retry outer loop on pure network failure
            if not _all_network or last_exc is None:
                break

        raise RuntimeError(
            f"All models for profile '{self.profile}' exhausted after "
            f"{time.time()-t0_total:.1f}s. Last error: {last_exc}"
        )


def _track_tokens(provider: str, model_name: str, profile: str, response, elapsed: float):
    """Extract and accumulate token usage from an LLM response."""
    try:
        usage = {}
        # LangChain stores usage in different places depending on provider
        if hasattr(response, "usage_metadata") and response.usage_metadata:
            um = response.usage_metadata
            # LangChain v0.3+ UsageMetadata is a TypedDict (plain dict),
            # older versions were dataclass objects — handle both
            if isinstance(um, dict):
                usage = {
                    "prompt_tokens":     um.get("input_tokens",  0) or 0,
                    "completion_tokens": um.get("output_tokens", 0) or 0,
                    "total_tokens":      um.get("total_tokens",  0) or 0,
                }
            else:
                usage = {
                    "prompt_tokens":     getattr(um, "input_tokens",  0) or 0,
                    "completion_tokens": getattr(um, "output_tokens", 0) or 0,
                    "total_tokens":      getattr(um, "total_tokens",  0) or 0,
                }
        elif hasattr(response, "response_metadata"):
            rm = response.response_metadata or {}
            tu = rm.get("token_usage") or rm.get("usage") or {}
            if isinstance(tu, dict):
                usage = {
                    "prompt_tokens":     tu.get("prompt_tokens",     tu.get("input_tokens",  0)),
                    "completion_tokens": tu.get("completion_tokens", tu.get("output_tokens", 0)),
                    "total_tokens":      tu.get("total_tokens",      0),
                }

        pt = usage.get("prompt_tokens", 0) or 0
        ct = usage.get("completion_tokens", 0) or 0
        tt = usage.get("total_tokens", 0) or (pt + ct)

        TOKEN_STATS["calls"] += 1
        TOKEN_STATS["prompt_tokens"] += pt
        TOKEN_STATS["completion_tokens"] += ct
        TOKEN_STATS["total_tokens"] += tt
        TOKEN_STATS["by_model"][f"{provider}/{model_name}"] += tt
        TOKEN_STATS["by_profile"][profile] += tt
        # Cost tracking
        cost = _estimate_cost(model_name, pt, ct)
        TOKEN_STATS["estimated_cost_usd"] += cost
        TOKEN_STATS["cost_by_model"][f"{provider}/{model_name}"] += cost
        TOKEN_STATS["call_log"].append({
            "model": f"{provider}/{model_name}",
            "profile": profile,
            "prompt_tokens": pt,
            "completion_tokens": ct,
            "total_tokens": tt,
            "elapsed_s": round(elapsed, 2),
            "cost_usd": round(cost, 6),
        })
    except Exception:
        # Never crash the pipeline due to tracking
        TOKEN_STATS["calls"] += 1


# ── Singleton ──────────────────────────────────────────────────────────────

_manager: Optional[ModelManager] = None


def get_profile_primary(profile: str) -> str:
    """Return a short label showing the first available candidate for a profile."""
    configs = ModelManager.CLOUD_CONFIGS.get(profile, [])
    openrouter_key = bool(os.environ.get("OPENROUTER_API_KEY"))
    openai_key     = bool(os.environ.get("OPENAI_API_KEY"))
    groq_key       = bool(_GROQ_KEY_POOL)
    paid_enabled   = os.environ.get("OPENROUTER_PAID", "").lower() in ("true", "1", "yes")
    def _has(prov):
        if prov == "openrouter":    return openrouter_key
        if prov == "openrouter_paid": return openrouter_key and paid_enabled
        if prov == "openai":        return openai_key
        if prov == "groq" or prov.startswith("groq_"): return groq_key
        return True
    for provider, model_name, _ in configs:
        if _has(provider):
            return f"{provider}/{model_name}"
    return "(no model available)"


def get_model_manager() -> ModelManager:
    """Return the global ModelManager singleton."""
    global _manager
    if _manager is None:
        _manager = ModelManager()
    return _manager


def get_fallback_llm(profile: str = "balanced") -> "FallbackLLM":
    """
    Return a FallbackLLM for the given profile.

    Retries ALL candidate models at inference time on rate-limit / quota / 404
    errors. Dead models are cached in the session health cache so they're not
    retried on subsequent calls.
    """
    return get_model_manager().get_fallback_llm(profile)


# Re-export for convenience
__all__ = [
    "get_model_manager",
    "get_fallback_llm",
    "get_resolved_models",
    "get_profile_primary",
    "get_token_stats",
    "get_model_health_report",
    "print_token_summary",
    "TOKEN_STATS",
    "TIMEOUT_STATS",
]
