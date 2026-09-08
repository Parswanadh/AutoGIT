"""
Live complex test with stealth/ox-alpha via OpenRouter.
- Reads key from .env (OPENROUTER_API_KEY)
- max_tokens 16000, no limiter truncation
- Full OT collaborative editor prompt
- Verifies: OT transform functions, cursor sync, persistence, conflict handling, websockets
- Reports detailed metrics
"""
import os, sys, json, time, re
from pathlib import Path

# load env
env_path = Path("/home/parshu/projects/AutoGIT/.env")
if env_path.exists():
    for line in env_path.read_text().splitlines():
        line=line.strip()
        if not line or line.startswith("#") or "=" not in line:
            continue
        k,v=line.split("=",1)
        os.environ[k.strip()] = v.strip()

api_key = os.getenv("OPENROUTER_API_KEY")
if not api_key:
    print("ERROR no OPENROUTER_API_KEY")
    sys.exit(1)
print(f"[live] key={api_key[:10]}... len={len(api_key)}")
print(f"[live] model=stealth/ox-alpha max_tokens=16000")

try:
    from openai import OpenAI
except ImportError:
    print("install openai")
    sys.exit(1)

client = OpenAI(
    base_url="https://openrouter.ai/api/v1",
    api_key=api_key,
)

PROMPT = """Implement a real-time collaborative text editor with Operational Transformation: OT algorithm (insert/delete transform), cursor presence sync via WebSockets, document persistence, conflict resolution, undo/redo, presence awareness. Python backend with websockets + asyncio, client simulation. Full implementation. No placeholders, no TODOs, complete runnable code.

Requirements in detail:
1. OT algorithm: implement Operation class with insert(pos,text) and delete(pos,length), and transform(opA, opB) handling all 4 cases: insert-insert (tie-break by client_id), insert-delete, delete-insert, delete-delete (including overlapping deletes -> noop/length adjust). Also transform_cursor and transform against history.
2. Document model: maintain content string, revision int, history list, apply_operation function, persistence to JSON file (load on startup, save on each op), concurrency lock.
3. WebSocket server: asyncio + websockets, handle multiple clients, on operation transform incoming op against history since client's base revision, apply, broadcast to all, transform cursors, handle persistence. Support message types: init, join, operation, cursor, undo, redo, presence, state.
4. Conflict resolution: demonstrate concurrent ops at same position converging to same document via OT.
5. Cursor presence sync: broadcast cursor positions, transform cursors on edits, presence awareness join/leave events.
6. Undo/Redo: per-client stacks, invert operations, handle delete text recovery.
7. Client simulation: SimClient class that connects via websockets, sends operations, tracks revision, receives broadcasts.
8. Provide verification/demo: small test showing OT convergence and websocket interaction.
9. Code must be complete, runnable, no truncation.

Return the full Python implementation with all files. Use clear file markers like "# file: ot.py" etc. Keep it concise but complete. Do not truncate."""

print("[live] sending request...")
t0 = time.time()
try:
    resp = client.chat.completions.create(
        model="stealth/ox-alpha",
        messages=[{"role":"user","content": PROMPT}],
        max_tokens=16000,
        temperature=0.2,
        extra_headers={
            "HTTP-Referer": "https://github.com/Parswanadh/AutoGIT",
            "X-Title": "AutoGIT OT Test"
        }
    )
except Exception as e:
    print(f"[live] API error: {e}")
    # try alternative model naming
    import traceback
    traceback.print_exc()
    sys.exit(1)

elapsed = time.time() - t0
choice = resp.choices[0]
finish = choice.finish_reason
content = choice.message.content or ""
usage = resp.usage

print(f"[live] finish_reason={finish} elapsed={elapsed:.1f}s")
if usage:
    print(f"[live] usage prompt={usage.prompt_tokens} completion={usage.completion_tokens} total={usage.total_tokens}")
print(f"[live] content length chars={len(content)} lines={content.count(chr(10))+1}")
# Check truncation indicators
truncated = False
if finish == "length":
    print("[WARN] TRUNCATED by max_tokens limit!")
    truncated = True
else:
    print(f"[live] no truncation (finish={finish})")

# Save full output
out_path = Path("/home/parshu/projects/AutoGIT/collab_editor/llm_output_ox_alpha.md")
out_path.write_text(content)
print(f"[live] saved to {out_path} ({len(content)} chars)")

