"""loop_detector — tracks node frequency, fingerprints, hard_limit (stdlib only)."""

from typing import Any, Dict, List, Optional
import hashlib
import json
import time


LOOP_HARD_LIMITS: Dict[str, int] = {
    "solution_generation": 8,
    "critique": 8,
    "consensus_check": 10,
    "code_testing": 14,
    "feature_verification": 14,
    "strategy_reasoner": 14,
    "code_fixing": 14,
    "smoke_test": 10,
    "pipeline_self_eval": 8,
    "goal_achievement_eval": 8,
}
DEFAULT_HARD_LIMIT = 20


def _limit_for(node: str) -> int:
    """Return hard limit for node."""
    return int(LOOP_HARD_LIMITS.get(node, DEFAULT_HARD_LIMIT))


class LoopDetector:
    """Tracks node visit frequency and fingerprint oscillation.

    Trips hard_limit when frequency exceeds per-node limit or
    when a fingerprint repeats >= threshold in recent window.
    """

    def __init__(
        self,
        hard_limits: Optional[Dict[str, int]] = None,
        fingerprint_window: int = 20,
        repeat_threshold: int = 4,
        oscillation_nodes: Optional[set] = None,
    ):
        self.hard_limits = dict(hard_limits or LOOP_HARD_LIMITS)
        self.fingerprint_window = fingerprint_window
        self.repeat_threshold = repeat_threshold
        self.oscillation_nodes = oscillation_nodes or {
            "code_testing", "feature_verification", "strategy_reasoner",
            "code_fixing", "smoke_test", "pipeline_self_eval", "goal_achievement_eval",
        }
        self.counts: Dict[str, int] = {}
        self.fingerprints: List[str] = []
        self.path: List[str] = []
        self.notes: List[str] = []
        self.state: str = "clean"

    def record_node_visit(self, node: str) -> Optional[str]:
        """Record visit, return warning if hard_limit hit."""
        self.counts[node] = int(self.counts.get(node, 0) or 0) + 1
        self.path.append(node)
        if len(self.path) > 80:
            self.path = self.path[-80:]
        limit = int(self.hard_limits.get(node, DEFAULT_HARD_LIMIT))
        if self.counts[node] > limit:
            self.state = "hard_limit"
            msg = f"Loop detector hard_limit at '{node}': count={self.counts[node]}/{limit}"
            self.notes.append(msg)
            return msg
        return None

    def record_fingerprint(self, fp: str, node: str = "") -> Optional[str]:
        """Record fingerprint, check oscillation."""
        self.fingerprints.append(fp)
        if len(self.fingerprints) > self.fingerprint_window:
            self.fingerprints = self.fingerprints[-self.fingerprint_window:]
        recent = self.fingerprints[-10:]
        repeats = recent.count(fp)
        if node in self.oscillation_nodes and repeats >= self.repeat_threshold:
            self.state = "hard_limit"
            msg = f"Oscillation hard_limit at '{node}': fingerprint repeats {repeats}"
            self.notes.append(msg)
            return msg
        return None

    def record(self, node: str, fingerprint: Optional[str] = None) -> Dict[str, Any]:
        """Record visit + optional fingerprint, return status."""
        w1 = self.record_node_visit(node)
        w2 = self.record_fingerprint(fingerprint, node) if fingerprint else None
        warning = w1 or w2
        return {"state": self.state, "warning": warning, "counts": dict(self.counts)}

    def is_hard_limit(self) -> bool:
        """Whether detector tripped."""
        return self.state == "hard_limit"

    def get_context_injection(self) -> str:
        """Return brief context if loop risk."""
        if self.state == "hard_limit":
            return "Loop hard_limit tripped — force publish path, skip fix loop."
        if any(c > int(self.hard_limits.get(n, DEFAULT_HARD_LIMIT)) * 0.7 for n, c in self.counts.items()):
            return "Loop risk elevated — consider summarizing."
        return ""

    def reset(self) -> None:
        """Reset all tracking."""
        self.counts.clear()
        self.fingerprints.clear()
        self.path.clear()
        self.notes.clear()
        self.state = "clean"


_detector: Optional[LoopDetector] = None


def get_loop_detector() -> LoopDetector:
    """Singleton accessor."""
    global _detector
    if _detector is None:
        _detector = LoopDetector()
    return _detector
