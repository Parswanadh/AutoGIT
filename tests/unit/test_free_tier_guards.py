"""Free-tier guards — yaml no paid when FREE_ONLY, MODEL_COSTS free, cost 0 ox-alpha, gate intact."""
import os
import importlib
import pathlib
import yaml
import pytest
import src.utils.model_manager as mm

# ponytail: allowlist samples — all must be :free suffix and predicate True
ALLOWLIST_FREE = [
    "qwen/qwen3-coder:free",
    "stealth/ox-alpha:free",
    "xiaomi/mimo-v2-flash:free",
    "mistralai/devstral-2512:free",
    "deepseek/deepseek-r1-0528:free",
    "google/gemini-2.0-flash-exp:free",
    "meta-llama/llama-3.3-70b-instruct:free",
]

def test_yaml_no_paid_models_when_free_only():
    p = pathlib.Path("config/model_backends.yaml")
    assert p.exists()
    data = yaml.safe_load(p.read_text())
    mbs = data.get("model_backends", {})
    # openrouter must be all :free when FREE_ONLY
    for name in [m.get("name","") for m in mbs.get("openrouter",{}).get("models",[])]:
        assert ":free" in name, f"openrouter paid leaked in yaml: {name}"
        assert mm._is_free_model(name), f"predicate failed for {name}"
    # also ensure filtered ModelManager with FREE_ONLY has no paid leakage
    env = {"AUTOGIT_FREE_ONLY":"true","AUTOGIT_OX_ALPHA_ONLY":"false","OPENROUTER_API_KEY":"sk-or-test","OPENROUTER_PAID":"true","OPENAI_API_KEY":"sk-test","GROQ_API_KEY":"gsk_test"}
    old = {k: os.environ.get(k) for k in env}
    try:
        for k,v in env.items(): os.environ[k]=v
        mm._GROQ_KEY_POOL.clear(); mm._manager=None; mm._init_groq_pool()
        importlib.reload(mm)
        mm._GROQ_KEY_POOL.clear(); mm._init_groq_pool()
        m = mm.ModelManager()
        for profile, cands in m.CLOUD_CONFIGS.items():
            for provider, name, _ in cands:
                assert provider != "openai", f"paid provider leaked {profile}/{name}"
                assert provider != "openrouter_paid"
                if provider.startswith("groq") or provider=="ollama":
                    continue
                assert mm._is_free_model(name), f"non-free {name} in {profile} when FREE_ONLY"
    finally:
        for k,v in old.items():
            if v is None: os.environ.pop(k,None)
            else: os.environ[k]=v
        mm._GROQ_KEY_POOL.clear(); mm._manager=None; mm._init_groq_pool()
        importlib.reload(mm); mm._GROQ_KEY_POOL.clear(); mm._init_groq_pool()

def test_model_costs_free_predicate():
    # :free always free, paid never
    assert mm._is_free_model("qwen/qwen3-coder:free") is True
    assert mm._is_free_model("stealth/ox-alpha:free") is True
    assert mm._is_free_model("openrouter/hunter-alpha") is True  # allowlist without :free
    assert mm._is_free_model("x-ai/grok-4.1-fast") is False
    assert mm._is_free_model("openai/gpt-4o-mini") is False
    # MODEL_COSTS entries for :free must be 0
    assert mm.MODEL_COSTS.get(":free") == (0.0, 0.0)
    assert mm.MODEL_COSTS.get("stealth/ox-alpha:free") == (0.0, 0.0)

def test_cost_zero_for_ox_alpha():
    assert mm.MODEL_COSTS.get("stealth/ox-alpha:free") == (0.0, 0.0)
    assert mm.MODEL_COSTS.get("ox-alpha:free") == (0.0, 0.0)
    assert mm._estimate_cost("stealth/ox-alpha:free", 1000, 1000) == 0.0
    assert mm._estimate_cost("stealth/ox-alpha:free", 100000, 50000) == 0.0
    # also ox-alpha variants free
    assert mm._estimate_cost("stealth/ox-alpha", 1000, 1000) == 0.0

def test_allowlist_free_suffix():
    for name in ALLOWLIST_FREE:
        assert ":free" in name, f"allowlist sample missing :free suffix: {name}"
        assert mm._is_free_model(name), f"allowlist {name} not free"
    # ox-alpha must be 0 cost; other :free models predicate true already checked
    assert mm._estimate_cost("stealth/ox-alpha:free", 1000, 1000) == 0.0
    # generic :free pattern implies unknown :free model cost 0 via longest-match fallback
    assert mm._estimate_cost("unknown/model:free", 1000, 1000) == 0.0

def test_free_gate_still_passes():
    # delegate to existing guard — ensures no regression
    import tests.unit.test_free_gate as fg
    fg.test_is_free_predicate()
    fg.test_stealth_ox_alpha_exists_in_cloud_configs()
    fg.test_model_backends_yaml_has_ox_alpha()
    # run free_only guard inline clone to ensure green
    fg.test_free_gate_only_free_models()