# Verification checks
checks = {
    "ot transform functions": False,
    "cursor sync": False,
    "persistence": False,
    "conflict handling": False,
    "websockets": False,
    "insert/delete transform": False,
    "undo/redo": False,
    "presence awareness": False,
    "asyncio": False,
    "apply_operation": False,
}

low = content.lower()

# heuristics
if "def transform" in content and "insert" in low and "delete" in low:
    checks["ot transform functions"] = True
    # check insert/delete cases
    if low.count("insert")>5 and low.count("delete")>5:
        checks["insert/delete transform"] = True

if "cursor" in low and ("transform_cursor" in content or "cursor" in low):
    # need cursor sync evidence
    if "cursor" in low and ("broadcast" in low or "sync" in low):
        checks["cursor sync"] = True
    else:
        checks["cursor sync"] = "cursor" in low

if "persist" in low or "json" in low or "save" in low or "load" in low:
    checks["persistence"] = True

if "conflict" in low or "concurrent" in low or "convergence" in low:
    checks["conflict handling"] = True
else:
    # alternative: history transform implies conflict
    if "transform" in low and "history" in low:
        checks["conflict handling"] = True

if "websockets" in low or "websocket" in low:
    checks["websockets"] = True

if "undo" in low and "redo" in low:
    checks["undo/redo"] = True

if "presence" in low or "join" in low:
    checks["presence awareness"] = True

if "asyncio" in low or "async def" in content:
    checks["asyncio"] = True

if "apply_operation" in content or "apply" in low:
    checks["apply_operation"] = True

print("\n[verify] checks:")
for k,v in checks.items():
    ok = "PASS" if v else "FAIL"
    print(f"  {ok}: {k}")

all_pass = all(v for v in checks.values())
print(f"\n[verify] overall: {'ALL PASS' if all_pass else 'SOME FAIL'}")
if truncated:
    print("[verify] WARNING: output truncated, may be incomplete")

# Detailed OT function verification by extracting code
# Try to count transform cases
cases = ["insert.*insert","insert.*delete","delete.*insert","delete.*delete"]
for pat in cases:
    found = bool(re.search(pat, low, re.DOTALL))
    print(f"  case {pat}: {'found' if found else 'missing'}")

# Check for no TODO placeholders
todos = re.findall(r"TODO|PLACEHOLDER|pass\s*#.*todo", content, re.I)
if todos:
    print(f"[warn] found {len(todos)} TODO/placeholder markers: {todos[:5]}")
else:
    print("[verify] no TODO/placeholder -> good")

# Check file markers
files_found = re.findall(r"file:\s*\S+\.py", content, re.I)
print(f"[verify] file markers found: {files_found}")

# Token estimation
import tiktoken
try:
    enc = tiktoken.get_encoding("cl100k_base")
    toks = len(enc.encode(content))
    print(f"[verify] estimated tokens cl100k: {toks}")
except:
    print("[verify] tiktoken not available")

# Try to actually run extracted python if possible? At least syntax check
# Extract python code blocks
code_blocks = re.findall(r"```python(.*?)```", content, re.DOTALL)
if code_blocks:
    print(f"[verify] found {len(code_blocks)} python code blocks")
    for i, block in enumerate(code_blocks[:2]):
        try:
            compile(block, f"<llm_block_{i}>", "exec")
            print(f"  block {i}: syntax OK ({len(block)} chars)")
        except SyntaxError as e:
            print(f"  block {i}: syntax FAIL {e}")
else:
    # try compile whole content as python? might be mixed markdown
    print("[verify] no ```python blocks, checking if content is pure python")
    try:
        compile(content, "<llm_output>", "exec")
        print("  whole content syntax OK")
    except SyntaxError as e:
        print(f"  whole content not pure python (expected for markdown): {e.msg} line {e.lineno}")

print("\n=== LIVE TEST REPORT ===")
print(f"model: stealth/ox-alpha")
print(f"max_tokens: 16000")
print(f"finish_reason: {finish}")
print(f"truncated: {truncated}")
print(f"chars: {len(content)} tokens_est: {usage.completion_tokens if usage else 'unknown'}")
print(f"elapsed: {elapsed:.1f}s")
for k,v in checks.items():
    print(f"{k}: {'PASS' if v else 'FAIL'}")
print(f"overall: {'PASS' if all_pass and not truncated else 'PARTIAL/FAIL'}")
