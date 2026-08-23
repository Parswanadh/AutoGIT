"""Animated DAG of workflow_enhanced stages — rich only, OOM-safe."""
from __future__ import annotations

from collections import deque
from typing import Any, Dict, List

from rich import box
from rich.console import Group
from rich.panel import Panel
from rich.table import Table
from rich.text import Text

# ponytail: bounded history, OOM-safe
history: deque = deque(maxlen=500)  # type: ignore

# ponytail: DAG order from canonical tracer; fallback keeps render alive
try:
    from src.utils.pipeline_tracer import _ALL_NODES as _NODES  # type: ignore
except Exception:
    _NODES: List[str] = [
        "requirements_extraction", "research", "generate_perspectives",
        "problem_extraction", "solution_generation", "critique",
        "consensus_check", "solution_selection", "architect_spec",
        "code_generation", "code_review_agent", "code_testing",
        "strategy_reasoner", "code_fixing", "pipeline_self_eval", "git_publishing",
    ]

_SYM = {"done": "●", "run": "◐", "pend": "○"}
_STY = {"done": "green", "run": "yellow", "pend": "dim"}


def _snapshot(tracer: Any) -> tuple[Dict[str, int], str]:
    try:
        if hasattr(tracer, "get_runtime_snapshot"):
            s = tracer.get_runtime_snapshot()
            return s.get("node_calls", {}) or {}, str(s.get("current_stage", ""))
        return getattr(tracer, "_call_count", {}) or {}, str(getattr(tracer, "_full_state", {}).get("current_stage", ""))
    except Exception:
        return {}, ""


def _status(node: str, idx: int, calls: Dict[str, int], frame: int, total: int) -> tuple[str, str]:
    c = calls.get(node, 0)
    if c:
        return "done", _STY["done"]
    # ponytail: animated running marker cycles through pending nodes
    if idx == (frame % total):
        return "run", _STY["run"]
    return "pend", _STY["pend"]


def build_pipeline_flow(tracer: Any = None, frame: int = 0) -> Panel:
    """Build animated DAG panel for workflow_enhanced stages."""
    calls, stage = _snapshot(tracer) if tracer is not None else ({}, "")
    history.append(frame)  # ponytail: O(1) bounded
    total = len(_NODES)
    t = Table(box=box.ROUNDED, border_style="cyan", show_header=True, title="Pipeline Flow")
    t.add_column("#", width=3, justify="right", style="dim")
    t.add_column("Stage", style="cyan", width=24)
    t.add_column("DAG", width=28)
    t.add_column("Status", justify="center", width=10)
    for i, node in enumerate(_NODES):
        key, sty = _status(node, i, calls, frame, total)
        sym = _SYM[key]
        label = f"[{sty}]{sym} {node}[/]"
        if i < total - 1:
            dag = Text(" │ ", style="dim") if key == "pend" else Text(" ↓ ", style=sty)
        else:
            dag = Text(" ✔ ", style="green" if key == "done" else "dim")
        status = f"[{sty}]{key}[/]"
        if key == "run" and stage:
            status = f"[yellow]run:{stage[:12]}[/]"
        t.add_row(str(i + 1), label, dag, status)
    if not _NODES:
        t.add_row("-", "no stages", "-", "idle")
    return Panel(Group(t, Text(f"stage: {stage or 'idle'}  frame:{frame}", style="dim")), border_style="cyan", box=box.ROUNDED)


def build_dag_render(tracer: Any = None, frame: int = 0) -> Group:
    """Compatibility wrapper — returns Group with DAG panel."""
    return Group(build_pipeline_flow(tracer, frame))


if __name__ == "__main__":
    from rich.console import Console
    Console().print(build_pipeline_flow(None, 0))
    assert history.maxlen == 500
    print("demo ok")
