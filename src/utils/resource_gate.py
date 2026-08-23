"""resource_gate — wraps resource_monitor via asyncio.to_thread, advisory timeout."""

import asyncio
import time
from typing import Any, Dict, Optional


def _get_monitor():
    """Lazy import to keep stdlib-only at import time."""
    from src.utils.resource_monitor import get_monitor  # type: ignore
    return get_monitor()


async def check_resources_async(
    monitor: Optional[Any] = None,
    max_cpu_percent: float = 90.0,
    max_ram_percent: float = 85.0,
    max_vram_percent: float = 85.0,
    min_free_ram_gb: float = 0.0,
    min_free_vram_mb: float = 0.0,
) -> Dict[str, Any]:
    """Evaluate resources via to_thread (non-blocking)."""
    mon = monitor or _get_monitor()
    try:
        result = await asyncio.to_thread(
            mon.evaluate_resources,
            max_cpu_percent=max_cpu_percent,
            max_ram_percent=max_ram_percent,
            max_vram_percent=max_vram_percent,
            min_free_ram_gb=min_free_ram_gb,
            min_free_vram_mb=min_free_vram_mb,
        )
        return dict(result)
    except Exception:
        return {"safe": True, "reasons": [], "stats": {}}


async def wait_for_resources_async(
    monitor: Optional[Any] = None,
    timeout: int = 5,
    poll_interval: float = 2.0,
    **gate_kwargs: Any,
) -> bool:
    """Wait via to_thread, capped at 30s (advisory, never long block)."""
    mon = monitor or _get_monitor()
    timeout = min(int(timeout or 0), 30)
    if timeout <= 0:
        return True
    try:
        return await asyncio.to_thread(
            mon.wait_for_resources,
            timeout=timeout,
            poll_interval=poll_interval,
            max_cpu_percent=gate_kwargs.get("max_cpu_percent", 90.0),
            max_ram_percent=gate_kwargs.get("max_ram_percent", 85.0),
            max_vram_percent=gate_kwargs.get("max_vram_percent", 85.0),
            min_free_ram_gb=gate_kwargs.get("min_free_ram_gb", 0.0),
            min_free_vram_mb=gate_kwargs.get("min_free_vram_mb", 0.0),
            quiet=True,
        )
    except Exception:
        return True


async def resource_gate(
    monitor: Optional[Any] = None,
    wait_timeout: int = 5,
    **gate_kwargs: Any,
) -> Dict[str, Any]:
    """Advisory gate: evaluate via to_thread, optionally wait (capped 30s)."""
    eval_res = await check_resources_async(monitor, **gate_kwargs)
    waited = 0.0
    if not eval_res.get("safe", True) and wait_timeout > 0:
        wait_timeout = min(int(wait_timeout), 30)
        start = time.monotonic()
        await wait_for_resources_async(monitor, timeout=wait_timeout, **gate_kwargs)
        waited = time.monotonic() - start
    return {"evaluation": eval_res, "waited_s": round(waited, 3), "safe": bool(eval_res.get("safe", True))}


# sync wrapper for non-async callers (still uses to_thread inside)
def resource_gate_sync(monitor: Optional[Any] = None, **kwargs: Any) -> Dict[str, Any]:
    """Sync wrapper — runs async gate via asyncio.run if needed."""
    try:
        loop = asyncio.get_running_loop()
    except RuntimeError:
        return asyncio.run(resource_gate(monitor, **kwargs))
    # ponytail: if already in loop, do direct sync check (avoid nested run)
    mon = monitor or _get_monitor()
    try:
        return {"evaluation": mon.evaluate_resources(**kwargs), "waited_s": 0.0, "safe": True}
    except Exception:
        return {"evaluation": {"safe": True}, "waited_s": 0.0, "safe": True}
