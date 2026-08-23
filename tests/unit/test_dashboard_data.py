"""Tests for src.monitoring.dashboard_data + dashboard_v2 — mocking stats, caps, OOM-safe."""
from unittest.mock import MagicMock, patch


def _mock_setup(tokens=None, profiling=None, agg_dict=None, quota_dict=None):
    tokens = tokens or {"calls": 5, "prompt_tokens": 100, "completion_tokens": 50, "total_tokens": 150, "by_model": {"m1": 150}, "by_profile": {}, "estimated_cost_usd": 0.02, "cost_by_model": {"m1": 0.02}}
    profiling = profiling or {"total_wall_s": 12.5, "nodes": {"research": {"calls": 1, "total_s": 2.0, "avg_s": 2.0, "max_s": 2.0, "pct_of_total": 50}}}
    agg_dict = agg_dict or {"papers_processed": 10, "papers_completed": 8, "papers_failed": 2, "success_rate": 80.0, "most_common_errors": {"a": 5, "b": 4, "c": 3, "d": 2, "e": 1, "f": 0}}
    quota_dict = quota_dict or {"month": "2026-08", "count": 10, "limit": 2000, "remaining": 1990, "exhausted": False}
    mock_agg = MagicMock()
    mock_agg.to_dict.return_value = dict(agg_dict)
    # also set attrs for fallback path
    for k, v in agg_dict.items():
        setattr(mock_agg, k, v)
    mock_quota = MagicMock()
    mock_quota.status.return_value = dict(quota_dict)
    return tokens, profiling, mock_agg, mock_quota


def test_dashboard_data_mocking():
    from src.monitoring import dashboard_data as dd

    dd._chart_points.clear()
    dd._error_history.clear()
    tokens, profiling, mock_agg, mock_quota = _mock_setup()
    with patch("src.utils.model_manager.get_token_stats", return_value=tokens):
        with patch("src.utils.pipeline_tracer.PipelineTracer.get_profiling_data", return_value=profiling):
            with patch("src.utils.metrics.get_metrics_collector") as mg:
                mc = MagicMock()
                mc.get_aggregate_metrics.return_value = mock_agg
                mg.return_value = mc
                with patch("src.scraper.tavily_quota.get_quota", return_value=mock_quota):
                    data = dd.get_dashboard_data()
                    assert data.tokens["total_tokens"] == 150
                    assert abs(data.cost["estimated_usd"] - 0.02) < 1e-9
                    assert data.latency["total_wall_s"] == 12.5
                    assert data.success["success_rate"] == 80.0
                    assert data.quota["remaining"] == 1990


def test_dashboard_data_fields_present():
    from src.monitoring.dashboard_data import DashboardData, get_dashboard_data

    tokens, profiling, mock_agg, mock_quota = _mock_setup()
    with patch("src.utils.model_manager.get_token_stats", return_value=tokens):
        with patch("src.utils.pipeline_tracer.PipelineTracer.get_profiling_data", return_value=profiling):
            with patch("src.utils.metrics.get_metrics_collector") as mg:
                mc = MagicMock()
                mc.get_aggregate_metrics.return_value = mock_agg
                mg.return_value = mc
                with patch("src.scraper.tavily_quota.get_quota", return_value=mock_quota):
                    d = get_dashboard_data()
                    assert isinstance(d, DashboardData)
                    j = d.to_dict()
                    for k in ("tokens", "cost", "latency", "success", "quota"):
                        assert k in j
                    # json alias
                    assert j == d.to_json()


