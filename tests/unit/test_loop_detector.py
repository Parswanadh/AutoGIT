"""TDD for loop_detector — frequency + fingerprints + hard_limit."""
from src.utils.loop_detector import LoopDetector, LOOP_HARD_LIMITS, DEFAULT_HARD_LIMIT, get_loop_detector


def test_frequency_increments():
    ld = LoopDetector(hard_limits={"a": 2})
    assert ld.record_node_visit("a") is None
    assert ld.counts["a"] == 1
    assert ld.record_node_visit("a") is None
    assert ld.counts["a"] == 2
    msg = ld.record_node_visit("a")
    assert msg is not None and "hard_limit" in msg
    assert ld.is_hard_limit() is True


def test_default_hard_limit_20():
    assert DEFAULT_HARD_LIMIT == 20
    ld = LoopDetector()
    for _ in range(20):
        assert ld.record_node_visit("unknown_node") is None
    assert ld.record_node_visit("unknown_node") is not None


def test_hard_limits_match_workflow():
    # must mirror workflow_enhanced limits
    assert LOOP_HARD_LIMITS["code_fixing"] == 14
    assert LOOP_HARD_LIMITS["consensus_check"] == 10
    assert LOOP_HARD_LIMITS["solution_generation"] == 8


def test_fingerprint_oscillation():
    ld = LoopDetector(repeat_threshold=4)
    node = "code_fixing"
    fp = "abc123"
    # 3 repeats not yet hard_limit
    for _ in range(3):
        assert ld.record_fingerprint(fp, node) is None
    # 4th triggers
    msg = ld.record_fingerprint(fp, node)
    assert msg is not None and "hard_limit" in msg
    assert ld.state == "hard_limit"


def test_fingerprint_no_oscillation_for_non_candidate():
    ld = LoopDetector(repeat_threshold=4)
    fp = "xyz"
    for _ in range(5):
        # node not in oscillation_nodes => never trips on repeats
        assert ld.record_fingerprint(fp, "research") is None
    assert ld.state == "clean"


def test_record_combined():
    ld = LoopDetector(hard_limits={"code_fixing": 2})
    r1 = ld.record("code_fixing", "fp1")
    assert r1["state"] == "clean"
    r2 = ld.record("code_fixing", "fp1")
    assert r2["state"] == "clean"
    r3 = ld.record("code_fixing", "fp1")
    assert r3["state"] == "hard_limit"
    assert "hard_limit" in (r3["warning"] or "")


def test_get_loop_detector_singleton():
    a = get_loop_detector()
    b = get_loop_detector()
    assert a is b
    a.reset()
    assert a.state == "clean"
    assert a.counts == {}


def test_no_new_deps():
    txt = open("src/utils/loop_detector.py").read()
    assert "hard_limit" in txt
    assert "frequency" in txt or "counts" in txt
    assert "fingerprint" in txt
    for bad in ["import httpx", "import requests"]:
        assert bad not in txt
