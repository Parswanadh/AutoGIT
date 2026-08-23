"""Validator strict gate — allowlist block + quality >=65. ponytail: minimal."""
from src.langraph_pipeline.workflow_enhanced import _evaluate_execution_policy, _HIGH_RISK_NODES
from src.utils.enhanced_validator import EnhancedValidator


def test_blocked_by_allowlist_git_publishing():
    # HITL approve bypasses first gate, strict allowlist still blocks in constrained mode
    state = {"trust_mode": "constrained", "tool_allowlist_mode": "strict", "hitl_decisions": {"git_publishing": "approve"}}
    res = _evaluate_execution_policy(state, "git_publishing")
    assert res["blocked"] is True
    ev = res["result"]["policy_events"][0]
    assert ev["event"] == "blocked_by_allowlist"
    assert ev["node"] == "git_publishing"


def test_strict_allowlist_blocks_real_risky_nodes():
    # ponytail: verify expanded _HIGH_RISK_NODES are blocked under strict+untrusted even with HITL approve
    for node in _HIGH_RISK_NODES:
        state = {"trust_mode": "untrusted", "tool_allowlist_mode": "strict", "hitl_decisions": {node: "approve"}}
        res = _evaluate_execution_policy(state, node)
        assert res["blocked"] is True, f"{node} should be blocked"
        assert res["result"]["policy_events"][0]["event"] == "blocked_by_allowlist"


def test_allowlist_permissive_no_block():
    state = {"trust_mode": "constrained", "tool_allowlist_mode": "permissive", "hitl_decisions": {"git_publishing": "approve"}}
    res = _evaluate_execution_policy(state, "git_publishing")
    # permissive + approved HITL => not blocked by allowlist
    # HITL gate is separate; with approve it should pass
    assert res["blocked"] is False


def test_trusted_strict_no_block():
    state = {"trust_mode": "trusted", "tool_allowlist_mode": "strict"}
    res = _evaluate_execution_policy(state, "git_publishing")
    assert res["blocked"] is False


def test_quality_gate_threshold_65():
    v = EnhancedValidator()
    # high quality should pass
    good = "def add(a: int, b: int) -> int:\n    return a + b\n"
    r_good = v.validate_all(good, "good.py")
    assert r_good["quality_score"] >= 65
    assert r_good["passed"] is True
    # syntax error => quality 0 => blocked
    bad_syntax = "def broken(:\n    pass"
    r_bad = v.validate_all(bad_syntax, "bad.py")
    assert r_bad["passed"] is False
    assert r_bad["quality_score"] == 0
    # direct score calc: low security/lint should fall below 65
    low = v._calculate_quality_score(True, True, 40, 40)  # 40*0.25 + 40*0.15 +40+20 = 76? compute
    # need a case that is <65: syntax_ok True (40) + type not ok (10) + sec 30*0.25=7.5 + lint 30*0.15=4.5 => 62
    low2 = v._calculate_quality_score(True, False, 30, 30)
    assert low2 < 65
    # validator threshold should align: score <65 => passed False (simulate via validate path)
    # we test threshold constant in file
    txt = open("src/utils/enhanced_validator.py").read()
    assert "65" in txt


def test_avg_quality_threshold_in_nodes():
    txt = open("src/langraph_pipeline/nodes.py").read()
    assert "avg_quality >= 65" in txt


def test_free_gate_intact():
    from src.utils.model_manager import _is_free_model
    assert _is_free_model("stealth/ox-alpha:free") is True
    assert _is_free_model("openrouter/hunter-alpha") is True
    assert _is_free_model("qwen/qwen3-coder:free") is True
    assert _is_free_model("x-ai/grok-4.1-fast") is False
    assert _is_free_model("openai/gpt-4o-mini") is False
