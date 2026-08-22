"""Unified embedder factory: Ollama -> sentence-transformers -> hash fallback."""
import hashlib
import math
from typing import List

from src.utils.logger import get_logger
from src.utils.ollama_client import get_ollama_client

logger = get_logger("embedder_factory")

EMBED_MODEL = "all-minilm"


class OllamaEmbedder:
    def __init__(self, client=None, model: str = EMBED_MODEL):
        self.client = client or get_ollama_client()
        self.model = model

    async def embed(self, text: str) -> List[float]:
        return await self.client.embed(self.model, text)


class LocalEmbedder:
    """sentence-transformers all-MiniLM-L6-v2, imported lazily."""

    def __init__(self):
        from sentence_transformers import SentenceTransformer  # lazy heavy dep

        self.model = SentenceTransformer("all-MiniLM-L6-v2")

    async def embed(self, text: str) -> List[float]:
        return [float(x) for x in self.model.encode(text)]


class HashEmbedder:
    # ponytail: semantic-free fallback; swap for a real model when quality matters
    DIM = 256

    async def embed(self, text: str) -> List[float]:
        vec = [
            hashlib.sha256(f"{i}:{text}".encode()).digest()[0] / 127.5 - 1.0
            for i in range(self.DIM)
        ]
        norm = math.sqrt(sum(v * v for v in vec)) or 1.0
        return [v / norm for v in vec]


_embedder = None


async def get_embedder():
    """Return singleton embedder, probing Ollama first, then local model, then hash."""
    global _embedder
    if _embedder is None:
        try:
            emb = OllamaEmbedder()
            await emb.embed("probe")
            _embedder = emb
        except Exception as e:
            logger.info(f"Ollama embeddings unavailable ({e}); trying sentence-transformers")
            try:
                _embedder = LocalEmbedder()
            except Exception as e:
                logger.info(f"sentence-transformers unavailable ({e}); using hash fallback")
                _embedder = HashEmbedder()
    return _embedder


def cosine(a, b) -> float:
    dot = sum(x * y for x, y in zip(a, b))
    na = math.sqrt(sum(x * x for x in a))
    nb = math.sqrt(sum(y * y for y in b))
    if na == 0.0 or nb == 0.0:
        return 0.0
    return dot / (na * nb)
