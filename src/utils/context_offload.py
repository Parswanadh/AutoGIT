"""Minimal context offload stubs — workflow_enhanced ghost imports.

ponytail: dict/file-pointer stubs; upgrade to vector-store offload if state exceeds 100k tokens regularly.
"""
from __future__ import annotations

import hashlib
from datetime import datetime
from pathlib import Path
from typing import Any, Dict, List


def offload_state_fields(state_patch: Dict[str, Any], node_name: str = "", threshold_chars: int = 50000) -> Dict[str, Any]:
    """If large fields exceed threshold, write to disk and return refs patch. Else {}."""
    if not isinstance(state_patch, dict):
        return {}
    # fields that bloat context
    candidates = ["research_context", "research_summary", "generated_code", "test_results", "errors", "warnings"]
    patch: Dict[str, Any] = {}
    refs: List[Dict[str, Any]] = []
    for key in candidates:
        val = state_patch.get(key)
        s = str(val) if not isinstance(val, str) else val
        if len(s) > threshold_chars:
            try:
                out_dir = Path("logs/offloaded")
                out_dir.mkdir(parents=True, exist_ok=True)
                safe = "".join(c if c.isalnum() or c in "-_" else "_" for c in str(node_name or key))[:30] or "offload"
                fname = f"{safe}_{key}_{datetime.now().strftime('%Y%m%d_%H%M%S')}_{hashlib.md5(s.encode()[:1024]).hexdigest()[:6]}.txt"
                p = out_dir / fname
                p.write_text(s[:500000], encoding="utf-8", errors="replace")
                refs.append({"field": key, "path": str(p), "node": node_name, "chars": len(s)})
            except Exception:
                pass
    if refs:
        # append to existing refs if any
        existing = state_patch.get("context_offload_refs")
        merged = list(existing) if isinstance(existing, list) else []
        merged.extend(refs)
        patch["context_offload_refs"] = merged[-30:]
    return patch


def compact_todos_with_pointer(pipeline_todos: List[Dict[str, Any]] | Any, keep_last: int = 12, threshold: int = 15) -> Dict[str, Any]:
    """If todos bloated, keep tail and set todo_context_pointer. Else {}."""
    if not isinstance(pipeline_todos, list):
        return {}
    if len(pipeline_todos) <= threshold:
        return {}
    try:
        tail = pipeline_todos[-keep_last:]
        ptr = f"todos:{len(pipeline_todos)}:compacted:{datetime.now().isoformat()}"
        return {"pipeline_todos": tail, "todo_context_pointer": ptr}
    except Exception:
        return {}


def restore_todo_context_if_missing(merged_state: Dict[str, Any]) -> Dict[str, Any]:
    """If pointer exists but todos missing/empty, return marker to restore. Else {}."""
    if not isinstance(merged_state, dict):
        return {}
    ptr = merged_state.get("todo_context_pointer")
    todos = merged_state.get("pipeline_todos")
    if ptr and (not isinstance(todos, list) or len(todos) == 0):
        # best-effort: cannot restore without store, just clear pointer so workflow can regenerate
        return {"todo_context_pointer": None, "warnings": ["todo context missing; pointer cleared"]}
    return {}
