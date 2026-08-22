"""TDD: resilience primitives wired into research searchers.

Read-only on src/utils/rate_limiter.py and src/utils/retry.py.
Fakes stand in for limiter/breaker; asserts acquire called and attempts capped.
"""
import asyncio


# ---------- arXiv ----------

def _make_arxiv():
    from src.agents.research.arxiv_searcher import ArxivSearcher
    return ArxivSearcher()


def test_arxiv_rate_limit_acquired_before_client_results():
    s = _make_arxiv()
    order = []

    class FakeLimiter:
        async def acquire(self):
            order.append("acquire")

    class FakeClient:
        def results(self, search):
            order.append("results")
            return iter([])

    s.rate_limiter = FakeLimiter()
    s.client = FakeClient()
    out = asyncio.run(s.search("transformers", max_results=2))
    assert out == []
    assert order == ["acquire", "results"], order


def test_arxiv_retry_caps_attempts_at_two():
    s = _make_arxiv()

    class FakeLimiter:
        async def acquire(self):
            pass

    calls = []

    class FakeClient:
        def results(self, search):
            calls.append(1)
            raise ConnectionError("boom")

    s.rate_limiter = FakeLimiter()
    s.client = FakeClient()
    out = asyncio.run(s.search("q"))
    assert out == [], "graceful degradation: [] after retries exhausted"
    assert len(calls) == 2, f"expected max_attempts=2, got {len(calls)}"


# ---------- DuckDuckGo ----------

def _make_ddg():
    """ddgs not installed in env -> build instance without __init__, wire fakes."""
    import src.agents.research.duckduckgo_searcher as mod
    s = mod.DuckDuckGoSearcher.__new__(mod.DuckDuckGoSearcher)
    s.region = "wt-wt"
    s.safesearch = "moderate"
    s.timeout = 30
    return s, mod


class FakeLimiter:
    def __init__(self):
        self.calls = 0

    async def acquire(self):
        self.calls += 1


def test_ddg_open_breaker_returns_empty_without_calling_ddgs():
    from src.utils.retry import CircuitBreaker
    s, mod = _make_ddg()

    class Boom:
        def text(self, *a, **k):
            raise AssertionError("DDGS must not be called when breaker open")

    mod.DDGS = lambda *a, **k: Boom()
    br = CircuitBreaker("duckduckgo", failure_threshold=5, cooldown_seconds=300)
    for _ in range(5):
        br.record_failure()
    assert br.is_open
    s._breaker = br
    lim = FakeLimiter()
    s._rate_limiter = lim

    out = asyncio.run(s.search("q"))
    assert out == [], "graceful degradation: [] when breaker open"
    assert lim.calls == 0, "no requests while circuit open"


def test_ddg_success_records_success_and_respects_rate_limit():
    s, mod = _make_ddg()

    recorded = {}

    class FakeBreaker:
        def allow_request(self):
            return True

        def record_success(self):
            recorded["success"] = True

        def record_failure(self):
            recorded["failure"] = True

    class FakeDDGS:
        def __enter__(self):
            return self

        def __exit__(self, *a):
            return False

        def text(self, query, region=None, safesearch=None, timelimit=None, max_results=None):
            return [{"href": "https://x.com", "title": "t", "body": "b"}]

    mod.DDGS = lambda *a, **k: FakeDDGS()
    s._breaker = FakeBreaker()
    lim = FakeLimiter()
    s._rate_limiter = lim

    out = asyncio.run(s.search("q"))
    assert len(out) == 1 and out[0].url == "https://x.com"
    assert recorded.get("success") is True
    assert recorded.get("failure") is None
    assert lim.calls == 1


def test_ddg_failure_records_failure_and_degrades_to_empty():
    s, mod = _make_ddg()

    recorded = {"failures": 0}

    class FakeBreaker:
        def allow_request(self):
            return True

        def record_success(self):
            pass

        def record_failure(self):
            recorded["failures"] += 1

    class FakeDDGS:
        def __enter__(self):
            return self

        def __exit__(self, *a):
            return False

        def text(self, *a, **k):
            raise ConnectionError("ddg down")

    mod.DDGS = lambda *a, **k: FakeDDGS()
    s._breaker = FakeBreaker()
    s._rate_limiter = FakeLimiter()

    out = asyncio.run(s.search("q"))
    assert out == []
    assert recorded["failures"] == 1


