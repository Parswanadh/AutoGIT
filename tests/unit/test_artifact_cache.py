"""TDD for artifact_cache — compute_fp CRLF normalize."""
from src.utils.artifact_cache import compute_fp, compute_artifact_fingerprint


def test_compute_fp_crlf_normalize():
    files_a = {"a.py": "line1\r\nline2\r\n", "b.py": "hello\rworld"}
    files_b = {"a.py": "line1\nline2\n", "b.py": "hello\nworld"}
    assert compute_fp(files_a) == compute_fp(files_b)
    assert compute_fp({"a.py": "a\r\nb"}) == compute_fp({"a.py": "a\nb"})
    assert compute_fp({"a.py": "a\rb"}) == compute_fp({"a.py": "a\nb"})


def test_compute_fp_sorted_keys():
    assert compute_fp({"b.py": "2", "a.py": "1"}) == compute_fp({"a.py": "1", "b.py": "2"})
    assert compute_fp({"a.py": "1"}) != compute_fp({"a.py": "2"})
    assert compute_fp({"a.py": "x"}) != compute_fp({"b.py": "x"})


def test_compute_fp_empty():
    assert compute_fp({}) == ""
    assert compute_fp(None) == ""  # type: ignore
    assert compute_fp({"a.py": ""}) != ""


def test_compute_fp_runtime_mode_filters_docs():
    files = {"main.py": "print(1)", "README.md": "# hi", "requirements.txt": "requests==1"}
    full = compute_fp(files, mode="full")
    runtime = compute_fp(files, mode="runtime")
    # README filtered in runtime -> different hash
    assert full != runtime
    # runtime should be same as without README
    assert runtime == compute_fp({"main.py": "print(1)", "requirements.txt": "requests==1"}, mode="runtime")
    assert compute_fp({"README.md": "# hi"}, mode="runtime") == ""


def test_compute_artifact_fingerprint_state_wrapper():
    state = {"generated_code": {"files": {"a.py": "x\r\ny"}}}
    assert compute_artifact_fingerprint(state) == compute_fp({"a.py": "x\ny"})
    assert compute_artifact_fingerprint({}, mode="full") == ""
    assert compute_artifact_fingerprint({"generated_code": {"files": {"a.py": "hi"}}}, mode="runtime") == compute_fp({"a.py": "hi"}, mode="runtime")


def test_no_new_deps():
    txt = open("src/utils/artifact_cache.py").read()
    assert "compute_fp" in txt
    assert "CRLF" in txt or r"\r\n" in txt
    for bad in ["import httpx", "import requests"]:
        assert bad not in txt