def test_chart_points_capped_100():
    from src.monitoring import dashboard_data as dd
    from src.monitoring import dashboard_v2 as dv2

    dd._chart_points.clear()
    dv2.chart_history.clear()
    # inject latency with 200 chart points
    big_points = [{"x": i} for i in range(200)]
    tokens, _, mock_agg, mock_quota = _mock_setup()
    profiling = {"total_wall_s": 5.0, "nodes": {}, "chart_points": big_points}
    mock_quota2 = MagicMock()
    mock_quota2.status.return_value = {"remaining": 1990, "limit": 2000}
    with patch("src.utils.model_manager.get_token_stats", return_value=tokens):
        with patch("src.utils.pipeline_tracer.PipelineTracer.get_profiling_data", return_value=profiling):
            with patch("src.utils.metrics.get_metrics_collector") as mg:
                mc = MagicMock()
                mc.get_aggregate_metrics.return_value = mock_agg
                mg.return_value = mc
                with patch("src.scraper.tavily_quota.get_quota", return_value=mock_quota2):
                    d = dd.get_dashboard_data()
                    assert len(d.latency["chart_points"]) <= 100
                    res = dv2.get_dashboard()
                    assert len(res["json"]["latency"]["chart_points"]) <= 100
                    assert dv2.chart_history.maxlen == 100
                    assert dd._chart_points.maxlen == 100


def test_errors_top5():
    from src.monitoring import dashboard_data as dd
    from src.monitoring import dashboard_v2 as dv2

    dd._error_history.clear()
    dv2.error_history.clear()
    tokens, profiling, _, mock_quota = _mock_setup()
    # 7 errors -> should cap to 5
    agg_dict = {"papers_processed": 10, "success_rate": 70.0, "most_common_errors": {"e1": 10, "e2": 9, "e3": 8, "e4": 7, "e5": 6, "e6": 5, "e7": 4}}
    mock_agg = MagicMock()
    mock_agg.to_dict.return_value = dict(agg_dict)
    for k, v in agg_dict.items():
        setattr(mock_agg, k, v)
    with patch("src.utils.model_manager.get_token_stats", return_value=tokens):
        with patch("src.utils.pipeline_tracer.PipelineTracer.get_profiling_data", return_value=profiling):
            with patch("src.utils.metrics.get_metrics_collector") as mg:
                mc = MagicMock()
                mc.get_aggregate_metrics.return_value = mock_agg
                mg.return_value = mc
                with patch("src.scraper.tavily_quota.get_quota", return_value=mock_quota):
                    d = dd.get_dashboard_data()
                    assert len(d.success["most_common_errors"]) <= 5
                    assert len(d.success["errors_top5"]) <= 5
                    res = dv2.get_dashboard()
                    assert len(res["json"]["success"]["most_common_errors"]) <= 5
                    assert "e6" not in res["json"]["success"]["most_common_errors"]
                    assert "e7" not in res["json"]["success"]["most_common_errors"]
                    assert dv2.error_history.maxlen == 500


def test_dashboard_v2_returns_html_json():
    from src.monitoring import dashboard_v2 as dv2
    from src.monitoring import dashboard_data as dd

    dd._chart_points.clear()
    dv2.chart_history.clear()
    tokens, profiling, mock_agg, mock_quota = _mock_setup()
    with patch("src.utils.model_manager.get_token_stats", return_value=tokens):
        with patch("src.utils.pipeline_tracer.PipelineTracer.get_profiling_data", return_value=profiling):
            with patch("src.utils.metrics.get_metrics_collector") as mg:
                mc = MagicMock()
                mc.get_aggregate_metrics.return_value = mock_agg
                mg.return_value = mc
                with patch("src.scraper.tavily_quota.get_quota", return_value=mock_quota):
                    res = dv2.get_dashboard()
                    assert "html" in res and "json" in res
                    assert isinstance(res["html"], str)
                    assert "Dashboard" in res["html"]
                    assert isinstance(res["json"], dict)
                    for k in ("tokens", "cost", "latency", "success", "quota"):
                        assert k in res["json"]
                    # OOM-safe deque checks
                    assert dv2.chart_history.maxlen == 100
                    assert dv2.error_history.maxlen == 500


def test_oom_safe_deque():
    from src.monitoring.dashboard_data import _chart_points, _error_history
    from src.monitoring.dashboard_v2 import chart_history, error_history

    assert _chart_points.maxlen == 100
    assert _error_history.maxlen == 500
    assert chart_history.maxlen == 100
    assert error_history.maxlen == 500
    # push beyond limit, ensure bounded
    for i in range(300):
        _chart_points.append({"x": i})
    assert len(_chart_points) == 100
    for i in range(600):
        _error_history.append((f"e{i}", i))
    assert len(_error_history) == 500
