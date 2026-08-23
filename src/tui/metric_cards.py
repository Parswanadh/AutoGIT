"""Metric cards polling MetricsCollector — rich only, OOM-safe."""
from __future__ import annotations

from typing import Any, Dict, Optional

from rich import box
from rich.console import Group
from rich.panel import Panel
from rich.table import Table
from rich.text import Text

# ponytail: no global cache bloat, poll collector on demand


def _get_collector() -> Any | None:
    try:
        from src.utils.metrics import get_metrics_collector  # type: ignore
        return get_metrics_collector()
    except Exception:
        return None


def _safe_int(v: Any) -> int:
    try:
        return int(v or 0)
    except Exception:
        return 0


def _card(title: str, value: str, style: str = "cyan") -> Panel:
    t = Table(box=None, show_header=False, padding=(0, 1))
    t.add_column(justify="center")
    t.add_row(f"[{style}]{value}[/]")
    return Panel(t, title=f"[bold]{title}[/]", border_style=style, box=box.ROUNDED, width=22, height=5)


def build_metric_cards(collector: Any | None = None) -> Group:
    """Poll MetricsCollector and build 4-6 metric cards row."""
    c = collector if collector is not None else _get_collector()
    # ponytail: bounded lookups, no histogram expansion
    if c is None:
        return Group(Text("metrics unavailable", style="dim"), _empty_table())
    try:
        papers_started = _safe_int(c.get_counter("papers_started") if hasattr(c, "get_counter") else c._counters.get("papers_started"))
        papers_done = _safe_int(c.get_counter("papers_completed") if hasattr(c, "get_counter") else c._counters.get("papers_completed"))
        papers_failed = _safe_int(c.get_counter("papers_failed") if hasattr(c, "get_counter") else c._counters.get("papers_failed"))
        llm_calls = _safe_int(c.get_counter("llm_calls") if hasattr(c, "get_counter") else c._counters.get("llm_calls"))
        tokens = _safe_int(c.get_counter("llm_tokens_used") if hasattr(c, "get_counter") else c._counters.get("llm_tokens_used"))
        retries = _safe_int(c.get_counter("retry_attempts") if hasattr(c, "get_counter") else c._counters.get("retry_attempts"))
        success = (papers_done / max(papers_started, 1) * 100) if papers_started else 0
        rate_style = "green" if success >= 80 else "yellow" if success >= 50 else "red"
        cards = [
            _card("Started", str(papers_started), "cyan"),
            _card("Completed", str(papers_done), "green"),
            _card("Failed", str(papers_failed), "red" if papers_failed else "dim"),
            _card("Success", f"{success:.1f}%", rate_style),
            _card("LLM Calls", str(llm_calls), "magenta"),
            _card("Tokens", f"{tokens:,}", "blue"),
        ]
        # ponytail: render as 2 rows of 3 to cap width/height, OOM-safe fixed count
        top = Table(box=None, show_header=False, padding=(0, 1))
        top.add_column(); top.add_column(); top.add_column()
        top.add_row(cards[0], cards[1], cards[2])
        bot = Table(box=None, show_header=False, padding=(0, 1))
        bot.add_column(); bot.add_column(); bot.add_column()
        bot.add_row(cards[3], cards[4], cards[5])
        agg: Optional[Dict[str, Any]] = None
        try:
            if hasattr(c, "get_aggregate_metrics"):
                a = c.get_aggregate_metrics(hours=24)
                agg = a.to_dict() if hasattr(a, "to_dict") else dict(a)  # type: ignore
        except Exception:
            agg = None
        extra = Text(f"retries:{retries}  bottleneck:{(agg or {}).get('bottleneck_stage') or 'n/a'}", style="dim") if agg else Text(f"retries:{retries}", style="dim")
        return Group(top, bot, extra)
    except Exception as e:
        return Group(Text(f"metrics error: {e:.40}", style="red"), _empty_table())


def _empty_table() -> Table:
    t = Table(box=box.ROUNDED, border_style="dim")
    t.add_column("Metric"); t.add_column("Value")
    t.add_row("no data", "-")
    return t


def build_metrics_panel(collector: Any | None = None) -> Panel:
    return Panel(build_metric_cards(collector), title="Metrics", border_style="magenta", box=box.ROUNDED)


if __name__ == "__main__":
    from rich.console import Console
    Console().print(build_metric_cards(None))
    # ponytail: smoke with stub collector
    class _Stub:
        _counters = {"papers_started": 5, "papers_completed": 4, "papers_failed": 1, "llm_calls": 42, "llm_tokens_used": 12345, "retry_attempts": 2}
        def get_counter(self, n): return self._counters.get(n, 0)
        def get_aggregate_metrics(self, hours=24):
            class A:
                def to_dict(self): return {"bottleneck_stage": "code_generation"}
            return A()
    Console().print(build_metric_cards(_Stub()))
    print("demo ok")
