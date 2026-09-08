import os, requests, json, time, re
from pathlib import Path
for l in Path('/home/parshu/projects/AutoGIT/.env').read_text().splitlines():
    if l.strip() and not l.strip().startswith('#') and '=' in l:
        k,v=l.split('=',1); os.environ[k.strip()]=v.strip()

headers={'Authorization':'Bearer '+os.getenv('OPENROUTER_API_KEY'), 'Content-Type':'application/json', 'HTTP-Referer':'https://github.com/Parswanadh/AutoGIT', 'X-Title':'AutoGIT OT Test', 'Accept':'text/event-stream'}

prompt = """Implement a real-time collaborative text editor with Operational Transformation: OT algorithm (insert/delete transform), cursor presence sync via WebSockets, document persistence, conflict resolution, undo/redo, presence awareness. Python backend with websockets + asyncio, client simulation. Full implementation.

Requirements:
1. OT algorithm: Operation class insert(pos,text) delete(pos,length), transform(opA,opB) for all 4 combos (insert-insert tie-break client_id, insert-delete, delete-insert, delete-delete with overlap handling), transform_cursor, transform against history, apply_operation.
2. Document: content string, revision int, history list, apply_operation, persistence JSON, lock.
3. WebSocket server: asyncio + websockets, transform incoming op against history since client's base revision, apply, broadcast, cursor transform, messages init/join/operation/cursor/undo/redo/presence/state.
4. Conflict resolution via OT.
5. Cursor presence sync + presence awareness join/leave.
6. Undo/Redo per-client stacks.
7. Client simulation SimClient with websockets.
8. Verification demo.

Return full runnable Python code with file markers like "# file: ot.py". No truncation, no TODOs, complete."""

payload={'model':'stealth/ox-alpha','messages':[{'role':'user','content': prompt}],'max_tokens':16000,'temperature':0.2,'stream':True}

print(f"[live] start {time.strftime('%H:%M:%S')} max_tokens=16000", flush=True)
t0=time.time()
r=requests.post('https://openrouter.ai/api/v1/chat/completions', headers=headers, json=payload, stream=True, timeout=(30, 600))
print(f"[live] status {r.status_code}", flush=True)
if r.status_code!=200:
    print(r.text[:2000])
    exit(1)

content_parts=[]
reasoning_parts=[]
finish=None
chunk_n=0
last_print=t0
seen_processing=0
for line in r.iter_lines(decode_unicode=True):
    if not line:
        continue
    if line.startswith(": OPENROUTER PROCESSING"):
        seen_processing+=1
        if seen_processing%10==0:
            print(f"[keepalive] {seen_processing} elapsed {time.time()-t0:.1f}s", flush=True)
        continue
    if not line.startswith("data:"):
        continue
    data_str=line[5:].strip()
    if data_str=="[DONE]":
        print("[stream] DONE", flush=True)
        break
    try:
        j=json.loads(data_str)
    except:
        print(f"[warn] bad json {data_str[:200]}", flush=True)
        continue
    chunk_n+=1
    choices=j.get("choices",[])
    if not choices:
        # may have usage
        if "usage" in j:
            print(f"[usage] {j['usage']}", flush=True)
        continue
    delta=choices[0].get("delta",{})
    fr=choices[0].get("finish_reason")
    if fr:
        finish=fr
        print(f"[finish] {fr} native {choices[0].get('native_finish_reason')}", flush=True)
    if "content" in delta and delta["content"]:
        content_parts.append(delta["content"])
    if "reasoning" in delta and delta["reasoning"]:
        reasoning_parts.append(delta["reasoning"])
    # also reasoning_details
    if time.time()-last_print>5:
        elapsed=time.time()-t0
        cc=sum(len(p) for p in content_parts)
        rc=sum(len(p) for p in reasoning_parts)
        print(f"[progress] {elapsed:.1f}s chunks={chunk_n} content_chars={cc} reasoning_chars={rc} processing_keepalives={seen_processing}", flush=True)
        last_print=time.time()

elapsed=time.time()-t0
content="".join(content_parts)
reasoning="".join(reasoning_parts)
print(f"\n[done] elapsed {elapsed:.1f}s chunks {chunk_n} finish {finish}", flush=True)
print(f"[done] content {len(content)} chars {content.count(chr(10))+1} lines", flush=True)
print(f"[done] reasoning {len(reasoning)} chars", flush=True)
if len(content)>0:
    print(f"[done] content preview {content[:500]!r}", flush=True)
# save
out=Path("/home/parshu/projects/AutoGIT/collab_editor/llm_full_output.md")
out.write_text(f"# reasoning\n{reasoning}\n\n# content\n{content}")
Path("/home/parshu/projects/AutoGIT/collab_editor/llm_full_content.py").write_text(content)
print(f"[saved] {out} {len(content+reasoning)} total", flush=True)
# verify
low=content.lower()
checks={
 "ot transform": "def transform" in content,
 "cursor sync": "cursor" in low and "transform_cursor" in content,
 "persistence": "persist" in low,
 "conflict": "conflict" in low or "history" in low,
 "websockets": "websockets" in low,
 "undo/redo": "undo" in low and "redo" in low,
 "asyncio": "asyncio" in low,
}
print(f"[verify] {checks}", flush=True)
for k,v in checks.items():
    print(f"  {'PASS' if v else 'FAIL'}: {k}", flush=True)
if finish=="length":
    print("WARNING truncated", flush=True)
else:
    print(f"no truncation finish={finish}", flush=True)
# check todos
todos=re.findall(r"TODO|PLACEHOLDER", content, re.I)
print(f"[verify] TODOs {len(todos)}", flush=True)
files=re.findall(r"file:\s*\S+\.py", content, re.I)
print(f"[verify] file markers {files}", flush=True)
