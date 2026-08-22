"""TDD for free-gate ox-alpha exclusive filter - must FAIL before fix."""
import os
import importlib
import pytest

# Ponytail: minimal tests for free gate
OX_MODEL = "stealth/ox-alpha:free"

def _reload_manager(env_overrides: dict):
    """Reload model_manager with fresh env."""
    # stash
    old = {k: os.environ.get(k) for k in env_overrides}
    old_manager = None
    import src.utils.model_manager as mm
    # need to capture old _manager singleton and _GROQ_KEY_POOL
    try:
        for k,v in env_overrides.items():
            if v is None:
                os.environ.pop(k, None)
            else:
                os.environ[k] = v
        # reset groq pool and manager singleton
        mm._GROQ_KEY_POOL.clear()
        mm._manager = None
        mm.RESOLVED_MODELS.clear()
        # re-init pool
        mm._init_groq_pool()
        importlib.reload(mm)
        # reimport after reload
        import src.utils.model_manager as mm2
        mm2._GROQ_KEY_POOL.clear()
        mm2._manager = None
        # set pool again
        mm2._init_groq_pool()
        return mm2
    finally:
        # caller will cleanup; we keep env as overridden for test
        pass

def test_stealth_ox_alpha_exists_in_cloud_configs():
    import src.utils.model_manager as mm
    # after reload default, check presence
    configs = mm.ModelManager.CLOUD_CONFIGS
    # should have ox_alpha_exclusive profile or stealth model somewhere
    found = False
    for profile, cands in configs.items():
        for _, name, _ in cands:
            if name == OX_MODEL:
                found = True
    assert found, f"{OX_MODEL} not found in CLOUD_CONFIGS"

def test_is_free_predicate():
    import src.utils.model_manager as mm
    # must expose _is_free_model or is_free or FREE_ALLOWLIST predicate
    func = getattr(mm, "_is_free_model", None) or getattr(mm, "is_free_model", None) or getattr(mm, "_is_free", None)
    assert func is not None, "free predicate missing (_is_free_model)"
    assert func("stealth/ox-alpha:free") == True
    assert func("qwen/qwen3-coder:free") == True
    assert func("x-ai/grok-4.1-fast") == False, "paid model should be not free"
    assert func("openai/gpt-4o-mini") == False
    # hunter-alpha is free allowlist even without :free
    assert func("openrouter/hunter-alpha") == True

def test_free_gate_only_free_models():
    # set AUTOGIT_FREE_ONLY=true
    env = {
        "AUTOGIT_FREE_ONLY": "true",
        "AUTOGIT_OX_ALPHA_ONLY": "false",
        "OPENROUTER_API_KEY": "sk-or-test",
        "OPENROUTER_PAID": "true",
        "OPENAI_API_KEY": "sk-test",
        "GROQ_API_KEY": "gsk_test",
    }
    old = {k: os.environ.get(k) for k in env}
    import src.utils.model_manager as mm
    try:
        for k,v in env.items():
            os.environ[k]=v
        mm._GROQ_KEY_POOL.clear()
        mm._manager=None
        mm._init_groq_pool()
        importlib.reload(mm)
        mm._GROQ_KEY_POOL.clear()
        mm._init_groq_pool()
        # need to re-check free_gate
        # create manager
        m = mm.ModelManager()
        # all candidates across profiles must be free
        is_free = getattr(mm, "_is_free_model", None) or getattr(mm, "is_free_model", None)
        assert is_free is not None
        for profile, cands in m.CLOUD_CONFIGS.items():
            for provider, name, _ in cands:
                # openai provider should never appear when free_only
                assert provider != "openai", f"paid provider openai leaked in {profile}/{name} when FREE_ONLY"
                assert provider != "openrouter_paid", f"paid provider openrouter_paid leaked in {profile}/{name}"
                # model must be free
                # groq models are considered free via allowlist or provider
                # check: either is_free true or provider groq_*
                is_groq = provider.startswith("groq")
                is_ollama = provider == "ollama"
                # ollama is local free, allowed
                if is_groq or is_ollama:
                    continue
                assert is_free(name), f"non-free model {name} leaked in {profile} when FREE_ONLY"
        # also verify get_fallback_llm candidates same?
        # verify helper exposed
        assert hasattr(mm, "is_free_gate_enabled") or hasattr(mm, "_is_free_gate_enabled") or hasattr(mm, "free_gate_enabled"), "free_gate_enabled not exposed"
        # verify cost 0: check MODEL_COSTS for ox-alpha is 0
        assert mm.MODEL_COSTS.get("stealth/ox-alpha:free") == (0.0, 0.0) or "ox-alpha" in str(mm.MODEL_COSTS) or mm._estimate_cost("stealth/ox-alpha:free", 1000, 1000) == 0.0
    finally:
        for k,v in old.items():
            if v is None:
                os.environ.pop(k,None)
            else:
                os.environ[k]=v
        mm._GROQ_KEY_POOL.clear()
        mm._manager=None
        mm._init_groq_pool()
        importlib.reload(mm)
        mm._GROQ_KEY_POOL.clear()
        mm._init_groq_pool()

