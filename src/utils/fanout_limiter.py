"""fanout_limiter — caps parallel delegation, stdlib only."""

from typing import Any, Dict, List

FANOUT_CAP = 6
DEFAULT_CAP = 6
CAP = 6
MAX_FANOUT = 6


def cap_fanout(items: List[Any], cap: int = FANOUT_CAP) -> List[Any]:
    """Cap list to at most cap items (default 6)."""
    if not isinstance(items, list):
        return items  # type: ignore[return-value]
    return items[:cap] if len(items) > cap else items


def apply_fanout_caps(state: Dict[str, Any], node_name: str, cap: int = FANOUT_CAP) -> Dict[str, Any]:
    """Clamp fan-out fields in state for given node.

    Caps perspectives, dynamic_perspective_configs, spawned_agent_roles to 6.
    Returns dict of updates (empty if no capping needed).
    """
    if cap <= 0:
        return {}
    updates: Dict[str, Any] = {}
    events: List[Dict[str, Any]] = []
    for field in ("perspectives", "dynamic_perspective_configs", "spawned_agent_roles"):
        val = state.get(field)
        if isinstance(val, list) and len(val) > cap:
            updates[field] = val[:cap]
            events.append({"event": "fanout_capped", "node": node_name, "field": field, "original": len(val), "cap": cap})
    if events:
        updates["policy_events"] = events
        updates["warnings"] = [f"Fan-out cap applied at {node_name}: max {cap} parallel delegates"]
    return updates


def limit_roles(roles: List[Any], cap: int = FANOUT_CAP) -> List[Any]:
    """Alias for cap_fanout."""
    return cap_fanout(roles, cap=cap)
