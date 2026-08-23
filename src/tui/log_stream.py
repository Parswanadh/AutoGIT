"""Virtualized log stream — deque maxlen 500, rich only, OOM-safe."""
from __future__ import annotations

import time
from collections import deque
from typing import Deque, Any

from rich import box
from rich.table import Table
from rich.text import Text

# ponytail: bounded deque, OOM-safe, virtualized window never grows unbounded
logs: Deque[dict] = deque(maxlen=500)  # type: ignore

_MAX_MSG = 500  # ponytail: truncate msg OOM cap
_MAX_RENDER = 30  # ponytail: virtualized slice, O(1) render


def push_log(level: str, message: str, node: str = "") -> None:
    """Append log entry with OOM caps."""
    msg = str(message or "")[:_MAX_MSG]
    lvl = str(level or "info").lower()[:20]
    nd = str(node or "")[:40]
    logs.append({"ts": time.time(), "level": lvl, "msg": msg, "node": nd})


def clear_logs() -> None:
    logs.clear()


def build_log_table(limit: int = 30, level_filter: str | None = None) -> Table:
    """Build virtualized table — only last `limit` rows rendered."""
    lim = min(max(int(limit), 1), _MAX_RENDER)  # ponytail: clamp render window
    t = Table(title=f"Logs ({len(logs)}/500)", box=box.ROUNDED, border_style="cyan", show_header=True)
    t.add_column("Time", style="dim", width=8)
    t.add_column("Lvl", width=6, justify="center")
    t.add_column("Node", style="cyan", width=16)
    t.add_column("Message", style="white", overflow="fold")
    items = list(logs)[-500:]  # ponytail: bounded copy
    if level_filter:
        lf = level_filter.lower()
        items = [e for e in items if e["level"] == lf][-lim:]
    else:
        items = items[-lim:]
    if not items:
        t.add_row("-", "-", "-", Text("no logs", style="dim"))
        return t
    style_map = {"error": "red", "warn": "yellow", "warning": "yellow", "info": "white", "debug": "dim"}
    for e in items:
        ts = time.strftime("%H:%M:%S", time.localtime(e["ts"]))
        lvl = e["level"]
        sty = style_map.get(lvl, "white")
        # ponytail: truncate already capped, extra slice defensive
        msg = Text(e["msg"][:200], style=sty, overflow="fold")
        t.add_row(ts, f"[{sty}]{lvl}[/]", e["node"][:16] or "-", msg)
    return t


def build_log_stream(limit: int = 30, level_filter: str | None = None) -> Table:
    return build_log_table(limit, level_filter)


def get_logs_snapshot() -> list[dict]:
    return list(logs)


if __name__ == "__main__":
    from rich.console import Console
    push_log("info", "pipeline start", "research")
    push_log("error", "x" * 1000, "code_testing")  # truncation check
    Console().print(build_log_table())
    assert logs.maxlen == 500
    assert len(logs[0]["msg"]) <= _MAX_MSG
    # virtualized cap
    for i in range(600):
        push_log("debug", f"msg {i}")
    assert len(logs) == 500
    assert build_log_table(limit=999).row_count <= _MAX_RENDER
    print("demo ok")
