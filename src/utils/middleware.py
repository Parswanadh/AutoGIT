"""Minimal middleware stubs — ghost imports for workflow_enhanced + nodes.

ponytail: trims caps, singleton loop detector, file offload; upgrade to full SummarizationMiddleware if context budget grows.
"""
from __future__ import annotations

import os
import hashlib
from datetime import datetime
from pathlib import Path
from typing import Any, Dict, List, Optional, Tuple


def run_state_compaction(state: Dict[str, Any] | Any, max_errors: int = 60, max_warnings: int = 40) -> Dict[str, Any]:
    """Trim append-only lists to prevent context rot. Returns patch dict or {}."""
    if not isinstance(state, dict):
        return {}
    caps = {
        "errors": max_errors,
        "warnings": max_warnings,
        "structured_errors": 40,
        "resource_events": 50,
        "policy_events": 30,
        "fix_diffs": 20,
    }
    patch: Dict[str, Any] = {}
    for key, cap in caps.items():
        val = state.get(key)
        if isinstance(val, list) and len(val) > cap:
            patch[key] = val[-cap:]
    # trim generic large strings
    for k in ("research_summary", "research_report"):
        v = state.get(k)
        if isinstance(v, str) and len(v) > 20000:
            patch[k] = v[:20000] + " …[compacted]"
    return patch


def offload_large_output(text: str, label: str = "offload", max_chars: int = 20000) -> str:
    """Best-effort write to logs/offloaded/<label>_<ts>.txt. Returns path or ''."""
    try:
        s = str(text or "")
        if not s:
            return ""
        out_dir = Path("logs/offloaded")
        out_dir.mkdir(parents=True, exist_ok=True)
        safe = "".join(c if c.isalnum() or c in "-_" else "_" for c in str(label))[:40] or "offload"
        fname = f"{safe}_{datetime.now().strftime('%Y%m%d_%H%M%S')}_{hashlib.md5(s.encode()[:1024]).hexdigest()[:6]}.txt"
        p = out_dir / fname
        p.write_text(s[:500000], encoding="utf-8", errors="replace")
        return str(p)
    except Exception:
        return ""


class _LoopDetector:
    """ponytail: in-memory counts, no persistence; replace with Redis-backed if distributed."""

    def __init__(self):
        self._node_counts: Dict[str, int] = {}
        self._error_counts: Dict[str, int] = {}
        self._file_edits: Dict[str, int] = {}

    def record_node_visit(self, node_name: str) -> Optional[str]:
        n = str(node_name or "")
        c = self._node_counts.get(n, 0) + 1
        self._node_counts[n] = c
        if c > 10:
            return f"loop_warning: {n} visited {c} times"
        return None

    def record_error(self, fingerprint: str) -> Optional[str]:
        k = str(fingerprint or "")[:200]
        if not k:
            return None
        c = self._error_counts.get(k, 0) + 1
        self._error_counts[k] = c
        if c >= 3:
            return f"loop_error: fingerprint repeated {c}x"
        return None

    def get_context_injection(self) -> str:
        # inject only when repetition detected
        hot = [k for k, v in self._error_counts.items() if v >= 3]
        if not hot:
            return ""
        return "LOOP_DETECTOR: repeated errors detected — try different strategy: " + "; ".join(h[:60] for h in hot[:2])

    def record_file_edit(self, filename: str) -> Optional[str]:
        k = str(filename or "")
        c = self._file_edits.get(k, 0) + 1
        self._file_edits[k] = c
        if c > 8:
            return f"loop_warning: {k} edited {c} times"
        return None

    def reset(self):
        self._node_counts.clear()
        self._error_counts.clear()
        self._file_edits.clear()


_singleton: Optional[_LoopDetector] = None


def get_loop_detector() -> _LoopDetector:
    global _singleton
    if _singleton is None:
        _singleton = _LoopDetector()
    return _singleton


def extract_error_context(code: str, error_line: int, radius: int = 15) -> Tuple[str, int, int]:
    """Return (snippet, start_line, end_line) around error_line (1-indexed)."""
    try:
        lines = str(code or "").splitlines()
        if not lines:
            return "", 1, 0
        line = int(error_line or 1)
        line = max(1, min(line, len(lines)))
        start = max(1, line - radius)
        end = min(len(lines), line + radius)
        snippet = "\n".join(lines[start - 1 : end])
        return snippet, start, end
    except Exception:
        return str(code or "")[:4000], 1, 1


# pre-completion checklist stubs for nodes.py:10790
class _CheckItem:
    def __init__(self, name: str, passed: bool = True, severity: str = "info", detail: str = ""):
        self.name = name
        self.passed = passed
        self.severity = severity
        self.detail = detail


def run_pre_completion_checklist(state: Dict[str, Any]) -> List[_CheckItem]:
    items: List[_CheckItem] = []
    files = {}
    try:
        gc = state.get("generated_code") if isinstance(state, dict) else {}
        files = gc.get("files", {}) if isinstance(gc, dict) else {}
    except Exception:
        files = {}
    items.append(_CheckItem("has_files", passed=bool(files), severity="error" if not files else "info", detail=f"{len(files)} files"))
    has_readme = any(str(k).lower() == "readme.md" for k in files) if isinstance(files, dict) else False
    items.append(_CheckItem("has_readme", passed=has_readme, severity="warning", detail="README present" if has_readme else "missing README"))
    return items


def format_checklist_report(items: List[Any]) -> str:
    try:
        lines = ["Pre-completion checklist:"]
        for it in items or []:
            name = getattr(it, "name", str(it))
            passed = getattr(it, "passed", True)
            sev = getattr(it, "severity", "info")
            detail = getattr(it, "detail", "")
            icon = "✓" if passed else ("✗" if sev == "error" else "!")
            lines.append(f"  {icon} {name}: {detail or ('pass' if passed else 'fail')} [{sev}]")
        return "\n".join(lines)
    except Exception:
        return "Pre-completion checklist: unavailable"
