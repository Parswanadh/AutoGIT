"""TDD for fanout_limiter — caps 6."""
from src.utils.fanout_limiter import (
    FANOUT_CAP,
    cap_fanout,
    apply_fanout_caps,
    limit_roles,
)


def test_cap_is_6():
    assert FANOUT_CAP == 6
    assert cap_fanout([1] * 6) == [1] * 6  # exactly cap not trimmed
    assert len(cap_fanout(list(range(10)))) == 6
    assert cap_fanout(list(range(3))) == list(range(3))


def test_cap_fanout_custom_cap():
    assert cap_fanout(list(range(10)), cap=3) == [0, 1, 2]
    assert cap_fanout([], cap=6) == []
    # non-list passthrough
    assert cap_fanout("notalist") == "notalist"  # type: ignore


def test_apply_fanout_caps_perspectives():
    state = {"perspectives": list(range(10)), "dynamic_perspective_configs": list(range(7)), "spawned_agent_roles": list(range(8))}
    updates = apply_fanout_caps(state, "solution_generation")
    assert len(updates["perspectives"]) == 6
    assert len(updates["dynamic_perspective_configs"]) == 6
    assert len(updates["spawned_agent_roles"]) == 6
    assert "policy_events" in updates
    assert "warnings" in updates
    assert any(e["event"] == "fanout_capped" for e in updates["policy_events"])


def test_apply_no_cap_when_under():
    state = {"perspectives": [1, 2, 3]}
    assert apply_fanout_caps(state, "generate_perspectives") == {}
    state2 = {}
    assert apply_fanout_caps(state2, "critique") == {}


def test_limit_roles_alias():
    assert limit_roles(list(range(10))) == list(range(6))
    assert limit_roles([1, 2]) == [1, 2]


def test_no_new_deps():
    txt = open("src/utils/fanout_limiter.py").read()
    assert "FANOUT_CAP" in txt
    assert "6" in txt
    for bad in ["import httpx", "import requests"]:
        assert bad not in txt
