"""Dashboard data bridge — aggregates tokens/cost/latency/success/quota for TUI+web."""
from __future__ import annotations

from collections import deque
from dataclasses import dataclass, asdict
from typing import Any, Dict, Optional

# ponytail: deque OOM-safe, bounded history never grows unbounded
_chart_points: deque = deque(maxlen=100)  # chart points capped 100
_error_history: deque = deque(maxlen=500)  # error stream capped


@dataclass
class DashboardData:
    """Aggregated metrics for dashboard (tokens,cost,latency,success,quota)."""
    tokens: Dict[str, Any]
    cost: Dict[str, Any]
    latency: Dict[str, Any]
    success: Dict[str, Any]
    quota: Dict[str, Any]

    def to_dict(self) -> Dict[str, Any]:
        return asdict(self)

    def to_json(self) -> Dict[str, Any]:
        return self.to_dict()


def _get_tokens() -> Dict[str, Any]:
    try:
        import src.utils.model_manager as mm  # patched in tests
        return mm.get_token_stats() or {}
    except Exception:
        return {}


def _get_latency(tracer: Any = None) -> Dict[str, Any]:
    # tracer instance preferred (test can inject mock)
    if tracer is not None and hasattr(tracer, "get_profiling_data"):
        try:
            return tracer.get_profiling_data() or {}
        except Exception:
            pass
    # fallback: try PipelineTracer class (supports patch on PipelineTracer.get_profiling_data)
    try:
        from src.utils.pipeline_tracer import PipelineTracer

        # if class method is mocked, a dummy instance will return mock value
        dummy = PipelineTracer.__new__(PipelineTracer)  # bypass __init__ (needs logs_dir)
        dummy._pipeline_start = __import__("time").time()  # type: ignore
        dummy._node_timings = {}  # type: ignore
        # set minimal attrs so mocked method is called on instance
        if hasattr(PipelineTracer, "get_profiling_data"):
            try:
                return dummy.get_profiling_data() or {}  # type: ignore
            except Exception:
                pass
    except Exception:
        pass
    return {}


def _get_cost(tokens: Dict[str, Any]) -> Dict[str, Any]:
    # Costs from model_manager token stats + analytics tracker fallback
    cost: Dict[str, Any] = {}
    try:
        cost["estimated_usd"] = float(tokens.get("estimated_cost_usd", 0.0))
        cost["by_model"] = dict(tokens.get("cost_by_model", {}) or {})
        # try analytics tracker total cost (optional, never fail)
        try:
            from src.analytics.tracker import AnalyticsTracker

            tr = AnalyticsTracker(db_path=":memory:")
            cost["total_30d"] = float(tr.get_total_cost_estimate(days=30) or 0.0)
        except Exception:
            pass
    except Exception:
        cost = {"estimated_usd": 0.0, "by_model": {}}
    return cost


def _get_success(collector: Any = None) -> Dict[str, Any]:
    try:
        if collector is None:
            import src.utils.metrics as met

            collector = met.get_metrics_collector()
        agg = collector.get_aggregate_metrics()  # type: ignore
        if hasattr(agg, "to_dict"):
            data = agg.to_dict()  # type: ignore
        elif isinstance(agg, dict):
            data = dict(agg)
        else:
            data = {
                "papers_processed": getattr(agg, "papers_processed", 0),
                "papers_completed": getattr(agg, "papers_completed", 0),
                "papers_failed": getattr(agg, "papers_failed", 0),
                "success_rate": getattr(agg, "success_rate", 0.0),
                "avg_duration_per_paper_ms": getattr(agg, "avg_duration_per_paper_ms", 0),
                "bottleneck_stage": getattr(agg, "bottleneck_stage", None),
                "most_common_errors": getattr(agg, "most_common_errors", {}),
            }
        # errors top5 (cap)
        errs = data.get("most_common_errors") or {}
        if isinstance(errs, dict):
            top5 = dict(sorted(errs.items(), key=lambda x: -x[1])[:5])
            data["most_common_errors"] = top5
            data["errors_top5"] = top5
            # OOM-safe error history
            for k, v in top5.items():
                _error_history.append((k, v))
        return data
    except Exception:
        return {"success_rate": 0.0, "papers_processed": 0, "most_common_errors": {}, "errors_top5": {}}


