"""CLI app re-export for `auto-git` entrypoint.

Re-exports `auto_git_cli:app` so `cli_entry:main` and `src.cli.app:main` resolve.
"""

import sys
from pathlib import Path

# Ensure project root on path when imported as installed package
try:
    from auto_git_cli import app
except ImportError:
    project_root = Path(__file__).resolve().parents[2]
    if str(project_root) not in sys.path:
        sys.path.insert(0, str(project_root))
    from auto_git_cli import app  # type: ignore[no-redef]

# cli_entry expects `main` callable (Typer app)
main = app

__all__ = ["app", "main"]

if __name__ == "__main__":
    main()
