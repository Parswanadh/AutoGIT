"""
Safe subprocess environment — allowlist only.

Copies only known-safe vars (PATH, HOME, etc.). Never leaks secrets even if
new API_KEY patterns appear. OOM guard: per-var length cap + total size cap.

ponytail: allowlist ~40 vars, 4k per-var cap, 64k total; bump caps if legit env exceeds.
"""
import os
from typing import Dict, Optional

# ponytail: minimal allowlist — add vars only when subprocess fails without them
SAFE_ENV_ALLOWLIST = frozenset({
    # POSIX core — needed for binaries, home, temp, locale
    "PATH", "HOME", "USER", "LOGNAME", "SHELL", "TERM", "PWD",
    "LANG", "LC_ALL", "LC_COLLATE", "LC_CTYPE", "LC_MESSAGES", "LC_MONETARY", "LC_NUMERIC", "LC_TIME",
    "LC_ADDRESS", "LC_IDENTIFICATION", "LC_MEASUREMENT", "LC_NAME", "LC_PAPER", "LC_TELEPHONE",
    "TMPDIR", "TMP", "TEMP", "TMP_DIR", "TZ",
    # Python / pip — controlled by us, but allow if parent sets them
    "PYTHONIOENCODING", "PYTHONDONTWRITEBYTECODE", "PYTHONUNBUFFERED", "PYTHONPATH",
    "PIP_NO_INPUT", "PIP_DISABLE_PIP_VERSION_CHECK", "PIP_CACHE_DIR",
    "PIP_INDEX_URL", "PIP_EXTRA_INDEX_URL",
    # TLS / proxy — needed for pip to fetch deps
    "SSL_CERT_FILE", "SSL_CERT_DIR", "REQUESTS_CA_BUNDLE", "CURL_CA_BUNDLE", "CERT_FILE",
    "HTTP_PROXY", "HTTPS_PROXY", "NO_PROXY", "http_proxy", "https_proxy", "no_proxy",
    # Windows
    "SYSTEMROOT", "SystemRoot", "WINDIR", "COMSPEC", "PATHEXT",
    "USERPROFILE", "APPDATA", "LOCALAPPDATA", "PROGRAMDATA",
    "PROGRAMFILES", "PROGRAMFILES(X86)", "COMMONPROGRAMFILES", "COMMONPROGRAMFILES(X86)",
    "HOMEDRIVE", "HOMEPATH", "NUMBER_OF_PROCESSORS", "PROCESSOR_ARCHITECTURE", "PROCESSOR_IDENTIFIER",
    "OS", "COMPUTERNAME", "USERNAME", "PUBLIC", "ALLUSERSPROFILE", "SESSIONNAME", "SYSTEMDRIVE",
    # env tooling
    "CONDA_PREFIX", "CONDA_DEFAULT_ENV", "VIRTUAL_ENV",
    "LD_LIBRARY_PATH", "DYLD_LIBRARY_PATH",
})

# Defensive second layer: even if allowlist grows, never leak these substrings
_SENSITIVE_SUBSTRINGS = ("API_KEY", "SECRET", "_TOKEN", "PASSWORD", "CREDENTIAL", "PRIVATE_KEY")

MAX_ENV_VALUE_LEN = 4096  # ponytail: per-var cap prevents 1MB env OOM
MAX_TOTAL_ENV_BYTES = 64 * 1024  # ponytail: total cap prevents fork OOM with huge env


def _is_sensitive_key(key: str) -> bool:
    ku = key.upper()
    return any(pat in ku for pat in _SENSITIVE_SUBSTRINGS)


def get_safe_env(
    extra: Optional[Dict[str, str]] = None,
    *,
    include_defaults: bool = True,
) -> Dict[str, str]:
    """Build allowlist-filtered env for subprocess.

    Copies only SAFE_ENV_ALLOWLIST keys present in parent env, applies
    per-var and total OOM caps, injects controlled Python/pip defaults,
    merges ``extra`` (caller-intent vars like PYTHONPATH) after same
    sensitive/OOM checks. Never returns secrets.

    Args:
        extra: additional vars to merge (e.g. {"PYTHONPATH": "/tmp/..."}).
        include_defaults: if True, inject PYTHONIOENCODING etc.

    Returns:
        Dict safe to pass as subprocess ``env=``.
    """
    env: Dict[str, str] = {}
    total = 0

    for k in SAFE_ENV_ALLOWLIST:
        if _is_sensitive_key(k):
            continue  # defensive: allowlist should never contain sensitive, but guard
        v = os.environ.get(k)
        if v is None:
            continue
        # OOM guard: skip or truncate overlong values
        if len(v) > MAX_ENV_VALUE_LEN:
            v = v[:MAX_ENV_VALUE_LEN]
        if total + len(k) + len(v) + 1 > MAX_TOTAL_ENV_BYTES:
            continue  # would exceed total — skip smallest-impact vars first (allowlist order stable)
        if _is_sensitive_key(k):
            continue
        env[k] = v
        total += len(k) + len(v) + 1

    if include_defaults:
        # Controlled defaults — overwrite parent if present, ensure deterministic
        env["PYTHONIOENCODING"] = "utf-8"
        env["PYTHONDONTWRITEBYTECODE"] = "1"
        env["PIP_NO_INPUT"] = "1"
        env["PIP_DISABLE_PIP_VERSION_CHECK"] = "1"

    if extra:
        for k, v in extra.items():
            if v is None:
                continue
            if _is_sensitive_key(k):
                continue
            sv = str(v)
            if len(sv) > MAX_ENV_VALUE_LEN:
                sv = sv[:MAX_ENV_VALUE_LEN]
            # For extra overrides, allow replacing existing but respect total cap unless it's a critical key
            # If total would exceed, try to make room by truncating further or skipping
            if k not in env and total + len(k) + len(sv) + 1 > MAX_TOTAL_ENV_BYTES:
                # For PYTHONPATH and similar caller-required vars, evict least-critical to fit
                # Simple: skip if still over; caller can still override by reducing other env
                continue
            env[k] = sv

    return env


# Back-compat alias used by older callers
def safe_subprocess_env(extra: Optional[Dict[str, str]] = None) -> Dict[str, str]:
    return get_safe_env(extra=extra)


def safe_env_with_pythonpath(pythonpath: str, extra: Optional[Dict[str, str]] = None) -> Dict[str, str]:
    """Convenience: safe env + PYTHONPATH override (for sandbox execution)."""
    merged = dict(extra or {})
    merged["PYTHONPATH"] = pythonpath
    return get_safe_env(extra=merged)
