"""
Local File-Based Checkpointer (No Docker/Redis Required)
========================================================

Persistent state management using local files.
"""

from langgraph.checkpoint.base import BaseCheckpointSaver, Checkpoint
from typing import Optional, Dict, Any, Iterator
from pathlib import Path
import base64
import hashlib
import hmac
import json
import logging
import os
from datetime import datetime

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


def _serialize(obj: Any) -> str:
    enc = _encode(obj)
    key = _hmac_key()
    if key:
        payload = json.dumps(enc, sort_keys=True, separators=(",", ":"))
        sig = hmac.new(key.encode(), payload.encode(), hashlib.sha256).hexdigest()
        wrapper = {"__hmac": sig, "data": enc}
        return json.dumps(wrapper)
    return json.dumps(enc)


def _deserialize(s: str) -> Any:
    obj = json.loads(s)
    key = _hmac_key()
    if isinstance(obj, dict) and "__hmac" in obj and "data" in obj and len(obj) == 2:
        if key:
            payload = json.dumps(obj["data"], sort_keys=True, separators=(",", ":"))
            exp = hmac.new(key.encode(), payload.encode(), hashlib.sha256).hexdigest()
            if not hmac.compare_digest(exp, obj["__hmac"]):
                raise ValueError("checkpoint HMAC verification failed")
        obj = obj["data"]
    return _decode(obj)


def _load_legacy_pickle(path: Path) -> Any:
    try:
        pk = __import__("pickle")
        with open(path, "rb") as f:
            return pk.load(f)
    except Exception as e:
        logger.warning(f"Failed legacy pickle load {path}: {e}")
        return None


