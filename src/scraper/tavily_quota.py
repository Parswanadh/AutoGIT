"""Tavily monthly quota guard — SQLiteCache counter, 2000/mo, DDGS fallback."""
import datetime
from pathlib import Path
from typing import Optional, Callable, Any

from src.utils.cache import SQLiteCache
from src.utils.logger import get_logger

logger = get_logger("tavily_quota")

DEFAULT_LIMIT = 2000  # Tavily free tier
TABLE = "tavily_quota"


class TavilyQuota(SQLiteCache):
    """Monthly counter stored in SQLiteCache. Cost guard: block when exhausted."""

    def __init__(self, db_path: str = "./data/cache.db", limit: int = DEFAULT_LIMIT):
        super().__init__(TABLE, db_path, default_ttl=None)
        self.limit = int(limit)
        self.db_path = Path(db_path)  # keep for status

    def _month_key(self, now: Optional[datetime.datetime] = None) -> str:
        d = now or datetime.datetime.utcnow()
        return d.strftime("%Y-%m")

    def _get_count(self, key: str) -> int:
        v = self.get(key)
        return int(v) if v is not None else 0

    def count(self, now: Optional[datetime.datetime] = None) -> int:
        return self._get_count(self._month_key(now))

    def remaining(self, now: Optional[datetime.datetime] = None) -> int:
        return max(0, self.limit - self.count(now))

    def check_quota(self, n: int = 1, now: Optional[datetime.datetime] = None) -> bool:
        return self.count(now) + n <= self.limit

    # alias for spec wording
    def has_quota(self, n: int = 1, now: Optional[datetime.datetime] = None) -> bool:
        return self.check_quota(n, now)

    def inc(self, n: int = 1, now: Optional[datetime.datetime] = None) -> bool:
        """Increment counter by n if under limit. Returns True if counted, False if blocked."""
        if n <= 0:
            return True
        key = self._month_key(now)
        # ponytail: read-then-write, global lock if >2000/mo throughput matters (it doesn't)
        cur = self._get_count(key)
        if cur + n > self.limit:
            logger.warning(f"[tavily_quota] blocked: {cur}/{self.limit} +{n} would exceed")
            return False
        self.set(key, cur + n)
        logger.debug(f"[tavily_quota] inc {cur} -> {cur+n} ({key})")
        return True

    def reset(self, now: Optional[datetime.datetime] = None) -> None:
        """Delete current month counter (tests only)."""
        self.delete(self._month_key(now))

    def status(self, now: Optional[datetime.datetime] = None) -> dict:
        c = self.count(now)
        return {"month": self._month_key(now), "count": c, "limit": self.limit, "remaining": max(0, self.limit - c), "exhausted": c >= self.limit}


# --- module singleton + helpers (spec: check_quota/inc/remaining) ---
_default: Optional[TavilyQuota] = None


def _load_limit() -> int:
    try:
        import yaml
        p = Path("config.yaml")
        if p.exists():
            data = yaml.safe_load(p.read_text()) or {}
            v = data.get("tavily_quota", {}).get("monthly_limit")
            if v is not None:
                return int(v)
            v = data.get("tavily", {}).get("monthly_limit")
            if v is not None:
                return int(v)
    except Exception:
        pass
    import os
    return int(os.getenv("TAVILY_MONTHLY_LIMIT", str(DEFAULT_LIMIT)))


def get_quota(db_path: str = "./data/cache.db", limit: Optional[int] = None) -> TavilyQuota:
    global _default
    lim = limit if limit is not None else _load_limit()
    if _default is None or _default.limit != lim or str(_default.db_path) != db_path:
        _default = TavilyQuota(db_path=db_path, limit=lim)
    return _default


def check_quota(n: int = 1, now: Optional[datetime.datetime] = None, quota: Optional[TavilyQuota] = None) -> bool:
    q = quota or get_quota()
    return q.check_quota(n, now)


def inc(n: int = 1, now: Optional[datetime.datetime] = None, quota: Optional[TavilyQuota] = None) -> bool:
    q = quota or get_quota()
    return q.inc(n, now)


def remaining(now: Optional[datetime.datetime] = None, quota: Optional[TavilyQuota] = None) -> int:
    q = quota or get_quota()
    return q.remaining(now)


# aliases ponytail: spec may expect these names
inc_quota = inc
get_remaining = remaining
has_quota = check_quota


def should_use_tavily(n: int = 1, now: Optional[datetime.datetime] = None, quota: Optional[TavilyQuota] = None) -> bool:
    q = quota or get_quota()
    return q.check_quota(n, now)


def record_tavily_call(n: int = 1, now: Optional[datetime.datetime] = None, quota: Optional[TavilyQuota] = None) -> bool:
    q = quota or get_quota()
    return q.inc(n, now)


def guarded_search(
    query: str,
    tavily_fn: Callable[[str], Any],
    ddgs_fn: Callable[[str], Any],
    n: int = 1,
    now: Optional[datetime.datetime] = None,
    quota: Optional[TavilyQuota] = None,
) -> tuple[Any, str]:
    """Try tavily if quota remains, else fallback to DDGS. Cost guard: inc only on success."""
    q = quota or get_quota()
    if q.check_quota(n, now):
        try:
            res = tavily_fn(query)
            q.inc(n, now)
            return res, "tavily"
        except Exception as e:
            logger.warning(f"[tavily_quota] tavily failed {e}, falling back to ddgs")
            try:
                return ddgs_fn(query), "ddgs"
            except Exception:
                return [], "ddgs"
    # exhausted -> graceful fallback
    logger.info(f"[tavily_quota] exhausted {q.count(now)}/{q.limit}, using ddgs fallback")
    try:
        return ddgs_fn(query), "ddgs"
    except Exception:
        return [], "ddgs"


if __name__ == "__main__":
    # ponytail: self-check, fails if counter logic breaks
    import tempfile, os
    tmp = tempfile.mktemp(suffix=".db")
    q = TavilyQuota(db_path=tmp, limit=5)
    now = datetime.datetime(2026, 8, 22)
    now2 = datetime.datetime(2026, 9, 1)
    assert q.remaining(now) == 5
    assert q.check_quota(now=now) is True
    assert q.inc(now=now) is True
    assert q.count(now) == 1
    assert q.remaining(now) == 4
    for _ in range(4):
        assert q.inc(now=now) is True
    assert q.count(now) == 5
    assert q.check_quota(now=now) is False
    assert q.inc(now=now) is False  # blocked at limit
    assert q.remaining(now) == 0
    # per-month isolation
    assert q.count(now2) == 0
    assert q.check_quota(now=now2) is True
    assert q.remaining(now2) == 5
    # fallback
    def tavily_ok(x): return [{"engine": "tavily", "q": x}]
    def ddgs_ok(x): return [{"engine": "ddgs", "q": x}]
    q2 = TavilyQuota(db_path=tempfile.mktemp(suffix=".db"), limit=1)
    r, eng = guarded_search("hi", tavily_ok, ddgs_ok, quota=q2, now=now)
    assert eng == "tavily"
    r, eng = guarded_search("hi2", tavily_ok, ddgs_ok, quota=q2, now=now)
    assert eng == "ddgs"  # exhausted -> fallback
    # exhausted still returns ddgs result
    assert r[0]["engine"] == "ddgs"
    # reset
    q.reset(now)
    assert q.count(now) == 0
    Path(tmp).unlink(missing_ok=True)
    print("tavily_quota self-check ok")
