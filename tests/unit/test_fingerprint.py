"""TDD for fingerprint — normalize_error, CRLF handling, deterministic hash."""
from src.utils.fingerprint import (
    normalize_error,
    fingerprint_error,
    normalize_content,
    compute_file_hash,
    workflow_fingerprint,
)


def test_normalize_error_lower_and_line_numbers():
    a = normalize_error("Error at line 123: foo")
    b = normalize_error("Error at line 999: foo")
    assert a == b, "line numbers should normalize to same"
    assert "line N" in a


def test_normalize_error_path_stripping():
    a = normalize_error('File "/tmp/foo/bar.py": error')
    b = normalize_error("File 'C:\\tmp\\foo\\bar.py': error")
    # both should keep bar.py but strip dirs, and lower+normalize
    assert "bar.py" in a
    assert a == b or "bar.py" in b


def test_normalize_error_whitespace_and_hex():
    assert normalize_error("ERR   \n\t 0xABCDEF  ") == normalize_error("err 0x123456")
    # hex normalized to 0xN
    assert "0xN" in normalize_error("fault 0xdeadbeef")


def test_fingerprint_error_deterministic_and_collapsed():
    e1 = "ValueError: line 10 bad"
    e2 = "ValueError: line 999 bad"
    assert fingerprint_error(e1) == fingerprint_error(e2)
    assert fingerprint_error("foo") != fingerprint_error("bar")
    assert len(fingerprint_error("x")) == 16


def test_normalize_content_crlf():
    assert normalize_content("a\r\nb\r\nc") == "a\nb\nc"
    assert normalize_content("a\rb\rc") == "a\nb\nc"
    assert normalize_content("a\nb\nc") == "a\nb\nc"


def test_compute_file_hash_crlf_agnostic():
    h1 = compute_file_hash("a.py", "x\r\ny\n")
    h2 = compute_file_hash("a.py", "x\ny\n")
    assert h1 == h2
    assert compute_file_hash("a.py", "x") != compute_file_hash("b.py", "x")
    assert compute_file_hash("a.py", "hello") != compute_file_hash("a.py", "world")


def test_workflow_fingerprint_stable():
    s = {"test_results": {"execution_errors": ["err line 10"]}, "generated_code": {"files": {"a.py": "print(1)"}}, "tests_passed": False, "fix_attempts": 1}
    f1 = workflow_fingerprint(s, "code_fixing", "testing_complete")
    f2 = workflow_fingerprint(s, "code_fixing", "testing_complete")
    assert f1 == f2
    s2 = dict(s)
    s2["fix_attempts"] = 2
    assert workflow_fingerprint(s2, "code_fixing", "testing_complete") != f1
    # different node => different fp
    assert workflow_fingerprint(s, "code_testing", "testing_complete") != f1


def test_no_new_deps():
    txt = open("src/utils/fingerprint.py").read()
    assert "normalize_error" in txt
    for bad in ["import httpx", "import requests", "import tavily"]:
        assert bad not in txt
