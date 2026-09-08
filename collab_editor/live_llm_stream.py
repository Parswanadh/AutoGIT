import os, sys, time, re, json
from pathlib import Path
for l in Path('/home/parshu/projects/AutoGIT/.env').read_text().splitlines():
    if l.strip() and not l.strip().startswith('#') and '=' in l:
        k,v=l.split('=',1); os.environ[k.strip()]=v.strip()
from openai import OpenAI
client = OpenAI(base_url="https://openrouter.ai/api/v1", api_key=os.getenv("OPENROUTER_API_KEY"))
prompt = """Implement a real-time collaborative text editor with Operational Transformation: OT algorithm (insert/delete transform), cursor presence sync via WebSockets, document persistence, conflict resolution, undo/redo, presence awareness. Python backend with websockets + asyncio, client simulation. Full implementation.

Requirements:
1. OT algorithm: Operation class insert(pos,text) delete(pos,length), transform(opA,opB) for 4 cases, transform_cursor, transform against history, apply_operation.
2. Document: content, revision, history, persistence JSON, lock.
3. WebSocket server: asyncio websockets, transform incoming op against history, apply, broadcast, cursor transform, messages init/join/operation/cursor/undo/redo/presence/state.
4. Conflict resolution via OT.
5. Cursor presence sync + presence awareness join/leave.
6. Undo/Redo per-client.
7. Client simulation SimClient.
8. Verification demo.

Return full runnable Python code with file markers "# file: ot.py" etc. No truncation, no TODOs."""

print(f"[stream] start model=stealth/ox-alpha max_tokens=16000", flush=True)
t0=time.time()
try:
    stream = client.chat.completions.create(
        model="stealth/ox-alpha",
        messages=[{"role":"user","content":prompt}],
        max_tokens=16000,
        temperature=0.2,
        stream=True,
        extra_headers={"HTTP-Referer":"https://github.com/Parswanadh/AutoGIT","X-Title":"AutoGIT OT Test"}
    )
    content_parts=[]
    reasoning_parts=[]
    finish=None
    chunk_count=0
    last_print=time.time()
    for chunk in stream:
        chunk_count+=1
        if chunk.choices:
            delta = chunk.choices[0].delta
            # delta may have content or reasoning
            if hasattr(delta,'content') and delta.content:
                content_parts.append(delta.content)
            if hasattr(delta,'reasoning') and delta.reasoning:
                reasoning_parts.append(delta.reasoning)
            # check reasoning_details?
            if hasattr(delta,'reasoning_details'):
                pass
            if chunk.choices[0].finish_reason:
                finish=chunk.choices[0].finish_reason
                print(f"\n[stream] finish_reason={finish}", flush=True)
        # periodic stats
        if time.time()-last_print>5:
            elapsed=time.time()-t0
            chars=sum(len(p) for p in content_parts)
            print(f"[stream] {elapsed:.1f}s chunks={chunk_count} chars={chars} ", flush=True)
            last_print=time.time()
    elapsed=time.time()-t0
    content="".join(content_parts)
    reasoning="".join(reasoning_parts)
    print(f"\n[done] elapsed={elapsed:.1f}s chunks={chunk_count} finish={finish}", flush=True)
    print(f"[done] content chars={len(content)} lines={content.count(chr(10))+1}", flush=True)
    print(f"[done] reasoning chars={len(reasoning)}", flush=True)
    # Save
    out=Path("/home/parshu/projects/AutoGIT/collab_editor/llm_output_stream.md")
    out.write_text(f"# reasoning\n{reasoning}\n\n# content\n{content}")
    print(f"[done] saved {out} ", flush=True)
    # Also pure content
    Path("/home/parshu/projects/AutoGIT/collab_editor/llm_output_stream_content.py").write_text(content)
    # verification
    low=content.lower()
    checks={
        "ot transform": "def transform" in content,
        "cursor sync": "cursor" in low and "transform_cursor" in content,
        "persistence": "persist" in low or "json" in low,
        "conflict": "conflict" in low or "history" in low,
        "websockets": "websockets" in low,
        "undo/redo": "undo" in low and "redo" in low,
        "asyncio": "asyncio" in low,
    }
    print("[verify]", checks, flush=True)
    print(f"truncated={finish=='length'}", flush=True)
    # no truncation check
    if finish=="length":
        print("WARNING truncated", flush=True)
    else:
        print("no truncation", flush=True)
except Exception as e:
    import traceback
    traceback.print_exc()
    print(f"error {e}", flush=True)
    sys.exit(1)
