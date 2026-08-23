"""Syntax-highlighted file tree + preview — rich only, OOM-safe."""
from __future__ import annotations

from typing import Any, Dict, List, Optional

from rich import box
from rich.console import Group
from rich.panel import Panel
from rich.syntax import Syntax
from rich.table import Table
from rich.text import Text
from rich.tree import Tree

# ponytail: hard caps, never render unbounded repo
_MAX_FILES = 50  # ponytail: truncate file list
_MAX_BYTES = 8192  # ponytail: 8KB preview cap
_MAX_LINES = 80  # ponytail: line cap
_MAX_FNAME = 80


def _truncate(s: str, n: int) -> str:
    return s[:n] + ("…" if len(s) > n else "")


def _pick_files(files: Dict[str, Any]) -> List[str]:
    # ponytail: bounded sorted list, deterministic
    keys = sorted(str(k) for k in files.keys())[:_MAX_FILES]
    return keys


def _preview_content(content: Any) -> tuple[str, str]:
    """Return (text, lang) capped."""
    raw = str(content or "")
    if len(raw) > _MAX_BYTES:
        raw = raw[:_MAX_BYTES] + "\n… truncated 8KB cap"
    lines = raw.splitlines()[:_MAX_LINES]
    if len(raw.splitlines()) > _MAX_LINES:
        lines.append("… truncated 80 lines cap")
    text = "\n".join(lines) or "(empty)"
    # ponytail: naive lang detect, no pygments guess bloat
    lang = "python" if text.lstrip().startswith(("import ", "def ", "class ")) else "text"
    if ".py" in text[:200]:
        lang = "python"
    return text, lang


def _detect_lang(fname: str, text: str) -> str:
    f = fname.lower()
    if f.endswith(".py"): return "python"
    if f.endswith((".js", ".ts")): return "typescript"
    if f.endswith(".json"): return "json"
    if f.endswith((".yaml", ".yml")): return "yaml"
    if f.endswith(".md"): return "markdown"
    if f.endswith((".sh", ".bash")): return "bash"
    return "python" if "def " in text or "import " in text else "text"


def build_file_tree(files: Dict[str, Any]) -> Tree:
    tree = Tree("📁 [bold cyan]generated_code[/]", guide_style="dim")
    for name in _pick_files(files):
        short = _truncate(name, _MAX_FNAME)
        content = files[name]
        sz = len(str(content or ""))
        label = f"[white]{short}[/] [dim]({sz} bytes)[/]"
        tree.add(label)
    if len(files) > _MAX_FILES:
        tree.add(Text(f"… +{len(files)-_MAX_FILES} more (capped)", style="dim"))
    if not files:
        tree.add(Text("(no files)", style="dim"))
    return tree


def build_code_preview(files: Dict[str, Any] | None = None, preview_file: Optional[str] = None, generated_code: Dict[str, Any] | None = None) -> Panel:
    """Build file tree + syntax preview. Accepts dict or {files:dict} shape."""
    # ponytail: normalize inputs, OOM caps via _MAX_* constants
    if files is None and generated_code is not None:
        files = generated_code.get("files", {}) if isinstance(generated_code, dict) else {}  # type: ignore
    if files is None:
        files = {}
    if not isinstance(files, dict):
        files = {}
    # handle nested shape {"files": {...}}
    if "files" in files and isinstance(files["files"], dict) and len(files) == 1:
        files = files["files"]  # type: ignore
    if not files:
        return Panel(Text("no code generated", style="dim"), title="Code Preview", border_style="cyan", box=box.ROUNDED)
    keys = _pick_files(files)
    target = preview_file if preview_file in files else keys[0]
    text, _ = _preview_content(files.get(target, ""))
    lang = _detect_lang(target, text)
    tree = build_file_tree(files)
    # ponytail: Syntax capped to _MAX_BYTES/_MAX_LINES already
    try:
        syntax = Syntax(text, lang, theme="monokai", line_numbers=True, word_wrap=False, background_color="default")
    except Exception:
        syntax = Syntax(text, "text", theme="monokai", line_numbers=True)  # type: ignore
    preview_panel = Panel(syntax, title=f"[cyan]{_truncate(target, 40)}[/] [dim]({lang})[/]", border_style="green", box=box.ROUNDED)
    grid = Table(box=None, show_header=False, padding=(0, 1), expand=True)
    grid.add_column(width=32, no_wrap=False)
    grid.add_column(ratio=1)
    grid.add_row(Panel(tree, title="Files", border_style="cyan", box=box.ROUNDED), preview_panel)
    footer = Text(f"{len(files)} files (showing {min(len(files), _MAX_FILES)}), preview capped {_MAX_LINES}L/{_MAX_BYTES}B", style="dim")
    return Panel(Group(grid, footer), title="Code Preview", border_style="cyan", box=box.ROUNDED)


def build_tree_panel(files: Dict[str, Any]) -> Panel:
    return Panel(build_file_tree(files), title="File Tree", border_style="cyan", box=box.ROUNDED)


if __name__ == "__main__":
    from rich.console import Console
    demo = {"main.py": "def hello():\n    print('hi')\n", "utils.py": "x=1\n" * 200, "README.md": "# hi"}
    Console().print(build_code_preview(demo))
    assert build_file_tree({}).label  # type: ignore
    # OOM cap check
    big = {f"f{i}.py": "a"*9000 for i in range(60)}
    p = build_code_preview(big)
    assert p is not None
    print("demo ok")