# ---------- SearXNG ----------

def test_searxng_is_available_probes_search_json_not_head_root(monkeypatch):
    from src.agents.research.searxng_searcher import SearXNGSearcher
    s = SearXNGSearcher(base_url="https://searx.example")

    captured = {}

    class FakeResp:
        status_code = 200

    def fake_get(url, timeout=None, **k):
        captured["url"] = url
        captured["method"] = "GET"
        return FakeResp()

    import requests as requests_mod
    monkeypatch.setattr(requests_mod, "get", fake_get)

    assert s.is_available() is True
    url = captured["url"]
    assert url.startswith("https://searx.example/search?"), url
    assert "q=test" in url and "format=json" in url, url


def test_searxng_rate_limiter_acquired_on_search(monkeypatch):
    from src.agents.research.searxng_searcher import SearXNGSearcher
    s = SearXNGSearcher(base_url="https://searx.example")
    lim = FakeLimiter()
    s._rate_limiter = lim

    class FakeResp:
        status = 200

        async def json(self):
            return {"results": []}

        async def text(self):
            return ""

        async def __aenter__(self):
            return self

        async def __aexit__(self, *a):
            return False

    class FakeSession:
        def __init__(self, *a, **k):
            pass

        def get(self, url, timeout=None):
            return FakeResp()

        async def __aenter__(self):
            return self

        async def __aexit__(self, *a):
            return False

    import src.agents.research.searxng_searcher as mod
    monkeypatch.setattr(mod.aiohttp, "ClientSession", FakeSession)

    out = asyncio.run(s.search("q"))
    assert out == []
    assert lim.calls == 1


def test_searxng_find_working_instance_probes_search_json(monkeypatch):
    from src.agents.research.searxng_searcher import SearXNGSearcher

    probed = []

    class FakeResp:
        status = 200

        async def __aenter__(self):
            return self

        async def __aexit__(self, *a):
            return False

    class FakeSession:
        def __init__(self, *a, **k):
            pass

        def get(self, url, timeout=None):
            probed.append(url)
            return FakeResp()

        async def __aenter__(self):
            return self

        async def __aexit__(self, *a):
            return False

    import src.agents.research.searxng_searcher as mod
    monkeypatch.setattr(mod.aiohttp, "ClientSession", FakeSession)

    found = asyncio.run(SearXNGSearcher.find_working_instance())
    assert found is not None
    assert all("/search?" in u and "format=json" in u for u in probed), probed


# ---------- ExtensiveResearcher ----------

def test_extensive_researcher_runs_searxng_search_in_thread():
    import threading
    from src.research.extensive_researcher import (
        ExtensiveResearcher, ResearchQuery,
    )

    r = ExtensiveResearcher.__new__(ExtensiveResearcher)
    r.results_per_query = 5
    r.seen_urls = set()
    r.url_to_hash = {}
    r.all_results = []
    r.all_queries = []

    main_thread = threading.get_ident()
    seen_threads = []

    class FakeSearxng:
        def search(self, query, num_results=None, **k):
            seen_threads.append(threading.get_ident())
            return [{
                "url": "https://example.com/a",
                "title": "A",
                "content": "some content here",
                "engine": "google",
                "score": 1.0,
                "category": "general",
            }]

        def search_code(self, query, num_results=None):
            return self.search(query, num_results=num_results)

    r.searxng = FakeSearxng()

    asyncio.run(r._execute_search(
        ResearchQuery(query="plain topic", iteration=0, query_type="broad")
    ))

    assert len(seen_threads) == 1
    assert seen_threads[0] != main_thread, "sync searxng.search must run in worker thread"
    assert len(r.all_results) == 1


# ---------- signatures preserved ----------

def test_async_signatures_preserved():
    import inspect
    from src.agents.research.arxiv_searcher import ArxivSearcher
    from src.agents.research.duckduckgo_searcher import DuckDuckGoSearcher
    from src.agents.research.searxng_searcher import SearXNGSearcher

    assert inspect.iscoroutinefunction(ArxivSearcher.search)
    assert inspect.iscoroutinefunction(DuckDuckGoSearcher.search)
    assert inspect.iscoroutinefunction(SearXNGSearcher.search)
    assert inspect.iscoroutinefunction(SearXNGSearcher.find_working_instance)