def test_ox_alpha_only_exclusive():
    env = {
        "AUTOGIT_OX_ALPHA_ONLY": "true",
        "AUTOGIT_FREE_ONLY": "false",
        "OPENROUTER_API_KEY": "sk-or-test",
        "OPENROUTER_PAID": "true",
        "OPENAI_API_KEY": "sk-test",
        "GROQ_API_KEY": "gsk_test",
    }
    old = {k: os.environ.get(k) for k in env}
    import src.utils.model_manager as mm
    try:
        for k,v in env.items():
            os.environ[k]=v
        mm._GROQ_KEY_POOL.clear()
        mm._manager=None
        mm._init_groq_pool()
        importlib.reload(mm)
        mm._GROQ_KEY_POOL.clear()
        mm._init_groq_pool()
        m = mm.ModelManager()
        for profile, cands in m.CLOUD_CONFIGS.items():
            for provider, name, _ in cands:
                assert name == OX_MODEL, f"OX_ALPHA_ONLY should only allow {OX_MODEL}, got {name} in {profile}"
                assert ":free" in name
        # also check that free gate enabled is true
        fn = getattr(mm, "is_free_gate_enabled", None) or getattr(mm, "_is_free_gate_enabled", None)
        if fn:
            assert fn() == True
        elif hasattr(mm, "free_gate_enabled"):
            assert bool(mm.free_gate_enabled) == True
    finally:
        for k,v in old.items():
            if v is None:
                os.environ.pop(k,None)
            else:
                os.environ[k]=v
        mm._GROQ_KEY_POOL.clear()
        mm._manager=None
        mm._init_groq_pool()
        importlib.reload(mm)
        mm._GROQ_KEY_POOL.clear()
        mm._init_groq_pool()

def test_no_paid_fallback_even_with_paid_enabled():
    env = {
        "AUTOGIT_FREE_ONLY": "true",
        "OPENROUTER_API_KEY": "sk-or-test",
        "OPENROUTER_PAID": "true",
        "OPENAI_API_KEY": "sk-test",
        "GROQ_API_KEY": "gsk_test",
        "AUTOGIT_OX_ALPHA_ONLY": "false",
    }
    old = {k: os.environ.get(k) for k in env}
    import src.utils.model_manager as mm
    try:
        for k,v in env.items():
            os.environ[k]=v
        mm._GROQ_KEY_POOL.clear()
        mm._manager=None
        mm._init_groq_pool()
        importlib.reload(mm)
        mm._GROQ_KEY_POOL.clear()
        mm._init_groq_pool()
        m = mm.ModelManager()
        # simulate FallbackLLM candidate iteration - ensure no paid
        for profile in ["fast","balanced","powerful","reasoning","research","ox_alpha_exclusive"]:
            if profile not in m.CLOUD_CONFIGS:
                continue
            for provider, name, _ in m.CLOUD_CONFIGS[profile]:
                assert "grok-4.1-fast" not in name.lower() or ":free" in name, f"paid fallback leaked {name}"
                assert "deepseek" not in name.lower() or ":free" in name, f"paid deepseek leaked {name}"
                assert "gpt-4o-mini" not in name
    finally:
        for k,v in old.items():
            if v is None:
                os.environ.pop(k,None)
            else:
                os.environ[k]=v
        mm._GROQ_KEY_POOL.clear()
        mm._manager=None
        mm._init_groq_pool()
        importlib.reload(mm)
        mm._GROQ_KEY_POOL.clear()
        mm._init_groq_pool()

def test_model_backends_yaml_has_ox_alpha():
    import yaml, pathlib
    p = pathlib.Path("config/model_backends.yaml")
    assert p.exists()
    data = yaml.safe_load(p.read_text())
    # search for stealth/ox-alpha:free anywhere
    txt = p.read_text()
    assert "stealth/ox-alpha:free" in txt, "config/model_backends.yaml must contain stealth/ox-alpha:free"
    # also check openrouter models include ox-alpha
    openrouter_models = data.get("model_backends", {}).get("openrouter", {}).get("models", [])
    names = [m.get("name") for m in openrouter_models]
    assert "stealth/ox-alpha:free" in names, "openrouter models must list stealth/ox-alpha:free"

