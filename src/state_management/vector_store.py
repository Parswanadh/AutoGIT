"""Vector store singleton: in-memory dict+cosine or ChromaDB persistence."""

import math
import threading

try:
    from src.utils.embeddings.embedder_factory import cosine
except ImportError:  # embeddings module not present yet; local fallback
    def cosine(a, b):
        dot = sum(x * y for x, y in zip(a, b))
        na = math.sqrt(sum(x * x for x in a))
        nb = math.sqrt(sum(x * x for x in b))
        return dot / (na * nb) if na and nb else 0.0


class _MemoryBackend:
    """dict of id -> (vector, payload), linear scan."""

    def __init__(self):
        self._items = {}

    def put(self, id, vector, payload):
        self._items[id] = (list(vector), payload)

    def search(self, qvec, k=5, threshold=0.85):
        scored = [
            (id_, cosine(qvec, vec), payload)
            for id_, (vec, payload) in self._items.items()
        ]
        hits = [h for h in scored if h[1] >= threshold]
        hits.sort(key=lambda h: h[1], reverse=True)
        return hits[:k]

    def get(self, id):
        item = self._items.get(id)
        return item[1] if item else None


class _ChromaBackend:
    """Persistent ChromaDB wrapper, lazily imported."""

    def __init__(self, path):
        import chromadb
        from chromadb.config import Settings

        self._client = chromadb.PersistentClient(
            path=path, settings=Settings(anonymized_telemetry=False)
        )
        self._col = self._client.get_or_create_collection(
            "papers_novelty", metadata={"hnsw:space": "cosine"}
        )

    def put(self, id, vector, payload):
        # ponytail: chroma metadata requires scalars; nested payloads flatten later
        self._col.upsert(ids=[id], embeddings=[vector], metadatas=[payload])

    def search(self, qvec, k=5, threshold=0.85):
        res = self._col.query(query_embeddings=[qvec], n_results=k)
        hits = []
        for i, id_ in enumerate(res["ids"][0]):
            score = 1.0 - res["distances"][0][i]  # cosine distance -> similarity
            if score >= threshold:
                hits.append((id_, score, res["metadatas"][0][i]))
        return hits

    def get(self, id):
        res = self._col.get(ids=[id])
        return res["metadatas"][0] if res["ids"] else None


def _chroma_path():
    """Read vector_db.path from config.yaml, default ./data/vector_db."""
    from pathlib import Path

    try:
        import yaml

        cfg = Path("config.yaml")
        if cfg.exists():
            data = yaml.safe_load(cfg.read_text()) or {}
            return data.get("vector_db", {}).get("path") or "./data/vector_db"
    except Exception:
        pass
    return "./data/vector_db"


class VectorStore:
    """Singleton facade over memory/chroma backends.

    Hits are (id, score, payload) tuples sorted by score desc.
    """

    _instances = {}
    _lock = threading.Lock()

    def __init__(self, backend="memory", path=None):
        if backend == "memory":
            self._impl = _MemoryBackend()
        elif backend == "chroma":
            self._impl = _ChromaBackend(path or _chroma_path())
        else:
            raise ValueError(f"unknown backend: {backend!r} (memory|chroma only)")

    @classmethod
    def get_instance(cls, backend="memory", path=None):
        """Return process-wide singleton for the backend (first path wins)."""
        with cls._lock:
            if backend not in cls._instances:
                cls._instances[backend] = cls(backend, path=path)
            return cls._instances[backend]

    def put(self, id, vector, payload):
        self._impl.put(id, vector, payload)

    def search(self, qvec, k=5, threshold=0.85):
        return self._impl.search(qvec, k=k, threshold=threshold)

    def get(self, id):
        return self._impl.get(id)
