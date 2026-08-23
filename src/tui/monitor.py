"""Live pipeline monitor — 2-table TUI polling tracer + resources at 2Hz."""
from __future__ import annotations

import time
from collections import deque
from typing import Any, Dict, Optional

from rich import box
from rich.console import Console, Group
from rich.live import Live
from rich.table import Table

# ponytail: deque maxlen 500 OOM-safe, bounded history never grows unbounded
history: deque = deque(maxlen=500)  # type: ignore


def _pipeline_table(tracer: Any) -> Table:
    t = Table(title="Pipeline Nodes", box=box.ROUNDED, border_style="cyan")
    t.add_column("Node", style="cyan", width=22)
    t.add_column("Calls", justify="right")
    t.add_column("Stage", style="white")
    t.add_column("Status", justify="center")
    try:
        calls: Dict[str, int] = getattr(tracer, "_call_count", {}) or {}
        if hasattr(tracer, "get_runtime_snapshot"):
            snap = tracer.get_runtime_snapshot()
            calls = snap.get("node_calls", calls)
            stage = snap.get("current_stage", "")
        else:
            stage = str(getattr(tracer, "_full_state", {}).get("current_stage", ""))
        # lazy import canonical order
        try:
            from src.utils.pipeline_tracer import _ALL_NODES  # type: ignore
        except Exception:
            _ALL_NODES = list(calls.keys())  # type: ignore
        for node in _ALL_NODES:
            c = calls.get(node, 0)
            status = "[green]ran[/]" if c else "[dim]pending[/]"
            t.add_row(node, str(c), stage if c else "", status)
        if not _ALL_NODES:
            t.add_row("no nodes", "0", "", "[dim]idle[/]")
    except Exception as e:
        t.add_row("error", "-", "-", str(e)[:30])
    return t


def _resource_table(monitor: Any) -> Table:
    t = Table(title="Resources", box=box.ROUNDED, border_style="magenta")
    t.add_column("Resource", style="magenta", width=14)
    t.add_column("Usage", style="white")
    t.add_column("Status", justify="center")
    try:
        stats = monitor.get_stats_snapshot() if hasattr(monitor, "get_stats_snapshot") else {}
        cpu = float(stats.get("cpu_percent", 0))
        ram_p = float(stats.get("ram_percent", 0))
        ram_u = float(stats.get("ram_used_gb", 0))
        ram_t = float(stats.get("ram_total_gb", 0))
        t.add_row("CPU", f"{cpu:.1f}%", "[green]ok[/]" if cpu < 80 else "[yellow]high[/]")
        t.add_row("RAM", f"{ram_u:.1f}/{ram_t:.1f} GB ({ram_p:.1f}%)", "[green]ok[/]" if ram_p < 80 else "[yellow]high[/]")
        vram_t = float(stats.get("gpu_vram_total_mb", 0) or 0)
        if vram_t > 0:
            vram_u = float(stats.get("gpu_vram_used_mb", 0))
            pct = vram_u / vram_t * 100 if vram_t else 0
            t.add_row("GPU VRAM", f"{vram_u/1024:.1f}/{vram_t/1024:.1f} GB ({pct:.1f}%)", "[green]ok[/]" if pct < 80 else "[yellow]high[/]")
            gpu_u = float(stats.get("gpu_utilization", 0))
            t.add_row("GPU Util", f"{gpu_u:.1f}%", "[green]ok[/]" if gpu_u < 90 else "[yellow]high[/]")
    except Exception as e:
        t.add_row("error", str(e)[:30], "-")
    return t


def build_render(tracer: Any, monitor: Any) -> Group:
    """Build 2-table layout; append timestamp to bounded history."""
    history.append(time.time())  # ponytail: bounded deque, O(1) append
    return Group(_pipeline_table(tracer), _resource_table(monitor))


def run(tracer: Optional[Any] = None, monitor: Optional[Any] = None, duration: float = 5.0) -> None:
    """Poll tracer + monitor at 2Hz inside rich.live.Live."""
    console = Console()
    if tracer is None:
        try:
            from src.utils.pipeline_tracer import PipelineTracer  # type: ignore

            tracer = PipelineTracer(logs_dir="logs", idea="monitor demo")
        except Exception:
            class _Dummy:  # minimal stub
                _call_count: Dict[str, int] = {"research": 1}
                _full_state: Dict[str, Any] = {"current_stage": "research"}

                def get_runtime_snapshot(self):  # type: ignore
                    return {"node_calls": self._call_count, "current_stage": "research", "error_count": 0}

            tracer = _Dummy()
    if monitor is None:
        try:
            from src.utils.resource_monitor import get_monitor  # type: ignore

            monitor = get_monitor()
        except Exception:
            from src.utils.resource_monitor import ResourceMonitor  # type: ignore

            monitor = ResourceMonitor()
    with Live(build_render(tracer, monitor), console=console, refresh_per_second=2) as live:  # 2Hz
        end = time.time() + duration
        while time.time() < end:
            time.sleep(0.5)  # 2Hz poll
            live.update(build_render(tracer, monitor))


if __name__ == "__main__":
    from src.utils.pipeline_tracer import PipelineTracer
    from src.utils.resource_monitor import ResourceMonitor

    tr = PipelineTracer(logs_dir="/tmp", idea="demo")
    tr._call_count["research"] = 1  # simulate one node ran
    mon = ResourceMonitor()
    render = build_render(tr, mon)
    assert render is not None  # ponytail: smoke assert
    assert history.maxlen == 500
    assert len(history) >= 1
    Console().print(render)
    print("demo ok")
