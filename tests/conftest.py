"""Shared test harness — FakeLLM, make_state, patch_get_llm, isolate_api_usage."""
import os
import pytest

# ponytail: reuse langchain FakeListChatModel, stdlib only, no new deps
try:
    from langchain_core.language_models import FakeListChatModel as _BaseFake
except ImportError:
    from langchain_core.language_models.fake_chat_models import FakeListChatModel as _BaseFake  # type: ignore


class FakeLLM(_BaseFake):
    """FakeListChatModel style — cycle through `responses` strings.

    Example: FakeLLM(responses=['{"a":1}', '{"b":2}'])
    Each invoke/ainvoke returns next AIMessage content.
    """
    pass


def make_state(idea: str = "test idea", **overrides):
    """Create AutoGITState via create_initial_state, with overrides."""
    from src.langraph_pipeline.state import create_initial_state

    state = create_initial_state(idea=idea)
    # allow caller to override any key
    for k, v in overrides.items():
        state[k] = v  # type: ignore
    return state


@pytest.fixture
def patch_get_llm(monkeypatch):
    """Monkeypatch get_llm / get_fallback_llm to return a FakeLLM.

    Usage:
        def test_foo(patch_get_llm):
            patch_get_llm.responses = ['{"project_type": "cli_tool"}']
    """
    fake = FakeLLM(responses=['{"ok": true}'])
    # ponytail: patch both nodes.get_llm and model_manager.get_fallback_llm; add more if import paths diverge
    targets = [
        "src.langraph_pipeline.nodes.get_llm",
        "src.langraph_pipeline.nodes.get_fallback_llm",
        "src.utils.model_manager.get_fallback_llm",
        "src.utils.model_manager.get_llm",
    ]
    for t in targets:
        try:
            monkeypatch.setattr(t, lambda *a, **k: fake)
        except AttributeError:
            # target not present in this version — skip
            pass
    # also patch get_model_manager().get_fallback_llm if accessed via instance
    try:
        import src.utils.model_manager as mm

        orig_gmm = mm.get_model_manager

        def _fake_gmm(*a, **k):
            m = orig_gmm(*a, **k) if callable(orig_gmm) else None
            # monkeypatch instance method to return fake
            if m is not None:
                monkeypatch.setattr(m, "get_fallback_llm", lambda *a, **k: fake)
            return m

        # only patch if needed; simpler: patch mm.ModelManager.get_fallback_llm
        monkeypatch.setattr(mm.ModelManager, "get_fallback_llm", lambda self, *a, **k: fake)
    except Exception:
        pass
    return fake


@pytest.fixture
def isolate_api_usage(tmp_path, monkeypatch):
    """Isolate FREE_TIER_USAGE_FILE to tmp_path/api_usage.json.

    Patches env var and FreeTierOptimizer singleton so no real
    data/api_usage.json is touched during tests.
    """
    usage_file = tmp_path / "api_usage.json"
    monkeypatch.setenv("FREE_TIER_USAGE_FILE", str(usage_file))
    # ponytail: make FreeTierOptimizer respect env var if caller passes no explicit path
    try:
        import src.llm.free_tier_optimizer as fto

        fto._optimizer_instance = None
        _orig_init = fto.FreeTierOptimizer.__init__

        def _patched_init(self, usage_file=None):  # type: ignore
            if usage_file is None:
                usage_file = os.getenv("FREE_TIER_USAGE_FILE", "./data/api_usage.json")
            return _orig_init(self, usage_file=usage_file)

        monkeypatch.setattr(fto.FreeTierOptimizer, "__init__", _patched_init)
    except Exception:
        pass
    yield usage_file
    # cleanup singleton so next test gets fresh instance
    try:
        import src.llm.free_tier_optimizer as fto

        fto._optimizer_instance = None
    except Exception:
        pass
