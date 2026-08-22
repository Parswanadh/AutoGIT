"""Tests for unified embedder factory (Ollama -> sentence-transformers -> hash)."""
import asyncio

import pytest

from src.utils.embeddings import cosine, get_embedder
from src.utils.embeddings import embedder_factory as ef


@pytest.fixture(autouse=True)
def _clean_singleton():
    ef._embedder = None
    yield
    ef._embedder = None


def _run(coro):
    return asyncio.run(coro)


class FakeOllama:
    def __init__(self, ok=True):
        self.ok = ok

    async def embed(self, model, text):
        if not self.ok:
            raise ConnectionError("ollama down")
        return [float(len(text)), 1.0]


def _no_sentence_transformers(self):
    raise ImportError("sentence-transformers not installed")


def test_cosine_orthogonality_and_identity():
    assert abs(cosine([1.0, 0.0], [0.0, 1.0])) < 1e-9
    assert abs(cosine([1.0, 2.0], [3.0, 6.0]) - 1.0) < 1e-9


def test_cosine_zero_vector_is_zero():
    assert cosine([0.0, 0.0], [1.0, 1.0]) == 0.0


def test_ollama_backend_selected_and_singleton(monkeypatch):
    monkeypatch.setattr(ef, "get_ollama_client", lambda: FakeOllama(ok=True))
    emb = _run(get_embedder())
    assert isinstance(emb, ef.OllamaEmbedder)
    assert _run(emb.embed("hi")) == [2.0, 1.0]
    assert _run(get_embedder()) is emb


def test_falls_back_to_hash_when_ollama_down(monkeypatch):
    monkeypatch.setattr(ef, "get_ollama_client", lambda: FakeOllama(ok=False))
    monkeypatch.setattr(ef.LocalEmbedder, "__init__", _no_sentence_transformers)
    emb = _run(get_embedder())
    assert isinstance(emb, ef.HashEmbedder)


def test_hash_backend_dim_consistency_and_determinism(monkeypatch):
    monkeypatch.setattr(ef, "get_ollama_client", lambda: FakeOllama(ok=False))
    monkeypatch.setattr(ef.LocalEmbedder, "__init__", _no_sentence_transformers)
    emb = _run(get_embedder())
    v_a = _run(emb.embed("hello world"))
    v_b = _run(emb.embed("hello world"))
    v_c = _run(emb.embed("different text entirely"))
    assert len(v_a) == len(v_c) == ef.HashEmbedder.DIM
    assert v_a == v_b
    assert v_a != v_c
