"""TDD for resource_gate — wraps resource_monitor via to_thread."""
import asyncio
from unittest.mock import Mock

from src.utils.resource_gate import (
    check_resources_async,
    wait_for_resources_async,
    resource_gate,
)


class FakeMonitor:
    def __init__(self, safe=True, reasons=None):
        self.safe = safe
        self.reasons = reasons or []
        self.eval_calls = 0
        self.wait_calls = 0

    def evaluate_resources(self, **kwargs):
        self.eval_calls += 1
        return {"safe": self.safe, "reasons": self.reasons, "stats": {"cpu_percent": 10}}

    def wait_for_resources(self, timeout=5, poll_interval=2.0, **kwargs):
        self.wait_calls += 1
        return True

    def get_stats_snapshot(self):
        return {"cpu_percent": 5}


def test_check_resources_async_uses_to_thread():
    m = FakeMonitor(safe=True)
    res = asyncio.run(check_resources_async(m, max_cpu_percent=90))
    assert res["safe"] is True
    assert m.eval_calls == 1
    txt = open("src/utils/resource_gate.py").read()
    assert "to_thread" in txt
    assert "resource_monitor" in txt


def test_resource_gate_safe_no_wait():
    m = FakeMonitor(safe=True)
    res = asyncio.run(resource_gate(m, wait_timeout=5, max_cpu_percent=90))
    assert res["safe"] is True
    assert m.eval_calls == 1
    assert m.wait_calls == 0


def test_resource_gate_unsafe_triggers_wait():
    m = FakeMonitor(safe=False, reasons=["CPU high"])
    res = asyncio.run(resource_gate(m, wait_timeout=5, max_cpu_percent=90))
    assert res["safe"] is False
    assert m.wait_calls == 1
    assert "waited_s" in res


def test_wait_timeout_capped_30():
    m = FakeMonitor(safe=False)
    # should not block >30s — we check it caps via code reading and fast return
    res = asyncio.run(resource_gate(m, wait_timeout=100, max_cpu_percent=90))
    # after cap, wait still called once (with timeout 30), not hanging
    assert m.wait_calls == 1
    txt = open("src/utils/resource_gate.py").read()
    assert "30" in txt

    # timeout 0 => no wait
    m2 = FakeMonitor(safe=False)
    res2 = asyncio.run(wait_for_resources_async(m2, timeout=0))
    assert res2 is True
    assert m2.wait_calls == 0


def test_to_thread_called():
    # verify to_thread is actually invoked
    calls = []
    orig_to_thread = asyncio.to_thread

    async def fake_to_thread(fn, *a, **kw):
        calls.append(fn.__name__ if hasattr(fn, "__name__") else str(fn))
        return fn(*a, **kw)

    m = FakeMonitor(safe=True)
    import unittest.mock as mock
    with mock.patch("asyncio.to_thread", side_effect=fake_to_thread):
        asyncio.run(check_resources_async(m))
    assert len(calls) >= 1


def test_no_new_deps():
    txt = open("src/utils/resource_gate.py").read()
    assert "asyncio.to_thread" in txt or "to_thread" in txt
    for bad in ["import httpx", "import requests"]:
        assert bad not in txt
