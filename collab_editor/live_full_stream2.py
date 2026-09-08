import os, requests, json, time, re
from pathlib import Path
for l in Path('/home/parshu/projects/AutoGIT/.env').read_text().splitlines():
    if l.strip() and not l.strip().startswith('#') and '=' in l:
        k,v=l.split('=',1); os.environ[k.strip()]=v.strip()

headers={'Authorization':'Bearer '+os.getenv('OPENROUTER_API_KEY'), 'Content-Type':'application/json', 'HTTP-Referer':'https://github.com/Parswanadh/AutoGIT', 'X-Title':'AutoGIT OT Test', 'Accept':'text/event-stream'}

prompt = """You are an expert engineer. Implement a real-time collaborative text editor with Operational Transformation. Keep reasoning extremely brief (1-2 sentences max), then directly output code. No long chain-of-thought.

Requirements:
1. OT: Operation class insert/delete, transform() 4 cases, transform_cursor, apply_operation, transform against history.
2. Document: content, revision, history, persistence JSON, lock.
3. WebSocket server: asyncio websockets, transform incoming op, apply, broadcast, cursor transform, messages init/join/operation/cursor/undo/redo/presence/state.
4. Conflict resolution.
5. Cursor sync + presence awareness.
6. Undo/Redo.
7. Client SimClient.
Return full runnable Python code with "# file: ot.py" markers. No TODOs."""

payload={'model':'stealth/ox-alpha','messages':[{'role':'user','content': prompt}],'max_tokens':30000,'temperature':0.2,'stream':True}

print(f"[live2] start {time.strftime('%H:%M:%S')} max_tokens=30000 brief reasoning", flush=True)
t0=time.time()
r=requests.post('https://openrouter.ai/api/v1/chat/completions', headers=headers, json=payload, stream=True, timeout=(30, 700))
print(f"[live2] status {r.status_code}", flush=True)
if r.status_code!=200:
    print(r.text[:2000])
    exit(1)

content_parts=[]; reasoning_parts=[]; finish=None; chunk_n=0; last_print=t0; seen_processing=0
for line in r.iter_lines(decode_unicode=True):
    if not line:
        continue
    if line.startswith(": OPENROUTER PROCESSING"):
        seen_processing+=1
        if seen_processing%10==0:
            print(f"[keepalive] {seen_processing} {time.time()-t0:.1f}s", flush=True)
        continue
    if not line.startswith("data:"):
        continue
    data_str=line[5:].strip()
    if data_str=="[DONE]":
        print("[stream] DONE", flush=True)
        break
    try:
        j=json.loads(data_str)
    except: continue
    choices=j.get("choices",[])
    if not choices:
        if "usage" in j:
            print(f"[usage] {j['usage']}", flush=True)
        continue
    delta=choices[0].get("delta",{})
    fr=choices[0].get("finish_reason")
    if fr:
        finish=fr
        print(f"[finish] {fr} native {choices[0].get('native_finish_reason')}", flush=True)
    if delta.get("content"):
        content_parts.append(delta["content"])
    if delta.get("reasoning"):
        reasoning_parts.append(delta["reasoning"])
    if time.time()-last_print>5:
        elapsed=time.time()-t0
        cc=sum(len(p) for p in content_parts)
        rc=sum(len(p) for p in reasoning_parts)
        print(f"[progress] {elapsed:.1f}s c={cc} r={rc} chunks={chunk_n}", flush=True)
        last_print=time.time()
    chunk_n+=1

elapsed=time.time()-t0
content="".join(content_parts)
reasoning="".join(reasoning_parts)
print(f"\n[done] {elapsed:.1f}s finish {finish}", flush=True)
print(f"[done] content {len(content)} reasoning {len(reasoning)}", flush=True)
if content:
    print(content[:1000], flush=True)
Path("/home/parshu/projects/AutoGIT/collab_editor/llm_full2_output.md").write_text(content)
Path("/home/parshu/projects/AutoGIT/collab_editor/llm_full2_reasoning.md").write_text(reasoning)
print(f"[verify] content has transform:{'def transform' in content} websockets:{'websockets' in content.lower()} cursor:{'cursor' in content.lower()}", flush=True)
print(f"truncated {finish=='length'}", flush=True)
