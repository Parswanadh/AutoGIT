"""Smoke tests for tui widgets pack — import + render, OOM caps."""

def test_import():
    import src.tui.pipeline_flow as pf
    import src.tui.log_stream as ls
    import src.tui.metric_cards as mc
    import src.tui.code_preview as cp
    assert hasattr(pf, "build_pipeline_flow")
    assert hasattr(ls, "build_log_table")
    assert hasattr(ls, "logs")
    assert ls.logs.maxlen == 500
    assert hasattr(mc, "build_metric_cards")
    assert hasattr(cp, "build_code_preview")


def test_pipeline_flow_smoke():
    from src.tui.pipeline_flow import build_pipeline_flow, history, _NODES
    from src.utils.pipeline_tracer import PipelineTracer
    tr = PipelineTracer(logs_dir="/tmp", idea="test")
    tr._call_count["research"] = 1
    p = build_pipeline_flow(tr, frame=0)
    assert p is not None
    # animated frame cycles
    p2 = build_pipeline_flow(tr, frame=1)
    assert p2 is not None
    assert history.maxlen == 500
    assert len(_NODES) >= 10
    # fallback None tracer
    p3 = build_pipeline_flow(None, frame=5)
    assert p3 is not None


def test_log_stream_virtualized():
    from src.tui.log_stream import build_log_table, push_log, logs, clear_logs
    clear_logs()
    push_log("info", "hello", "research")
    push_log("error", "boom", "code_testing")
    # OOM truncate
    push_log("info", "x" * 1000, "test")
    assert len(logs) <= 500
    assert logs.maxlen == 500
    assert len(list(logs)[-1]["msg"]) <= 500
    t = build_log_table(limit=10)
    assert t is not None
    assert t.row_count <= 10
    # virtualized cap even if huge limit
    for i in range(600):
        push_log("debug", f"msg {i}")
    assert len(logs) == 500
    t2 = build_log_table(limit=999)
    assert t2.row_count <= 30
    t3 = build_log_table(level_filter="error")
    assert t3 is not None


def test_metric_cards_poll():
    from src.tui.metric_cards import build_metric_cards
    # stub collector
    class Stub:
        _counters = {"papers_started": 3, "papers_completed": 2, "papers_failed": 0, "llm_calls": 10, "llm_tokens_used": 5000, "retry_attempts": 1}
        def get_counter(self, n): return self._counters.get(n, 0)
        def get_aggregate_metrics(self, hours=24):
            class A:
                def to_dict(self): return {"bottleneck_stage": "research"}
            return A()
    g = build_metric_cards(Stub())
    assert g is not None
    assert hasattr(g, "renderables")
    # None collector fallback
    g2 = build_metric_cards(None)
    assert g2 is not None


def test_code_preview_tree():
    from src.tui.code_preview import build_code_preview, build_file_tree, _MAX_FILES, _MAX_BYTES
    files = {"main.py": "def hello():\n    print('hi')", "utils/helpers.py": "x=1\n"*5, "README.md": "# title"}
    p = build_code_preview(files)
    assert p is not None
    tree = build_file_tree(files)
    assert tree is not None
    # OOM caps: many files + big file
    big = {f"f{i}.py": "a"*9000 for i in range(60)}
    p2 = build_code_preview(big)
    assert p2 is not None
    # preview capped
    long_file = {"big.py": "line\n"*200}
    p3 = build_code_preview(long_file)
    assert p3 is not None
    # empty
    p4 = build_code_preview({})
    assert p4 is not None
    # nested shape compat
    p5 = build_code_preview(generated_code={"files": files})  # type: ignore
    assert p5 is not None
