"""supervisor — minimal AVO supervisor, stdlib only."""
from typing import Any, Dict, List, Tuple, Union


def should_intervene(history: List[Dict[str, Any]]) -> Union[Tuple[bool, str], Dict[str, Any]]:
    """Decide if pipeline should intervene based on last lineage entries.

    Returns (intervene, hint) or {"intervene": bool, "hint": str}.
    Never raises.
    """
    try:
        if not history or len(history) < 2:
            return False, ""
        # normalize last 3
        last = history[-3:] if len(history) >= 3 else history
        # stuck on failing tests
        try:
            if all(not bool(h.get("tests_passed", False)) for h in last) and len(last) >= 3:
                return True, "AVO supervisor: repeated test failures — try alternative approach, simplify implementation, verify imports and entrypoints."
        except Exception:
            pass
        # feature verification stuck
        try:
            rates = [float(h.get("feature", 0) or 0) for h in last]
            if len(rates) >= 3 and len(set(round(r, 1) for r in rates)) == 1 and rates[-1] < 80:
                return True, "AVO supervisor: feature verification stagnated — regenerate failing feature with minimal viable logic."
        except Exception:
            pass
        # quality not improving
        try:
            quals = [float(h.get("quality", 0) or 0) for h in last]
            if len(quals) >= 3 and max(quals) - min(quals) < 0.5 and quals[-1] < 7:
                return True, "AVO supervisor: quality stagnated — consider major architectural change or simplify scope."
        except Exception:
            pass
    except Exception:
        return False, ""
    return False, ""


class _Supervisor:
    def should_intervene(self, history: List[Dict[str, Any]]) -> Union[Tuple[bool, str], Dict[str, Any]]:
        return should_intervene(history)


supervisor = _Supervisor()
