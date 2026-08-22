"""Quota guard tests — must pass without new deps."""
import datetime
import tempfile
from pathlib import Path

from src.scraper.tavily_quota import (
    TavilyQuota,
    DEFAULT_LIMIT,
    guarded_search,
    check_quota,
    inc,
    remaining,
    get_quota,
    should_use_tavily,
)


def _tmp_quota(limit=5):
    p = tempfile.mktemp(suffix=".db")
    q = TavilyQuota(db_path=p, limit=limit)
    return q, p


def test_default_limit_2000():
    assert DEFAULT_LIMIT == 2000
    q, p = _tmp_quota(limit=2000)
    assert q.limit == 2000
    Path(p).unlink(missing_ok=True)


def test_config_has_quota():
    import yaml
    data = yaml.safe_load(Path("config.yaml").read_text())
    assert "tavily_quota" in data
    assert data["tavily_quota"]["monthly_limit"] == 2000
    assert data["tavily_quota"]["fallback_engine"] == "ddgs"
    assert data["tavily_quota"]["db_path"] == "./data/cache.db"


def test_check_quota_inc_remaining():
    q, p = _tmp_quota(limit=3)
    now = datetime.datetime(2026, 8, 22)
    assert q.check_quota(now=now) is True
    assert q.remaining(now) == 3
    assert q.count(now) == 0
    assert q.inc(now=now) is True
    assert q.remaining(now) == 2
    assert q.check_quota(now=now) is True
    assert q.inc(2, now=now) is True
    assert q.remaining(now) == 0
    assert q.check_quota(now=now) is False
    assert q.inc(now=now) is False
    Path(p).unlink(missing_ok=True)


def test_inc_blocks_at_limit():
    q, p = _tmp_quota(limit=2)
    now = datetime.datetime(2026, 8, 1)
    assert q.inc(now=now) is True
    assert q.inc(now=now) is True
    # 2/2 exhausted
    assert q.check_quota(now=now) is False
    assert q.remaining(now) == 0
    assert q.inc(now=now) is False
    assert q.count(now) == 2  # not incremented past limit
    Path(p).unlink(missing_ok=True)


def test_per_month_isolation():
    q, p = _tmp_quota(limit=2)
    aug = datetime.datetime(2026, 8, 15)
    sep = datetime.datetime(2026, 9, 1)
    q.inc(2, now=aug)
    assert q.remaining(aug) == 0
    assert q.remaining(sep) == 2  # new month fresh
    assert q.check_quota(now=sep) is True
    assert q.inc(now=sep) is True
    assert q.count(sep) == 1
    assert q.count(aug) == 2
    Path(p).unlink(missing_ok=True)


def test_remaining_never_negative():
    q, p = _tmp_quota(limit=1)
    now = datetime.datetime(2026, 8, 22)
    q.inc(now=now)
    assert q.remaining(now) == 0
    q.inc(now=now)  # blocked
    assert q.remaining(now) == 0
    Path(p).unlink(missing_ok=True)


def test_status():
    q, p = _tmp_quota(limit=10)
    now = datetime.datetime(2026, 8, 22)
    q.inc(3, now=now)
    s = q.status(now)
    assert s["month"] == "2026-08"
    assert s["count"] == 3
    assert s["remaining"] == 7
    assert s["exhausted"] is False
    Path(p).unlink(missing_ok=True)


def test_graceful_fallback_when_exhausted():
    q, p = _tmp_quota(limit=1)
    now = datetime.datetime(2026, 8, 22)

    def tavily_fn(x): return [{"engine": "tavily", "q": x}]
    def ddgs_fn(x): return [{"engine": "ddgs", "q": x}]

    # first call uses tavily
    res, eng = guarded_search("hello", tavily_fn, ddgs_fn, quota=q, now=now)
    assert eng == "tavily"
    assert res[0]["engine"] == "tavily"
    assert q.count(now) == 1

    # second call exhausted -> ddgs
    res, eng = guarded_search("world", tavily_fn, ddgs_fn, quota=q, now=now)
    assert eng == "ddgs"
    assert res[0]["engine"] == "ddgs"
    assert q.count(now) == 1  # not incremented on fallback
    Path(p).unlink(missing_ok=True)


def test_fallback_on_tavily_error():
    q, p = _tmp_quota(limit=5)
    now = datetime.datetime(2026, 8, 22)

    def bad_tavily(x): raise RuntimeError("tavily down")
    def ddgs_fn(x): return [{"engine": "ddgs"}]

    res, eng = guarded_search("q", bad_tavily, ddgs_fn, quota=q, now=now)
    assert eng == "ddgs"
    assert res[0]["engine"] == "ddgs"
    Path(p).unlink(missing_ok=True)


def test_module_helpers():
    # reset singleton by creating fresh db
    import src.scraper.tavily_quota as tq
    tq._default = None
    tmp = tempfile.mktemp(suffix=".db")
    q = get_quota(db_path=tmp, limit=7)
    now = datetime.datetime(2026, 8, 22)
    assert check_quota(now=now, quota=q) is True
    assert remaining(now=now, quota=q) == 7
    assert inc(now=now, quota=q) is True
    assert should_use_tavily(quota=q, now=now) is True
    assert remaining(now=now, quota=q) == 6
    assert check_quota(n=7, now=now, quota=q) is False
    Path(tmp).unlink(missing_ok=True)
    tq._default = None


def test_no_new_deps():
    # ensure only stdlib + SQLiteCache used
    txt = Path("src/scraper/tavily_quota.py").read_text()
    assert "from src.utils.cache import SQLiteCache" in txt
    assert "import tavily" not in txt.lower() or "TavilyClient" not in txt  # no hard dep
    assert "DEFAULT_LIMIT = 2000" in txt


def test_sqlitecache_persistence():
    # counter survives reload via file
    tmp = tempfile.mktemp(suffix=".db")
    now = datetime.datetime(2026, 8, 22)
    q1 = TavilyQuota(db_path=tmp, limit=5)
    q1.inc(2, now=now)
    del q1
    q2 = TavilyQuota(db_path=tmp, limit=5)
    assert q2.count(now) == 2
    assert q2.remaining(now) == 3
    Path(tmp).unlink(missing_ok=True)
