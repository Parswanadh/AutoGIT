"""fingerprint — error/file/state hashing, CRLF-agnostic, stdlib only."""

import hashlib
import json
import re
from typing import Any, Dict, List


def normalize_error(err: str) -> str:
    """Normalize error string for stable fingerprinting."""
    s = str(err or "").strip().lower()
    s = re.sub(r"line \d+", "line N", s)
    s = re.sub(r":\d+:", ":N:", s)
    s = re.sub(r'["\']?(?:[a-z]:\\|/)[\w/\\.\-]+[/\\](\w+\.py)', r"\1", s)
    s = re.sub(r"0x[0-9a-f]+", "0xN", s)
    s = re.sub(r"\s+", " ", s)
    return s[:500]


def fingerprint_error(err: str) -> str:
    """Short hash of normalized error."""
    norm = normalize_error(err)
    return hashlib.sha256(norm.encode("utf-8", errors="replace")).hexdigest()[:16]


def normalize_content(text: str) -> str:
    """Normalize text: CRLF -> LF, strip trailing whitespace per line."""
    s = str(text or "").replace("\r\n", "\n").replace("\r", "\n")
    # ponytail: keep content exact except line endings; no trimming of logic
    return s


def compute_file_hash(path: str, content: str) -> str:
    """Hash single file (name + normalized content)."""
    norm = normalize_content(content)
    h = hashlib.sha256()
    h.update(str(path).encode("utf-8", errors="replace"))
    h.update(b"\x00")
    h.update(norm.encode("utf-8", errors="replace"))
    return h.hexdigest()


def workflow_fingerprint(state: Dict[str, Any], node: str, stage: str) -> str:
    """Deterministic fingerprint for workflow oscillation detection."""
    test_results = state.get("test_results") if isinstance(state.get("test_results"), dict) else {}
    exec_errors = test_results.get("execution_errors", []) if isinstance(test_results, dict) else []
    if isinstance(exec_errors, list):
        exec_errors = [normalize_error(str(e))[:200] for e in exec_errors[:3]]
    else:
        exec_errors = []
    files = (state.get("generated_code") or {}).get("files", {}) if isinstance(state.get("generated_code"), dict) else {}
    files_summary = []
    if isinstance(files, dict):
        for fname in sorted(files.keys())[:20]:
            files_summary.append(f"{fname}:{len(str(files.get(fname) or ''))}")
    payload = {
        "node": node,
        "stage": stage,
        "tests_passed": bool(state.get("tests_passed", False)),
        "fix_attempts": int(state.get("fix_attempts", 0) or 0),
        "errors": exec_errors,
        "files": files_summary,
    }
    blob = json.dumps(payload, sort_keys=True, ensure_ascii=True)
    return hashlib.sha256(blob.encode("utf-8", errors="replace")).hexdigest()[:16]


def is_oscillating(fingerprints: List[str], window: int = 5, threshold: int = 2) -> bool:
    """Detect oscillation: fingerprint repeats >=threshold within window or A-B-A pattern."""
    if not fingerprints or len(fingerprints) < threshold:
        return False
    recent = [str(f) for f in fingerprints if f][-window:]
    if len(recent) < threshold:
        return False
    # ponytail: Counter O(n), minimal — detect duplicates
    from collections import Counter

    counts = Counter(recent)
    if any(v >= threshold for v in counts.values()):
        return True
    # A-B-A alternating pattern
    if len(recent) >= 3 and recent[0] == recent[2] and recent[0] != recent[1]:
        return True
    if len(recent) >= 4 and recent[0] == recent[2] and recent[1] == recent[3]:
        return True
    return False


# aliases for flexibility
normalize = normalize_error
fingerprint = fingerprint_error
error_fingerprint = fingerprint_error
