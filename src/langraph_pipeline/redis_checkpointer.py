"""
Redis-based checkpointer for LangGraph.

Replaces in-memory MemorySaver with Redis persistence.
Survives restarts and enables distributed workflows.
"""

from langgraph.checkpoint.base import BaseCheckpointSaver, Checkpoint
from typing import Optional, Iterator, Tuple, Any
import base64
import hashlib
import hmac
import json
import logging
import os

logger = logging.getLogger(__name__)


def _hmac_key() -> Optional[str]:
    return os.getenv("AUTOGIT_HMAC_KEY") or os.getenv("CHECKPOINT_HMAC_KEY")


def _encode(obj: Any) -> Any:
    if isinstance(obj, bytes):
        return {"__bytes_b64": base64.b64encode(obj).decode("ascii")}
    if isinstance(obj, dict):
        return {k: _encode(v) for k, v in obj.items()}
    if isinstance(obj, list):
        return [_encode(v) for v in obj]
    if isinstance(obj, tuple):
        return {"__tuple__": [_encode(v) for v in obj]}
    return obj


def _decode(obj: Any) -> Any:
    if isinstance(obj, dict):
        if "__bytes_b64" in obj and len(obj) == 1:
            try:
                return base64.b64decode(obj["__bytes_b64"])
            except Exception:
                return obj
        if "__tuple__" in obj and len(obj) == 1:
            return tuple(_decode(v) for v in obj["__tuple__"])
        return {k: _decode(v) for k, v in obj.items()}
    if isinstance(obj, list):
        return [_decode(v) for v in obj]
    return obj


def _serialize(obj: Any) -> bytes:
    enc = _encode(obj)
    key = _hmac_key()
    if key:
        payload = json.dumps(enc, sort_keys=True, separators=(",", ":"))
        sig = hmac.new(key.encode(), payload.encode(), hashlib.sha256).hexdigest()
        wrapper = {"__hmac": sig, "data": enc}
        return json.dumps(wrapper).encode()
    return json.dumps(enc).encode()


def _deserialize(data: bytes) -> Any:
    # try json first, fallback pickle
    try:
        text = data.decode() if isinstance(data, (bytes, bytearray)) else data
        obj = json.loads(text)
    except (json.JSONDecodeError, UnicodeDecodeError):
        # legacy pickle fallback
        try:
            pk = __import__("pickle")
            return pk.loads(data)
        except Exception:
            raise
    key = _hmac_key()
    if isinstance(obj, dict) and "__hmac" in obj and "data" in obj and len(obj) == 2:
        if key:
            payload = json.dumps(obj["data"], sort_keys=True, separators=(",", ":"))
            exp = hmac.new(key.encode(), payload.encode(), hashlib.sha256).hexdigest()
            if not hmac.compare_digest(exp, obj["__hmac"]):
                raise ValueError("checkpoint HMAC verification failed")
        obj = obj["data"]
    return _decode(obj)


class RedisCheckpointSaver(BaseCheckpointSaver):
    """
    Checkpoint saver that persists to Redis (JSON + base64 + optional HMAC, pickle fallback).
    
    Survives restarts, enables distributed workflows.
    
    Usage:
        checkpointer = RedisCheckpointSaver()
        app = workflow.compile(checkpointer=checkpointer)
    """
    
    def __init__(
        self,
        redis_url: str = "redis://localhost:6379",
        ttl: int = 86400,  # 24 hours
        hmac_key: Optional[str] = None
    ):
        self.redis_url = redis_url
        self.ttl = ttl
        self._redis = None
        if hmac_key:
            os.environ["AUTOGIT_HMAC_KEY"] = hmac_key
        self._initialize_redis()
    
    def _initialize_redis(self):
        """Initialize Redis connection"""
        try:
            import redis
            self._redis = redis.from_url(self.redis_url, decode_responses=False)
            self._redis.ping()
            logger.info("✅ Redis checkpointer connected")
        except Exception as e:
            logger.warning(f"⚠️  Redis checkpointer unavailable: {e}")
            logger.warning("   Checkpoints will not persist across restarts")
            self._redis = None
    
    def put(self, config: dict, checkpoint: Checkpoint, metadata: dict) -> dict:
        """Save checkpoint to Redis"""
        if self._redis is None:
            return {"configurable": {"thread_id": config.get("configurable", {}).get("thread_id", "default")}}
        
        try:
            thread_id = config.get("configurable", {}).get("thread_id", "default")
            key = f"checkpoint:{thread_id}"
            
            data = _serialize({
                "checkpoint": checkpoint,
                "metadata": metadata
            })
            
            self._redis.setex(key, self.ttl, data)
            logger.debug(f"💾 Saved checkpoint for thread {thread_id}")
            
            return {"configurable": {"thread_id": thread_id}}
        
        except Exception as e:
            logger.error(f"Failed to save checkpoint: {e}")
            return {"configurable": {"thread_id": config.get("configurable", {}).get("thread_id", "default")}}
    
    def get_tuple(self, config: dict) -> Optional[Tuple]:
        """Load checkpoint from Redis (json first, pickle fallback)"""
        if self._redis is None:
            return None
        
        try:
            thread_id = config.get("configurable", {}).get("thread_id", "default")
            key = f"checkpoint:{thread_id}"
            
            data = self._redis.get(key)
            if data:
                loaded = _deserialize(data)
                logger.debug(f"📂 Loaded checkpoint for thread {thread_id}")
                return (config, loaded["checkpoint"], loaded["metadata"])
            
            return None
        
        except Exception as e:
            logger.debug(f"Checkpoint load error: {e}")
            return None
    
    def list(self, config: dict) -> Iterator[Tuple]:
        """List all checkpoints (for debugging)"""
        if self._redis is None:
            return
        
        try:
            thread_id = config.get("configurable", {}).get("thread_id", "default")
            pattern = f"checkpoint:{thread_id}*"
            
            for key in self._redis.scan_iter(pattern):
                data = self._redis.get(key)
                if data:
                    try:
                        loaded = _deserialize(data)
                    except Exception:
                        continue
                    yield (config, loaded["checkpoint"], loaded["metadata"])
        
        except Exception as e:
            logger.error(f"Checkpoint list error: {e}")
