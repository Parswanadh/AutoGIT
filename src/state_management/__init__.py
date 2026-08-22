"""State management: VectorStore only (redis/cache/event_stream retained but not re-exported)."""

try:
    from .vector_store import VectorStore
except ImportError:  # pragma: no cover - optional backend deps
    VectorStore = None

__all__ = ["VectorStore"]
