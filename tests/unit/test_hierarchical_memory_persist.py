"""Persistence tests for HierarchicalMemory episode embeddings."""
import asyncio
import json
import sys
import types

import src.agents.memory.hierarchical_memory as hm_mod
from src.agents.memory.hierarchical_memory import HierarchicalMemory, Episode


class FakeClient:
    """Deterministic stand-in for OllamaClient."""

    async def embed(self, model=None, text=""):
        if "quantization" in text:
            return [1.0, 0.0]
        return [0.0, 1.0]


def make_memory(path):
    orig = hm_mod.get_ollama_client
    hm_mod.get_ollama_client = lambda: FakeClient()
    try:
        return HierarchicalMemory(storage_path=str(path))
    finally:
        hm_mod.get_ollama_client = orig


def problem(challenge):
    return {"domain": "ml", "challenge": challenge}


def store(mem, challenge, outcome="success"):
    return asyncio.run(mem.remember_debate(
        problem=problem(challenge),
        solution=f"use {challenge}",
        critiques=[],
        consensus={},
        outcome=outcome,
        quality_score=9.0,
        tokens_used=10,
        latency_seconds=0.1,
    ))


def install_fake_factory(monkeypatch):
    calls = []
    pkg = types.ModuleType("src.utils.embeddings")
    mod = types.ModuleType("src.utils.embeddings.embedder_factory")

    class FakeEmbedder:
        async def embed(self, text):
            calls.append(text)
            return [1.0, 0.0] if "quantization" in text else [0.0, 1.0]

    async def fake_get_embedder():
        return FakeEmbedder()

    mod.get_embedder = fake_get_embedder
    monkeypatch.setitem(sys.modules, "src.utils.embeddings", pkg)
    monkeypatch.setitem(sys.modules, "src.utils.embeddings.embedder_factory", mod)
    return calls


def test_save_persists_embedding(tmp_path):
    mem = make_memory(tmp_path)
    eid = store(mem, "quantization for speed")
    line = (tmp_path / "episodes.jsonl").read_text().strip().splitlines()[0]
    data = json.loads(line)
    assert data["episode_id"] == eid
    assert data["embedding"] == [1.0, 0.0]


def test_reload_keeps_embedding_and_retrieves_same_top_hit(tmp_path):
    mem = make_memory(tmp_path)
    eid_a = store(mem, "quantization for speed")
    store(mem, "scalability concerns")

    reloaded = make_memory(tmp_path)
    assert all(e.embedding is not None for e in reloaded.episodes.values())

    hits = asyncio.run(reloaded.retrieve_relevant(problem("quantization for speed")))
    assert hits[0].episode_id == eid_a


def test_no_reembedding_when_persisted(tmp_path, monkeypatch):
    calls = install_fake_factory(monkeypatch)
    mem = make_memory(tmp_path)
    store(mem, "quantization for speed")

    reloaded = make_memory(tmp_path)
    hits = asyncio.run(reloaded.retrieve_relevant(problem("quantization for speed")))

    assert hits
    assert calls == []


def test_backfills_missing_embeddings_once(tmp_path, monkeypatch):
    calls = install_fake_factory(monkeypatch)
    mem = make_memory(tmp_path)
    eid_a = store(mem, "quantization for speed")
    store(mem, "scalability concerns")

    reloaded = make_memory(tmp_path)
    reloaded.episodes[eid_a].embedding = None  # simulate legacy row

    hits = asyncio.run(reloaded.retrieve_relevant(problem("quantization for speed")))
    assert len(calls) == 1
    assert hits[0].episode_id == eid_a

    asyncio.run(reloaded.retrieve_relevant(problem("quantization for speed")))
    assert len(calls) == 1  # cached, not recomputed


def test_missing_factory_skips_semantic_search_gracefully(tmp_path, monkeypatch):
    monkeypatch.setitem(
        sys.modules, "src.utils.embeddings.embedder_factory", None
    )
    mem = make_memory(tmp_path)
    store(mem, "quantization for speed")

    reloaded = make_memory(tmp_path)
    for e in reloaded.episodes.values():
        e.embedding = None

    hits = asyncio.run(reloaded.retrieve_relevant(problem("quantization for speed")))
    assert hits == []


def test_no_nameerror_when_skills_unextracted(tmp_path):
    mem = make_memory(tmp_path)
    eid = store(mem, "quantization for speed", outcome="failure")
    assert eid in mem.episodes

    # success but below skill-extraction threshold leaves `skills` unbound
    eid2 = asyncio.run(mem.remember_debate(
        problem=problem("quantization for speed"),
        solution="plain answer",
        critiques=[],
        consensus={},
        outcome="success",
        quality_score=5.0,
        tokens_used=10,
        latency_seconds=0.1,
    ))
    assert eid2 in mem.episodes


def test_episode_file_capped_at_2000(tmp_path):
    mem = make_memory(tmp_path)
    for i in range(2010):
        mem.episodes[f"ep_{i}"] = Episode(
            episode_id=f"ep_{i}", timestamp=float(i),
            problem=problem(f"c{i}"), solution="s", critiques=[],
            consensus={}, outcome="success", quality_score=9.0,
            tokens_used=1, latency_seconds=0.1,
        )

    asyncio.run(mem._save_memory())

    lines = (tmp_path / "episodes.jsonl").read_text().strip().splitlines()
    assert len(lines) == 2000
    ids = {json.loads(l)["episode_id"] for l in lines}
    assert "ep_0" not in ids
    assert "ep_2009" in ids
    assert len(mem.episodes) == 2000


def test_save_is_atomic_no_tmp_leftover(tmp_path):
    mem = make_memory(tmp_path)
    store(mem, "quantization for speed")

    leftovers = [p.name for p in tmp_path.iterdir() if p.name.endswith(".tmp")]
    assert leftovers == []
    json.loads((tmp_path / "patterns.json").read_text())
    json.loads((tmp_path / "skills.json").read_text())
