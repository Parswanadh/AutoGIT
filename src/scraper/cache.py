"""Scraper shared SQLiteCache — WAL, isolated, OOM-guarded, parallel-safe."""
import pickle
import threading
import sqlite3
from pathlib import Path
from typing import Optional, Any

from src.utils.cache import SQLiteCache
from src.utils.logger import get_logger

logger = get_logger("scraper_cache")

DEFAULT_DB = "./data/scraper_cache.db"
TABLE = "scraper_cache"
# ponytail: caps to avoid OOM — 512KB per entry, 5000 entries max
MAX_VALUE_BYTES = 512 * 1024
MAX_ENTRIES = 5000


class ScraperCache(SQLiteCache):
    """Isolated scraper cache. Shared via WAL, bounded to avoid OOM."""

    def __init__(self, db_path: str = DEFAULT_DB, default_ttl: Optional[float] = 3600):
        super().__init__(TABLE, db_path, default_ttl=default_ttl)

    def set(self, key: str, value: Any, ttl: Optional[float] = None):
        # ponytail: OOM guard — drop huge values before pickling hits disk
        try:
            blob = pickle.dumps(value)
            if len(blob) > MAX_VALUE_BYTES:
                logger.warning(f"[scraper_cache] drop large key={key} size={len(blob)} > {MAX_VALUE_BYTES}")
                return
        except Exception:
            pass  # let base handle pickle errors
        try:
            super().set(key, value, ttl=ttl)
        except Exception as e:
            logger.warning(f"[scraper_cache] set failed {e}")
            return
        # ponytail: bound entries to avoid unbounded growth / OOM
        try:
            with self._connect() as conn:
                cur = conn.execute(f"SELECT COUNT(*) FROM {self.name}")
                cnt = cur.fetchone()[0] or 0
                if cnt > MAX_ENTRIES:
                    to_del = cnt - MAX_ENTRIES
                    conn.execute(
                        f"DELETE FROM {self.name} WHERE key IN (SELECT key FROM {self.name} ORDER BY timestamp ASC LIMIT ?)",
                        (to_del,),
                    )
                    conn.commit()
                    logger.debug(f"[scraper_cache] evicted {to_del} oldest entries")
        except sqlite3.Error as e:
            logger.debug(f"[scraper_cache] eviction check failed {e}")


_scraper_cache: Optional[ScraperCache] = None
_lock = threading.Lock()


def get_scraper_cache(
    db_path: str = DEFAULT_DB, default_ttl: Optional[float] = 3600
) -> ScraperCache:
    """Shared singleton. Isolated db/table from other caches. Parallel-safe via WAL."""
    global _scraper_cache
    # ponytail: global lock, per-db locks if throughput matters
    with _lock:
        if _scraper_cache is None or str(_scraper_cache.db_path) != str(Path(db_path)):
            _scraper_cache = ScraperCache(db_path=db_path, default_ttl=default_ttl)
        return _scraper_cache


if __name__ == "__main__":
    # ponytail: minimal self-check
    import tempfile, threading as th

    tmp = tempfile.mktemp(suffix=".db")
    c = ScraperCache(db_path=tmp)
    c.set("k1", {"x": 1})
    assert c.get("k1") == {"x": 1}
    # OOM guard
    c.set("big", "x" * (2 * 1024 * 1024))
    assert c.get("big") is None
    # WAL check
    with sqlite3.connect(tmp) as conn:
        assert conn.execute("PRAGMA journal_mode;").fetchone()[0].lower() == "wal"
    # parallel
    errs = []

    def w(n):
        try:
            for i in range(10):
                c.set(f"p_{n}_{i}", i)
        except Exception as e:
            errs.append(e)

    ts = [th.Thread(target=w, args=(n,)) for n in range(4)]
    for t in ts:
        t.start()
    for t in ts:
        t.join()
    assert not errs
    Path(tmp).unlink(missing_ok=True)
    print("scraper_cache self-check ok")
