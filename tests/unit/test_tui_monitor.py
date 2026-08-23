"""Smoke tests for src.tui.monitor — import + 2-table render at 2Hz."""

def test_import():
    from src.tui.monitor import build_render, run, history, _pipeline_table, _resource_table
    assert callable(build_render)
    assert callable(run)
    assert history.maxlen == 500  # ponytail: OOM-safe bound


def test_render_smoke():
    from src.utils.pipeline_tracer import PipelineTracer
    from src.utils.resource_monitor import ResourceMonitor
    from src.tui.monitor import build_render, history

    tr = PipelineTracer(logs_dir="/tmp", idea="test")
    tr._call_count["research"] = 1
    mon = ResourceMonitor()
    render = build_render(tr, mon)
    assert render is not None
    # Group contains 2 tables
    assert hasattr(render, "renderables")
    assert len(render.renderables) == 2
    # history bounded
    assert len(history) <= 500
    assert history.maxlen == 500


def test_resource_table_uses_get_stats_snapshot():
    from src.utils.resource_monitor import ResourceMonitor
    from src.tui.monitor import _resource_table

    mon = ResourceMonitor()
    snap = mon.get_stats_snapshot()
    assert isinstance(snap, dict)
    t = _resource_table(mon)
    assert t is not None
    assert t.row_count >= 2  # CPU + RAM at least


def test_cli_hook_exists():
    # ponytail: trivial CLI hook registered as `monitor` command
    from auto_git_cli import app
    from typer.main import get_command

    cmd = get_command(app)
    assert "monitor" in cmd.commands
    # also via callback names fallback
    cbs = [c.callback.__name__ for c in app.registered_commands if getattr(c, "callback", None)]
    assert "monitor" in cbs
