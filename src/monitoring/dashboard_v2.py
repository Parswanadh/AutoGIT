"""Dashboard v2 — refactoring of dashboard.py to return {"html":..., "json": metrics}.

Chart points capped 100, errors top5, OOM-safe deque.
"""
from __future__ import annotations

from collections import deque
from typing import Any, Dict

from src.monitoring.dashboard_data import DashboardData, get_dashboard_data

# ponytail: OOM-safe deques, bounded history
chart_history: deque = deque(maxlen=100)  # capped 100
error_history: deque = deque(maxlen=500)  # keep last 500 errors (top5 exposed)


def _cap_chart(points: Any) -> list:
    if not isinstance(points, list):
        return []
    return points[-100:]  # capped 100


def _top5(errors: Any) -> Dict[str, Any]:
    if not isinstance(errors, dict):
        return {}
    return dict(sorted(errors.items(), key=lambda x: -x[1])[:5])


def _build_html(metrics: Dict[str, Any]) -> str:
    # ponytail: stdlib html, no template dep
    tokens = metrics.get("tokens", {})
    cost = metrics.get("cost", {})
    latency = metrics.get("latency", {})
    success = metrics.get("success", {})
    quota = metrics.get("quota", {})
    total = tokens.get("total_tokens", 0)
    est = cost.get("estimated_usd", 0.0)
    wall = latency.get("total_wall_s", 0)
    rate = success.get("success_rate", 0)
    rem = quota.get("remaining", "?")
    lim = quota.get("limit", "?")
    # minimal html, OOM-safe (no large loops)
    nodes = latency.get("nodes", {}) if isinstance(latency.get("nodes"), dict) else {}
    # cap node rows to avoid huge html
    node_rows = ""
    for n, v in list(nodes.items())[:50]:
        node_rows += f"<tr><td>{n}</td><td>{v.get('total_s',0)}</td><td>{v.get('calls',0)}</td></tr>"
    errs = _top5(success.get("most_common_errors", {}))
    err_rows = "".join(f"<tr><td>{k}</td><td>{v}</td></tr>" for k, v in errs.items())
    chart_n = len(latency.get("chart_points", []) or [])
    return (
        f"<html><head><title>Auto-GIT Dashboard</title></head><body>"
        f"<h1>Auto-GIT Dashboard</h1>"
        f"<p>Tokens: {total} | Cost: ${est:.4f} | Latency: {wall}s | Success: {rate:.1f}% | Quota: {rem}/{lim}</p>"
        f"<p>Chart points: {chart_n}/100</p>"
        f"<h2>Nodes</h2><table>{node_rows}</table>"
        f"<h2>Errors Top5</h2><table>{err_rows}</table>"
        f"</body></html>"
    )


def get_dashboard(tracer: Any = None, collector: Any = None, quota_obj: Any = None) -> Dict[str, Any]:
    """Return {"html": str, "json": DashboardData dict} with caps applied."""
    data: DashboardData = get_dashboard_data(tracer=tracer, collector=collector, quota_obj=quota_obj)
    j = data.to_dict()

    # chart points capped 100, OOM-safe deque
    try:
        pts = j.get("latency", {}).get("chart_points", [])
        capped = _cap_chart(pts)
        j["latency"]["chart_points"] = capped
        # push to bounded history (enforces OOM-safe)
        chart_history.extend(capped[-100:])
        # ensure json reflects capped history
        j["latency"]["chart_points"] = list(chart_history)[-100:] if len(chart_history) > 0 else capped
        if len(j["latency"]["chart_points"]) > 100:
            j["latency"]["chart_points"] = j["latency"]["chart_points"][-100:]
    except Exception:
        try:
            j.setdefault("latency", {})["chart_points"] = []
        except Exception:
            pass

    # errors top5
    try:
        succ = j.get("success", {})
        errs = succ.get("most_common_errors", {})
        top = _top5(errs)
        succ["most_common_errors"] = top
        succ["errors_top5"] = top
        # OOM-safe error history
        for k, v in top.items():
            error_history.append((k, v))
    except Exception:
        pass

    html = _build_html(j)
    return {"html": html, "json": j}


# aliases ponytail: support multiple import names expected by tests/TUI
render_dashboard = get_dashboard
build_dashboard = get_dashboard
dashboard = get_dashboard


if __name__ == "__main__":
    # ponytail: self-check
    res = get_dashboard()
    assert "html" in res and "json" in res
    assert isinstance(res["html"], str)
    assert isinstance(res["json"], dict)
    assert "tokens" in res["json"]
    assert "cost" in res["json"]
    assert "latency" in res["json"]
    assert "success" in res["json"]
    assert "quota" in res["json"]
    assert len(res["json"]["latency"].get("chart_points", [])) <= 100
    errs = res["json"]["success"].get("most_common_errors", {})
    assert len(errs) <= 5
    assert chart_history.maxlen == 100
    assert error_history.maxlen == 500
    # html contains title
    assert "Dashboard" in res["html"]
    print("dashboard_v2 self-check ok")
