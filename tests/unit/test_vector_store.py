"""Tests for VectorStore singleton (memory + chroma backends)."""
# ponytail: package __init__.py hard-imports redis (not installed); load file directly
import importlib.util
from pathlib import Path

import pytest

_SPEC = importlib.util.spec_from_file_location(
    "vector_store_under_test",
    Path(__file__).resolve().parents[2] / "src" / "state_management" / "vector_store.py",
)
_mod = importlib.util.module_from_spec(_SPEC)
_SPEC.loader.exec_module(_mod)
VectorStore = _mod.VectorStore


@pytest.fixture(autouse=True)
def _reset_singletons():
    VectorStore._instances.clear()
    yield
    VectorStore._instances.clear()


def test_memory_roundtrip():
    store = VectorStore.get_instance(backend="memory")
    store.put("a", [1.0, 0.0, 0.0], {"title": "attention"})
    store.put("b", [0.0, 1.0, 0.0], {"title": "diffusion"})

    assert store.get("a") == {"title": "attention"}

    hits = store.search([1.0, 0.0, 0.0])
    assert hits[0][0] == "a"
    assert hits[0][1] == pytest.approx(1.0)
    assert hits[0][2] == {"title": "attention"}
    assert all(h[0] != "b" for h in hits)


def test_threshold_filters_dissimilar():
    store = VectorStore.get_instance(backend="memory")
    store.put("near", [1.0, 0.0, 0.0], "x")
    store.put("far", [0.0, 1.0, 0.0], "y")

    hits = store.search([1.0, 0.0, 0.0], k=5, threshold=0.85)
    ids = [h[0] for h in hits]
    assert "near" in ids
    assert "far" not in ids


def test_search_respects_k():
    store = VectorStore.get_instance(backend="memory")
    for i in range(8):
        store.put(f"id{i}", [1.0, 0.0, float(i) / 10], i)

    hits = store.search([1.0, 0.0, 0.05], k=3)
    assert len(hits) == 3


def test_get_missing_returns_none():
    store = VectorStore.get_instance(backend="memory")
    assert store.get("nope") is None


def test_singleton_same_instance_per_backend():
    s1 = VectorStore.get_instance(backend="memory")
    s2 = VectorStore.get_instance(backend="memory")
    assert s1 is s2


def test_no_redis_backend():
    with pytest.raises(ValueError):
        VectorStore.get_instance(backend="redis")


def test_chroma_roundtrip(tmp_path):
    pytest.importorskip("chromadb")
    store = VectorStore.get_instance(backend="chroma", path=str(tmp_path / "db"))
    store.put("a", [1.0, 0.0, 0.0], {"title": "attention"})

    assert store.get("a") == {"title": "attention"}

    hits = store.search([1.0, 0.0, 0.0], threshold=0.5)
    assert hits[0][0] == "a"
    assert hits[0][2] == {"title": "attention"}