class LocalFileCheckpointer(BaseCheckpointSaver):
    """
    File-based checkpointing for LangGraph workflows.
    
    Stores checkpoints as JSON files in a local directory (hmac optional, bytes via base64).
    Survives restarts and provides state persistence without Docker/Redis.
    
    Args:
        checkpoint_dir: Directory to store checkpoint files (default: .cache/checkpoints)
        ttl_hours: Hours to keep checkpoints before cleanup (default: 24)
        hmac_key: Optional HMAC key (defaults to env AUTOGIT_HMAC_KEY)
    """
    
    def __init__(
        self,
        checkpoint_dir: str = ".cache/checkpoints",
        ttl_hours: int = 24,
        hmac_key: Optional[str] = None
    ):
        self.checkpoint_dir = Path(checkpoint_dir)
        self.checkpoint_dir.mkdir(parents=True, exist_ok=True)
        self.ttl_hours = ttl_hours
        self.hmac_key = hmac_key
        if hmac_key:
            os.environ["AUTOGIT_HMAC_KEY"] = hmac_key
        logger.info(f"✅ Local checkpointer initialized at {self.checkpoint_dir}")
    
    def _get_checkpoint_path(self, thread_id: str, checkpoint_id: str = None) -> Path:
        """Get path for checkpoint file (json)"""
        if checkpoint_id:
            return self.checkpoint_dir / f"{thread_id}_{checkpoint_id}.json"
        else:
            return self.checkpoint_dir / f"{thread_id}_latest.json"
    
    def _get_legacy_path(self, thread_id: str, checkpoint_id: str = None) -> Path:
        """Legacy pickle path for fallback"""
        if checkpoint_id:
            return self.checkpoint_dir / f"{thread_id}_{checkpoint_id}.pkl"
        else:
            return self.checkpoint_dir / f"{thread_id}_latest.pkl"
    
    def _get_metadata_path(self, thread_id: str) -> Path:
        """Get path for metadata file"""
        return self.checkpoint_dir / f"{thread_id}_metadata.json"
    
    def put(
        self,
        config: Dict[str, Any],
        checkpoint: Checkpoint,
        metadata: Dict[str, Any]
    ) -> None:
        """
        Save a checkpoint to disk.
        
        Args:
            config: Configuration with thread_id
            checkpoint: Checkpoint object to save
            metadata: Checkpoint metadata
        """
        try:
            thread_id = config["configurable"]["thread_id"]
            checkpoint_id = checkpoint.get("id", "latest")
            
            checkpoint_path = self._get_checkpoint_path(thread_id, checkpoint_id)
            with open(checkpoint_path, 'w') as f:
                f.write(_serialize(checkpoint))
            # ponytail: keep latest.json in sync (factory shim compat)
            try:
                latest_path = self._get_checkpoint_path(thread_id)
                if checkpoint_path != latest_path:
                    import shutil
                    shutil.copy(checkpoint_path, latest_path)
            except Exception:
                pass
            
            metadata_path = self._get_metadata_path(thread_id)
            metadata_with_timestamp = {
                **metadata,
                "saved_at": datetime.now().isoformat(),
                "checkpoint_id": checkpoint_id,
                "checkpoint_file": str(checkpoint_path)
            }
            
            with open(metadata_path, 'w') as f:
                json.dump(metadata_with_timestamp, f, indent=2)
            
            logger.debug(f"💾 Checkpoint saved: {checkpoint_path.name}")
        
        except Exception as e:
            logger.warning(f"Failed to save checkpoint: {e}")
    
    def get(self, config: Dict[str, Any]) -> Optional[Checkpoint]:
        """
        Load the latest checkpoint from disk (json first, pickle fallback).
        
        Args:
            config: Configuration with thread_id
            
        Returns:
            Checkpoint object if found, None otherwise
        """
        try:
            thread_id = config["configurable"]["thread_id"]
            
            checkpoint_path = self._get_checkpoint_path(thread_id)
            legacy_path = self._get_legacy_path(thread_id)
            
            if checkpoint_path.exists():
                try:
                    with open(checkpoint_path, 'r') as f:
                        checkpoint = _deserialize(f.read())
                    logger.debug(f"📂 Checkpoint loaded: {checkpoint_path.name}")
                    return checkpoint
                except (json.JSONDecodeError, ValueError) as e:
                    logger.warning(f"JSON load failed {checkpoint_path}: {e}, trying legacy")
                    # fall through to legacy
                except Exception as e:
                    logger.warning(f"Failed to load checkpoint: {e}")
                    return None
            
            if legacy_path.exists():
                chk = _load_legacy_pickle(legacy_path)
                if chk is not None:
                    logger.debug(f"📂 Legacy checkpoint loaded: {legacy_path.name}")
                    return chk
                return None
            
            logger.debug(f"No checkpoint found for thread {thread_id}")
            return None
        
        except Exception as e:
            logger.warning(f"Failed to load checkpoint: {e}")
            return None
    
    async def aget(self, config: Dict[str, Any]) -> Optional[Checkpoint]:
        """Async version of get"""
        return self.get(config)
    
    async def aput(
        self,
        config: Dict[str, Any],
        checkpoint: Checkpoint,
        metadata: Dict[str, Any]
    ) -> None:
        """Async version of put"""
        self.put(config, checkpoint, metadata)
    
    def get_tuple(self, config: Dict[str, Any]) -> Optional[tuple]:
        """Get checkpoint as tuple (checkpoint, metadata)"""
        try:
            checkpoint = self.get(config)
            if checkpoint is None:
                return None
            
            thread_id = config["configurable"]["thread_id"]
            metadata_path = self._get_metadata_path(thread_id)
            
            if metadata_path.exists():
                with open(metadata_path, 'r') as f:
                    metadata = json.load(f)
            else:
                metadata = {}
            
            return (checkpoint, metadata)
        except Exception as e:
            logger.warning(f"Failed to get checkpoint tuple: {e}")
            return None
    
    async def aget_tuple(self, config: Dict[str, Any]) -> Optional[tuple]:
        """Async version of get_tuple"""
        return self.get_tuple(config)
    
    def list(self, config: Dict[str, Any]) -> Iterator[Checkpoint]:
        """
        List all checkpoints for a thread (json first, fallback pickle).
        
        Args:
            config: Configuration with thread_id
            
        Yields:
            Checkpoint objects
        """
        try:
            thread_id = config["configurable"]["thread_id"]
            
            for pattern in [f"{thread_id}_*.json", f"{thread_id}_*.pkl"]:
                checkpoint_files = sorted(
                    self.checkpoint_dir.glob(pattern),
                    key=lambda p: p.stat().st_mtime,
                    reverse=True
                )
                for checkpoint_path in checkpoint_files:
                    if checkpoint_path.name.endswith("_metadata.json"):
                        continue
                    try:
                        if checkpoint_path.suffix == ".json":
                            with open(checkpoint_path, 'r') as f:
                                checkpoint = _deserialize(f.read())
                        else:
                            checkpoint = _load_legacy_pickle(checkpoint_path)
                            if checkpoint is None:
                                continue
                        yield checkpoint
                    except Exception as e:
                        logger.warning(f"Failed to load checkpoint {checkpoint_path}: {e}")
                        continue
        
        except Exception as e:
            logger.warning(f"Failed to list checkpoints: {e}")
    
    def cleanup_old_checkpoints(self) -> int:
        """
        Remove checkpoints older than TTL.
        
        Returns:
            Number of checkpoints removed
        """
        removed = 0
        current_time = datetime.now().timestamp()
        ttl_seconds = self.ttl_hours * 3600
        
        try:
            for pattern in ["*.json", "*.pkl"]:
                for checkpoint_file in self.checkpoint_dir.glob(pattern):
                    if checkpoint_file.name.endswith("_metadata.json"):
                        continue
                    file_age = current_time - checkpoint_file.stat().st_mtime
                    if file_age > ttl_seconds:
                        checkpoint_file.unlink()
                        removed += 1
                        logger.debug(f"🗑️  Removed old checkpoint: {checkpoint_file.name}")
            
            if removed > 0:
                logger.info(f"🗑️  Cleaned up {removed} old checkpoints")
        
        except Exception as e:
            logger.warning(f"Checkpoint cleanup failed: {e}")
        
        return removed
    
    def get_stats(self) -> Dict[str, Any]:
        """
        Get checkpointer statistics.
        
        Returns:
            Dict with checkpoint stats
        """
        try:
            checkpoint_files = list(self.checkpoint_dir.glob("*.json"))
            # exclude metadata
            checkpoint_files = [p for p in checkpoint_files if not p.name.endswith("_metadata.json")]
            # include legacy for stats
            legacy_files = list(self.checkpoint_dir.glob("*.pkl"))
            all_files = checkpoint_files + legacy_files
            total_size = sum(f.stat().st_size for f in all_files)
            
            threads = set()
            for f in all_files:
                thread_id = f.stem.split("_")[0]
                threads.add(thread_id)
            
            return {
                "checkpoint_count": len(all_files),
                "thread_count": len(threads),
                "total_size_mb": round(total_size / (1024 * 1024), 2),
                "checkpoint_dir": str(self.checkpoint_dir)
            }
        
        except Exception as e:
            logger.warning(f"Failed to get stats: {e}")
            return {}
