"""Checkpointer factory (<80 lines)."""
from collections import namedtuple
from pathlib import Path
import os, sqlite3

Bundle = namedtuple("Bundle", "provider location checkpointer close")

def create_checkpointer(provider=None, logs_dir="logs", **kw):
    p = (provider or os.getenv("AUTOGIT_CHECKPOINTER_PROVIDER") or "sqlite").lower().strip()
    if p == "memory":
        from langgraph.checkpoint.memory import MemorySaver
        return Bundle(p, ":memory:", MemorySaver(), lambda: None)
    if p == "local":
        from .local_checkpointer import LocalFileCheckpointer as _LC
        class _L(_LC):  # ponytail: shim for langgraph 1.x + fix latest.pkl
            def put(self, c, ch, md, nv=None):
                r=super().put(c, ch, md)
                try:
                    import shutil; s=self._get_checkpoint_path(c["configurable"]["thread_id"], ch.get("id")); d=self._get_checkpoint_path(c["configurable"]["thread_id"])
                    if s.exists(): shutil.copy(s, d)
                except: pass
                return r
            def put_writes(self, c, w, t, p=""): return None
        d = str(Path(logs_dir) / "checkpoints")
        Path(d).mkdir(parents=True, exist_ok=True)
        return Bundle(p, d, _L(checkpoint_dir=d), lambda: None)
    if p == "redis":
        try:
            from .redis_checkpointer import RedisCheckpointSaver
            url = kw.get("redis_url") or os.getenv("REDIS_URL", "redis://localhost:6379")
            cp = RedisCheckpointSaver(redis_url=url)
            if getattr(cp, "_redis", None) is None:
                raise RuntimeError("redis unavailable")
            return Bundle(p, url, cp, lambda: None)
        except Exception:
            from langgraph.checkpoint.memory import MemorySaver
            return Bundle("memory", ":memory:", MemorySaver(), lambda: None)
    if p != "sqlite":
        from langgraph.checkpoint.memory import MemorySaver
        return Bundle("memory", ":memory:", MemorySaver(), lambda: None)
    from langgraph.checkpoint.sqlite import SqliteSaver
    class _A(SqliteSaver):  # ponytail: sync->async delegate, replace with AsyncSqliteSaver if throughput matters
        async def aget_tuple(self, c): return self.get_tuple(c)
        async def alist(self, c, *, filter=None, before=None, limit=None):
            for x in self.list(c, filter=filter, before=before, limit=limit): yield x
        async def aput(self, c, ch, md, nv): return self.put(c, ch, md, nv)
        async def aput_writes(self, c, w, t): return self.put_writes(c, w, t)
    Path(logs_dir).mkdir(parents=True, exist_ok=True)
    loc = str(Path(logs_dir) / "checkpoints.sqlite")
    conn = sqlite3.connect(loc, check_same_thread=False)
    return Bundle(p, loc, _A(conn), conn.close)

def load_existing_checkpoint(cp, cfg):
    try:
        return cp.get_tuple(cfg) if hasattr(cp, "get_tuple") else None
    except Exception:
        return None
