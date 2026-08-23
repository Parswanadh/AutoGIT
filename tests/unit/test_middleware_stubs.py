"""Ghost module stubs — minimal contract tests."""
import pathlib

def test_middleware_imports():
    from src.utils.middleware import run_state_compaction, offload_large_output, get_loop_detector, extract_error_context
    assert callable(run_state_compaction)
    assert callable(offload_large_output)
    assert callable(get_loop_detector)
    assert callable(extract_error_context)

def test_context_offload_imports():
    from src.utils.context_offload import offload_state_fields, compact_todos_with_pointer, restore_todo_context_if_missing
    assert callable(offload_state_fields)
    assert callable(compact_todos_with_pointer)
    assert callable(restore_todo_context_if_missing)

def test_run_state_compaction_trims():
    from src.utils.middleware import run_state_compaction
    state = {"errors": [str(i) for i in range(100)], "warnings": ["w"]*100}
    patch = run_state_compaction(state)
    assert isinstance(patch, dict)
    assert len(patch.get("errors", state["errors"])) <= 60
    assert len(patch.get("warnings", state["warnings"])) <= 40

def test_run_state_compaction_empty():
    from src.utils.middleware import run_state_compaction
    assert run_state_compaction({}) == {}
    assert run_state_compaction(None) == {}
    assert run_state_compaction({"errors": ["a"]}) == {}  # under cap

def test_offload_large_output(tmp_path, monkeypatch):
    from src.utils.middleware import offload_large_output
    monkeypatch.chdir(tmp_path)
    p = offload_large_output("x"*500, "unit_test")
    assert p
    assert pathlib.Path(p).exists()
    assert offload_large_output("") == ""

def test_get_loop_detector():
    from src.utils.middleware import get_loop_detector
    ld = get_loop_detector()
    ld.reset()
    assert ld.record_node_visit("code_fixing") is None
    for _ in range(11):
        w = ld.record_node_visit("code_fixing")
    assert w and "loop_warning" in w
    ld.reset()
    assert ld.record_error("fp1") is None
    assert ld.record_error("fp1") is None
    assert "repeated" in (ld.record_error("fp1") or "")
    assert isinstance(ld.get_context_injection(), str)
    assert ld.record_file_edit("a.py") is None
    ld.reset()

def test_extract_error_context():
    from src.utils.middleware import extract_error_context
    code = "\n".join(f"line {i}" for i in range(1, 51))
    snippet, s, e = extract_error_context(code, 25, radius=5)
    assert "line 25" in snippet
    assert s == 20 and e == 30
    snippet2, _, _ = extract_error_context("", 1)
    assert isinstance(snippet2, str)

def test_context_offload_funcs(tmp_path, monkeypatch):
    monkeypatch.chdir(tmp_path)
    from src.utils.context_offload import offload_state_fields, compact_todos_with_pointer, restore_todo_context_if_missing
    assert offload_state_fields({"errors": ["a"]*2}, node_name="test") == {}
    # large field offloads
    big = {"research_summary": "x"*60000}
    patch = offload_state_fields(big, node_name="research")
    assert "context_offload_refs" in patch

    todos = [{"id": str(i)} for i in range(20)]
    c = compact_todos_with_pointer(todos)
    assert c["todo_context_pointer"].startswith("todos:20")
    assert len(c["pipeline_todos"]) == 12
    assert compact_todos_with_pointer([{"id": "1"}]) == {}
    assert compact_todos_with_pointer(None) == {}

    assert restore_todo_context_if_missing({"todo_context_pointer": "x", "pipeline_todos": []})["todo_context_pointer"] is None
    assert restore_todo_context_if_missing({"todo_context_pointer": "x", "pipeline_todos": [{"id": "1"}]}) == {}
    assert restore_todo_context_if_missing({}) == {}

def test_precompletion_stubs():
    from src.utils.middleware import run_pre_completion_checklist, format_checklist_report
    items = run_pre_completion_checklist({"generated_code": {"files": {"main.py": "print(1)", "README.md": "# hi"}}})
    assert len(items) >= 2
    report = format_checklist_report(items)
    assert "checklist" in report.lower()
