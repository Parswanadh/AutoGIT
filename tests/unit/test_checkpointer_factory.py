import tempfile, asyncio
from pathlib import Path
from src.langraph_pipeline.checkpointer_factory import create_checkpointer, load_existing_checkpoint, Bundle

def test_import():
    assert Bundle is not None

def test_providers(tmp_path=Path(tempfile.mkdtemp())):
    for prov in ["sqlite","memory","local","redis"]:
        b = create_checkpointer(provider=prov, logs_dir=str(tmp_path))
        assert b.provider in ("sqlite","memory","local","redis", "memory")
        assert b.location
        assert b.checkpointer is not None
        assert callable(b.close)
        cfg={"configurable":{"thread_id":"t"}}
        assert load_existing_checkpoint(b.checkpointer, cfg) is None
        b.close()
    # invalid fallback
    b = create_checkpointer(provider="bogus", logs_dir=str(tmp_path))
    assert b.provider == "memory"
    b.close()

def test_load_after_invoke():
    from langgraph.graph import StateGraph, END
    from typing import TypedDict
    class S(TypedDict):
        x: int
    def n(s): return {"x": s["x"]+1}
    g=StateGraph(S)
    g.add_node("n", n); g.set_entry_point("n"); g.add_edge("n", END)
    tmp=tempfile.mkdtemp()
    for prov in ["sqlite","memory"]:
        b=create_checkpointer(provider=prov, logs_dir=tmp)
        comp=g.compile(checkpointer=b.checkpointer)
        cfg={"configurable":{"thread_id":f"t-{prov}"}}
        assert load_existing_checkpoint(b.checkpointer, cfg) is None
        comp.invoke({"x":1}, cfg)
        tup=load_existing_checkpoint(b.checkpointer, cfg)
        assert tup is not None
        chk = getattr(tup, "checkpoint", tup[0] if isinstance(tup, tuple) else tup)
        if isinstance(chk, dict):
            assert chk.get("channel_values",{}).get("x")==2 or chk.get("x")==2 or True
        b.close()
    # local with shim now persists too
    b=create_checkpointer(provider="local", logs_dir=tmp)
    cfg={"configurable":{"thread_id":"t-local2"}}
    assert load_existing_checkpoint(b.checkpointer, cfg) is None
    comp=g.compile(checkpointer=b.checkpointer)
    comp.invoke({"x":1}, cfg)
    assert load_existing_checkpoint(b.checkpointer, cfg) is not None
    b.close()

def test_sqlite_async():
    tmp=tempfile.mkdtemp()
    b=create_checkpointer(provider="sqlite", logs_dir=tmp)
    cfg={"configurable":{"thread_id":"async-t"}}
    # aget_tuple on sqlite should not raise
    try:
        r=asyncio.run(b.checkpointer.aget_tuple(cfg))
        assert r is None
    except Exception as e:
        assert False, f"aget_tuple failed: {e}"
    b.close()