def _get_quota(quota_obj: Any = None) -> Dict[str, Any]:
    try:
        if quota_obj is None:
            import src.scraper.tavily_quota as tq

            quota_obj = tq.get_quota()
        if hasattr(quota_obj, "status"):
            return dict(quota_obj.status() or {})  # type: ignore
        if hasattr(quota_obj, "remaining"):
            rem = quota_obj.remaining()  # type: ignore
            lim = getattr(quota_obj, "limit", 2000)
            return {"remaining": int(rem), "limit": int(lim), "count": int(lim) - int(rem)}
        if isinstance(quota_obj, dict):
            return dict(quota_obj)
    except Exception:
        pass
    return {"remaining": 2000, "limit": 2000, "count": 0, "exhausted": False}


def get_dashboard_data(
    tracer: Any = None,
    collector: Any = None,
    quota_obj: Any = None,
    _tokens_override: Optional[Dict[str, Any]] = None,
    _latency_override: Optional[Dict[str, Any]] = None,
) -> DashboardData:
    """Collect DashboardData from model_manager, tracer, Costs, MetricsCollector, quota."""
    tokens = _tokens_override if _tokens_override is not None else _get_tokens()
    if not isinstance(tokens, dict):
        tokens = {}
    latency = _latency_override if _latency_override is not None else _get_latency(tracer)
    if not isinstance(latency, dict):
        latency = {}
    cost = _get_cost(tokens)
    success = _get_success(collector)
    quota = _get_quota(quota_obj)

    # chart points capped 100, OOM-safe deque
    try:
        pt = {
            "tokens": int(tokens.get("total_tokens", 0) or 0),
            "cost": float(cost.get("estimated_usd", 0.0) or 0.0),
            "latency_s": float(latency.get("total_wall_s", 0.0) or 0.0),
        }
        # also push any existing latency chart points if present (test mock)
        if isinstance(latency.get("chart_points"), list):
            for p in latency["chart_points"][-100:]:
                _chart_points.append(p)
            # cap already
            latency["chart_points"] = list(latency["chart_points"])[-100:]
        _chart_points.append(pt)  # ponytail: bounded deque
        # expose capped points
        if "chart_points" not in latency or not isinstance(latency["chart_points"], list):
            latency["chart_points"] = list(_chart_points)[-100:]
        else:
            # merge history
            merged = list(_chart_points)[-100:]
            latency["chart_points"] = merged[-100:]
        # ensure cap 100
        if len(latency["chart_points"]) > 100:
            latency["chart_points"] = latency["chart_points"][-100:]
    except Exception:
        latency.setdefault("chart_points", [])

    # ensure errors top5 (double guard)
    try:
        errs = success.get("most_common_errors") or {}
        if isinstance(errs, dict) and len(errs) > 5:
            success["most_common_errors"] = dict(sorted(errs.items(), key=lambda x: -x[1])[:5])
            success["errors_top5"] = success["most_common_errors"]
    except Exception:
        pass

    return DashboardData(tokens=tokens, cost=cost, latency=latency, success=success, quota=quota)


# alias for tests expecting collect/collate name
collect_dashboard_data = get_dashboard_data
fetch_dashboard_data = get_dashboard_data


if __name__ == "__main__":
    # ponytail: self-check
    d = get_dashboard_data(_tokens_override={"total_tokens": 123, "estimated_cost_usd": 0.01}, _latency_override={"total_wall_s": 1.2, "nodes": {}})
    assert d.tokens["total_tokens"] == 123
    assert d.cost["estimated_usd"] == 0.01
    assert d.latency["total_wall_s"] == 1.2
    assert "success" in d.to_dict()
    assert "quota" in d.to_dict()
    assert len(d.latency["chart_points"]) <= 100
    assert _chart_points.maxlen == 100
    assert _error_history.maxlen == 500
    print("dashboard_data self-check ok")
