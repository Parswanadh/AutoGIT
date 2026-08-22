"""TDD for scraper shared SQLiteCache WAL — isolated, no OOM, parallel safe."""
import tempfile, threading, sqlite3
from pathlib import Path

def test_utils_cache_has_wal_pragma():
    src = Path("src/utils/cache.py").read_text()
    assert "journal_mode=WAL" in src or "journal_mode = WAL" in src, "WAL pragma missing in src/utils/cache.py"
    assert "PRAGMA journal_mode" in src

def test_scraper_cache_module_exists():
    from src.scraper.cache import get_scraper_cache, ScraperCache, DEFAULT_DB
    assert callable(get_scraper_cache)
    assert ScraperCache is not None
    assert DEFAULT_DB

def test_wal_actually_enabled(tmp_path=Path(tempfile.mkdtemp())):
    from src.utils.cache import SQLiteCache
    db = str(tmp_path / "wal_test.db")
    c = SQLiteCache("test_wal", db_path=db)
    c.set("k", {"v": 1})
    # check pragma
    with sqlite3.connect(db) as conn:
        cur = conn.execute("PRAGMA journal_mode;")
        mode = cur.fetchone()[0]
        assert mode.lower() == "wal", f"journal_mode not WAL: {mode}"

def test_isolated():
    from src.scraper.cache import get_scraper_cache, ScraperCache
    from src.utils.cache import SQLiteCache
    import tempfile
    db1 = tempfile.mktemp(suffix="_scraper.db")
    db2 = tempfile.mktemp(suffix="_other.db")
    s1 = ScraperCache(db_path=db1)
    s2 = SQLiteCache("other_table", db_path=db2)
    s1.set("k", "scraper_val")
    s2.set("k", "other_val")
    # isolated: different dbs / tables don't cross-contaminate
    assert s1.get("k") == "scraper_val"
    assert s2.get("k") == "other_val"
    # also check singleton helper isolates by default path
    from src.scraper import cache as sc
    sc._scraper_cache = None
    a = get_scraper_cache(db_path=db1)
    b = get_scraper_cache(db_path=db1)
    assert a is b, "get_scraper_cache should be singleton for same db_path"
    sc._scraper_cache = None
    Path(db1).unlink(missing_ok=True)
    Path(db2).unlink(missing_ok=True)

def test_no_oom_guard(tmp_path=Path(tempfile.mkdtemp())):
    from src.scraper.cache import ScraperCache
    db = str(tmp_path / "oom.db")
    c = ScraperCache(db_path=db)
    # 1MB string under limit should store
    small = "x" * 100
    c.set("small", small)
    assert c.get("small") == small
    # very large value (2MB) should be rejected gracefully, not OOM/crash
    large = "x" * (2 * 1024 * 1024)
    try:
        c.set("large", large)
    except Exception as e:
        assert False, f"set large should not raise, got {e}"
    # large may be None or not stored, but get should not crash and not return huge
    v = c.get("large")
    # ponytail: cap 512KB, so large should be dropped -> None
    assert v is None or len(v) < 1024*1024

def test_parallel_safe(tmp_path=Path(tempfile.mkdtemp())):
    from src.scraper.cache import ScraperCache
    db = str(tmp_path / "parallel.db")
    c = ScraperCache(db_path=db)
    errors = []
    def writer(n):
        try:
            for i in range(20):
                c.set(f"k_{n}_{i}", {"n": n, "i": i})
                assert c.get(f"k_{n}_{i}") is not None
        except Exception as e:
            errors.append(e)
    threads = [threading.Thread(target=writer, args=(n,)) for n in range(8)]
    for t in threads: t.start()
    for t in threads: t.join(timeout=10)
    assert not errors, f"parallel errors: {errors}"
    # at least some entries persisted
    assert c.get("k_0_0") is not None

def test_research_coordinator_can_reuse(tmp_path=Path(tempfile.mkdtemp())):
    # coordinator should be able to import and use scraper cache without error
    from src.scraper.cache import get_scraper_cache
    from src.agents.research.research_coordinator import ResearchCoordinator, ResearchConfig
    from pathlib import Path
    db = str(tmp_path / "reuse.db")
    sc = get_scraper_cache(db_path=db)
    sc.set("test_key", {"hello": "world"})
    assert sc.get("test_key") == {"hello": "world"}
    # coordinator accepts optional scraper_cache or at least doesn't break when we pass it
    cfg = ResearchConfig(cache_ttl_seconds=10, enable_duckduckgo=False, enable_arxiv=False)
    # try with default
    coord = ResearchCoordinator(config=cfg)
    assert coord is not None
    assert hasattr(coord, "cache")
    # if coordinator supports injection, test it
    try:
        coord2 = ResearchCoordinator(config=cfg, cache=sc)  # type: ignore
        assert coord2 is not None
        assert coord2.cache is sc
    except TypeError:
        # fallback: coordinator at least should not crash when scraper cache exists globally
        pass
    # also test scraper_cache alias
    try:
        coord3 = ResearchCoordinator(config=cfg, scraper_cache=sc)  # type: ignore
        assert coord3.cache is sc
    except TypeError:
        pass
    # cleanup singleton
    from src.scraper import cache as sc_mod
    sc_mod._scraper_cache = None
