"""artifact_cache — deterministic artifact fingerprints, CRLF-normalized."""

import hashlib
from typing import Dict


_RUNTIME_MANIFESTS = {
    "requirements.txt", "requirements-dev.txt", "pyproject.toml",
    "setup.py", "setup.cfg", "pipfile", "pipfile.lock", "poetry.lock",
}
_RUNTIME_EXTS = (".py", ".toml", ".yaml", ".yml", ".json", ".ini", ".cfg", ".txt")
_DOC_ONLY = {"readme.md", "license", "license.txt", "changelog.md"}


def _is_runtime_file(name: str) -> bool:
    """Check if file affects runtime (for mode='runtime')."""
    n = str(name or "").replace("\\", "/").strip().lower()
    base = n.rsplit("/", 1)[-1]
    if not n:
        return False
    if base in _RUNTIME_MANIFESTS:
        return True
    if base in _DOC_ONLY:
        return False
    return any(n.endswith(ext) for ext in _RUNTIME_EXTS)


def _normalize(text: str) -> str:
    """CRLF normalize: \\r\\n and \\r -> \\n."""
    return str(text or "").replace("\r\n", "\n").replace("\r", "\n")


def compute_fp(files: Dict[str, str], mode: str = "full") -> str:
    """Compute deterministic artifact fingerprint (CRLF-normalized).

    Args:
        files: mapping filename -> content
        mode: 'full' (all files) or 'runtime' (runtime-relevant only)

    Returns:
        hex sha256 or '' if nothing included.
    """
    if not isinstance(files, dict) or not files:
        return ""
    h = hashlib.sha256()
    included = 0
    for name in sorted(files.keys()):
        if mode == "runtime" and not _is_runtime_file(str(name)):
            continue
        included += 1
        norm = _normalize(files.get(name, ""))
        h.update(str(name).encode("utf-8", errors="replace"))
        h.update(b"\x00")
        h.update(norm.encode("utf-8", errors="replace"))
        h.update(b"\x00")
    return h.hexdigest() if included else ""


def compute_artifact_fingerprint(state: Dict[str, object], mode: str = "full") -> str:
    """State-aware wrapper: extracts generated_code.files then calls compute_fp."""
    if not isinstance(state, dict):
        return ""
    gen = state.get("generated_code") if isinstance(state.get("generated_code"), dict) else {}
    files = gen.get("files", {}) if isinstance(gen, dict) else {}
    if not isinstance(files, dict):
        return ""
    return compute_fp(files, mode=mode)


# aliases
artifact_fingerprint = compute_fp
fingerprint = compute_fp
