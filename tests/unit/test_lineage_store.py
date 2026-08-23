"""TDD for lineage_store — Candidate, add/top/last/prune, files_hash."""
import json
import sqlite3
import time

import src.memory.lineage_store as ls_mod
from src.memory.lineage_store import Candidate, LineageStore, _files_hash, _total


def _store(tmp_path):
    return LineageStore(db_path=str(tmp_path / "lineage.db"))


def test_candidate_fields():
    c = Candidate(id="c1", parent_id="p0", files_hash="abc", scores={"tests": 1, "feature": 0.5, "quality": 0.8}, eval={"ok": True}, created_at=123.0)
    assert c.id == "c1"
    assert c.parent_id == "p0"
    assert c.files_hash == "abc"
    assert c.scores["tests"] == 1
    assert c.eval["ok"] is True
    assert c.created_at == 123.0
    # defaults
    c2 = Candidate(id="x")
    assert c2.parent_id is None
    assert c2.scores == {}
    assert c2.eval == {}
    assert isinstance(c2.created_at, float)


def test_table_exists(tmp_path):
    s = _store(tmp_path)
    with sqlite3.connect(str(tmp_path / "lineage.db")) as conn:
        row = conn.execute("SELECT sql FROM sqlite_master WHERE type='table' AND name='lineage'").fetchone()
    assert row is not None
    sql = row[0].lower()
    for col in ["id", "parent_id", "files_hash", "scores", "eval", "created_at"]:
        assert col in sql


def test_add_and_top(tmp_path):
    s = _store(tmp_path)
    s.add(Candidate(id="a", scores={"tests": 0.5, "feature": 0.5, "quality": 0.5}, created_at=1))
    s.add(Candidate(id="b", scores={"tests": 1, "feature": 1, "quality": 1}, created_at=2))
    s.add(Candidate(id="c", scores={"tests": 0.1, "feature": 0.1, "quality": 0.1}, created_at=3))
    top = s.top(k=2)
    assert [x.id for x in top] == ["b", "a"]
    # top default k=5 returns all sorted
    assert s.top(k=10)[0].id == "b"


def test_last(tmp_path):
    s = _store(tmp_path)
    for i in range(5):
        s.add(Candidate(id=f"id{i}", scores={"tests": 0}, created_at=float(100 + i)))
    last2 = s.last(n=2)
    assert [c.id for c in last2] == ["id4", "id3"]
    assert s.last(n=1)[0].id == "id4"
    # last respects created_at desc
    all_last = s.last(n=5)
    assert all_last[0].created_at > all_last[-1].created_at


def test_prune_keeps_best_200(tmp_path):
    s = _store(tmp_path)
    for i in range(250):
        # score = i => best are highest i
        s.add(Candidate(id=f"c{i}", scores={"tests": i, "feature": 0, "quality": 0}, created_at=float(i)))
    deleted = s.prune(limit=200)
    assert deleted == 50
    remaining = s.top(k=300)
    assert len(remaining) == 200
    ids = {c.id for c in remaining}
    assert "c249" in ids
    assert "c0" not in ids
    assert "c49" not in ids
    assert "c50" in ids
    # under limit => no delete
    assert s.prune(limit=200) == 0


def test_prune_custom_limit(tmp_path):
    s = _store(tmp_path)
    for i in range(10):
        s.add(Candidate(id=f"x{i}", scores={"tests": i}, created_at=float(i)))
    assert s.prune(limit=5) == 5
    assert len(s.top(k=10)) == 5
    assert s.top(k=1)[0].id == "x9"


def test_parent_id_and_files_hash_persist(tmp_path):
    s = _store(tmp_path)
    s.add(Candidate(id="child", parent_id="parent", files_hash="hash123", scores={"tests": 1, "feature": 1, "quality": 1}, eval={"pass": True}, created_at=99))
    got = s.top(k=1)[0]
    assert got.parent_id == "parent"
    assert got.files_hash == "hash123"
    assert got.eval == {"pass": True}
    # files_hash also searchable via last
    assert s.last(n=1)[0].files_hash == "hash123"


def test_scores_eval_json(tmp_path):
    s = _store(tmp_path)
    scores = {"tests": 0.9, "feature": 0.8, "quality": 0.7}
    ev = {"tests_passed": True, "notes": "ok"}
    s.add(Candidate(id="j1", scores=scores, eval=ev, created_at=1))
    with sqlite3.connect(str(tmp_path / "lineage.db")) as conn:
        row = conn.execute("SELECT scores, eval FROM lineage WHERE id='j1'").fetchone()
    assert json.loads(row[0]) == scores
    assert json.loads(row[1]) == ev
    # roundtrip via object
    c = s.top(k=1)[0]
    assert c.scores == scores
    assert c.eval == ev


def test_files_hash_uses_compute_fp(tmp_path):
    from src.utils.artifact_cache import compute_fp
    files = {"a.py": "print(1)\r\n", "b.py": "hello\rworld"}
    # _files_hash should delegate to compute_fp when available
    assert _files_hash(files) == compute_fp(files)
    # empty
    assert _files_hash({}) == ""
    assert _files_hash(None) == ""


def test_files_hash_fallback(monkeypatch):
    # force fallback path
    monkeypatch.setattr(ls_mod, "_compute_fp", None)
    files_a = {"a.py": "line1\r\nline2"}
    files_b = {"a.py": "line1\nline2"}
    assert _files_hash(files_a) == _files_hash(files_b)
    assert _files_hash({"a.py": "hi"}) != _files_hash({"a.py": "bye"})
    assert _files_hash({"b.py": "x"}) != _files_hash({"a.py": "x"})


def test_total_helper():
    assert _total({"tests": 1, "feature": 2, "quality": 3}) == 6
    assert _total({"tests": 0.5}) == 0.5
    assert _total({}) == 0
    assert _total(None) == 0
    assert _total("bad") == 0


def test_memory_backend():
    # :memory: should work without file
    s = LineageStore(db_path=":memory:")
    s.add(Candidate(id="m1", scores={"tests": 1, "feature": 1, "quality": 1}, created_at=1))
    s.add(Candidate(id="m2", scores={"tests": 0}, created_at=2))
    assert s.top(k=1)[0].id == "m1"
    assert s.last(n=1)[0].id == "m2"


def test_no_new_deps():
    txt = open("src/memory/lineage_store.py").read()
    for bad in ["import requests", "import httpx", "import redis", "import chroma"]:
        assert bad not in txt
    assert "sqlite3" in txt
    assert "Candidate" in txt
    assert "lineage" in txt
    assert "compute_fp" in txt
