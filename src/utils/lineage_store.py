"""lineage_store — minimal AVO lineage store, stdlib only."""
from typing import Any, Dict, List

# ponytail: global list, per-workflow store if isolation matters
_entries: List[Dict[str, Any]] = []


def add(entry: Dict[str, Any]) -> None:
    """Append lineage entry (tests_passed, feature, quality)."""
    if not isinstance(entry, dict):
        return
    # cap at 200 to bound memory
    _entries.append(dict(entry))
    if len(_entries) > 200:
        del _entries[: len(_entries) - 200]


def top(n: int = 5) -> List[Dict[str, Any]]:
    """Return last n entries."""
    try:
        n = int(n)
    except Exception:
        n = 5
    if n <= 0:
        return []
    return list(_entries[-n:])


def clear() -> None:
    _entries.clear()


# instance alias for `from lineage_store import lineage_store` pattern
class _LineageStore:
    def add(self, entry: Dict[str, Any]) -> None:
        return add(entry)

    def top(self, n: int = 5) -> List[Dict[str, Any]]:
        return top(n)

    def clear(self) -> None:
        return clear()

    @property
    def entries(self) -> List[Dict[str, Any]]:
        return list(_entries)


lineage_store = _LineageStore()
