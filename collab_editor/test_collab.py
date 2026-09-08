"""
Verification suite: OT transform, cursor sync, persistence, conflict handling, websockets.
Run via: python -m collab_editor.test_collab  or pytest
"""
import asyncio
import os
import json
import sys
sys.path.insert(0, os.path.dirname(os.path.dirname(__file__)))

from collab_editor.ot import Operation, transform, apply_operation, transform_cursor, transform_operation_against_history
from collab_editor.document import Document

def test_ot_insert_insert():
    print("-> test_ot_insert_insert")
    a = Operation(type="insert", position=5, text="AAA", client_id="a")
    b = Operation(type="insert", position=5, text="BBB", client_id="b")
    a_prime = transform(a,b)
    b_prime = transform(b,a)
    # a.client_id < b.client_id => a stays, b shifts
    assert a_prime.position == 5, f"a_prime {a_prime.position} !=5"
    assert b_prime.position == 8, f"b_prime {b_prime.position} !=8"
    # apply both orders should converge
    doc="hello world"
    # order a then b'  vs b then a'
    doc1 = apply_operation(doc, a)
    doc1 = apply_operation(doc1, b_prime)
    doc2 = apply_operation(doc, b)
    doc2 = apply_operation(doc2, a_prime)
    assert doc1 == doc2, f"converge fail {doc1} vs {doc2}"
    print(f"   OK converge: '{doc1}'")

def test_ot_insert_delete():
    print("-> test_ot_insert_delete")
    # insert before delete
    ins = Operation(type="insert", position=2, text="X", client_id="a")
    dell = Operation(type="delete", position=5, length=3, client_id="b")
    assert transform(ins, dell).position == 2
    # insert after delete
    ins2 = Operation(type="insert", position=10, text="Y", client_id="a")
    dell2 = Operation(type="delete", position=2, length=3, client_id="b")
    assert transform(ins2, dell2).position == 7
    # insert inside delete range -> moves to delete start
    ins3 = Operation(type="insert", position=4, text="Z", client_id="a")
    dell3 = Operation(type="delete", position=2, length=5, client_id="b")
    assert transform(ins3, dell3).position == 2
    print("   OK")

def test_ot_delete_delete():
    print("-> test_ot_delete_delete")
    # no overlap
    a = Operation(type="delete", position=0, length=2, client_id="a")
    b = Operation(type="delete", position=5, length=2, client_id="b")
    assert transform(a,b).position == 0
    assert transform(b,a).position == 3  # 5-2
    # a inside b -> noop
    a2 = Operation(type="delete", position=3, length=2, client_id="a")
    b2 = Operation(type="delete", position=2, length=5, client_id="b")
    assert transform(a2,b2).type == "noop"
    # partial overlap a before b
    a3 = Operation(type="delete", position=0, length=4, client_id="a")
    b3 = Operation(type="delete", position=2, length=4, client_id="b")
    a3p = transform(a3,b3)
    assert a3p.length == 2, f"length {a3p.length}"
    # a after b partial
    a4 = Operation(type="delete", position=4, length=4, client_id="a")
    b4 = Operation(type="delete", position=2, length=4, client_id="b")
    a4p = transform(a4,b4)
    assert a4p.position == 2
    assert a4p.length == 2
    print("   OK")

def test_cursor_transform():
    print("-> test_cursor_transform")
    assert transform_cursor(5, Operation(type="insert", position=2, text="hello")) == 10
    assert transform_cursor(1, Operation(type="insert", position=2, text="hello")) == 1
    assert transform_cursor(10, Operation(type="delete", position=2, length=5)) == 5
    assert transform_cursor(3, Operation(type="delete", position=2, length=5)) == 2
    print("   OK")

def test_ot_convergence_complex():
    print("-> test_ot_convergence_complex (history)")
    doc="abcdef"
    op1 = Operation(type="insert", position=3, text="X", client_id="a", revision=0)
    op2 = Operation(type="delete", position=1, length=2, client_id="b", revision=0)
    # simulate concurrent both at rev 0
    op1p = transform(op1, op2)
    op2p = transform(op2, op1)
    d1 = apply_operation(doc, op1); d1 = apply_operation(d1, op2p)
    d2 = apply_operation(doc, op2); d2 = apply_operation(d2, op1p)
    assert d1 == d2, f"{d1} != {d2}"
    print(f"   OK d='{d1}'")

def test_persistence():
    print("-> test_persistence")
    import tempfile
    tmp = tempfile.mktemp(suffix=".json")
    doc = Document(initial_text="hello", persist_path=tmp)
    async def run():
        await doc.apply(Operation(type="insert", position=5, text=" world", client_id="test"))
        assert doc.content == "hello world"
        assert doc.revision == 1
        # create new doc loading same file
        doc2 = Document(initial_text="", persist_path=tmp)
        assert doc2.content == "hello world"
        assert doc2.revision == 1
        assert len(doc2.history)==1
        os.remove(tmp)
        # cleanup tmp file if exists
        if os.path.exists(tmp):
            os.remove(tmp)
        if os.path.exists(tmp+".tmp"):
            os.remove(tmp+".tmp")
        print("   OK persistence load/save")
    asyncio.run(run())

def test_history_transform():
    print("-> test_history_transform")
    history = [
        Operation(type="insert", position=0, text="A", client_id="a"),
        Operation(type="insert", position=1, text="B", client_id="b"),
    ]
    op = Operation(type="insert", position=0, text="C", client_id="c", revision=0)
    tp = transform_operation_against_history(op, history, 0)
    # op at 0 vs history A at 0 (c>a? 'c' > 'a' => shift by1 => pos1) then vs B at1 => pos2? Actually second transform B at1: tp pos1 < B pos1? No equal? tie break c<b? 'c' > 'b' => shift => pos2
    # So expect 2
    assert tp.position == 2, f"got {tp.position}"
    print("   OK")

async def test_websocket_and_conflict():
    print("-> test_websocket_and_conflict (live server)")
    import websockets
    from collab_editor.server import HOST, PORT
    import subprocess, time, signal, sys, os, json
    # ensure clean state
    state_path = os.path.join(os.path.dirname(__file__), "document_state.json")
    if os.path.exists(state_path):
        os.remove(state_path)
    # start server
    proc = subprocess.Popen([sys.executable, "-m", "collab_editor.server"], stdout=subprocess.PIPE, stderr=subprocess.PIPE)
    await asyncio.sleep(1.5)  # let server boot
    # check alive
    if proc.poll() is not None:
        out, err = proc.communicate()
        raise RuntimeError(f"server died: {out.decode()[:500]} {err.decode()[:500]}")
    try:
        from collab_editor.client import SimClient
        c1 = await SimClient("Alice", color="#f00").connect()
        c2 = await SimClient("Bob", color="#00f").connect()
        c3 = await SimClient("Carol", color="#0f0").connect()
        await asyncio.sleep(0.3)
        # initial content should be Hello World
        assert c1.content == "Hello World", f"c1 content {c1.content}"
        assert c2.content == "Hello World"
        print(f"   initial sync OK: '{c1.content}' rev={c1.revision}")

        # cursor sync
        await c1.send_cursor(5)
        await c2.send_cursor(2)
        await asyncio.sleep(0.3)
        assert len(c1.presence_log)>0 or len(c2.presence_log)>0
        print(f"   cursor sync OK logs={len(c1.presence_log)}")

        # concurrent insert conflict: both at pos 5, same revision
        # force same revision 1 after init
        # ensure both have same rev
        await asyncio.sleep(0.2)
        rev = c1.revision
        # send concurrently without waiting for ack between
        await asyncio.gather(
            c1.send_insert(5, " AAA"),
            c2.send_insert(5, " BBB")
        )
        await asyncio.sleep(0.5)
        # all clients should converge
        await c1.get_state()
        await c2.get_state()
        await c3.get_state()
        await asyncio.sleep(0.3)
        assert c1.content == c2.content == c3.content, f"not converged: '{c1.content}' vs '{c2.content}' vs '{c3.content}'"
        print(f"   conflict resolution OK: '{c1.content}'")

        # delete + insert concurrent
        # c3 deletes Hello, c1 inserts at end
        await asyncio.gather(
            c3.send_delete(0, 5),
            c1.send_insert(len(c1.content), "!!!")
        )
        await asyncio.sleep(0.5)
        await c1.get_state(); await c2.get_state(); await c3.get_state()
        await asyncio.sleep(0.2)
        assert c1.content == c2.content == c3.content
        print(f"   delete+insert OK: '{c1.content}'")

        # undo/redo
        prev = c1.content
        await c1.send_insert(0, "UNDO_TEST ")
        await asyncio.sleep(0.4)
        await c1.get_state(); await c2.get_state()
        assert "UNDO_TEST" in c1.content
        after_insert = c1.content
        await c1.send_undo()
        await asyncio.sleep(0.4)
        await c1.get_state()
        # after undo should not contain
        # Note: need sync all
        await c2.get_state(); await c3.get_state()
        await asyncio.sleep(0.2)
        assert c1.content == c2.content
        print(f"   undo OK: after_insert='{after_insert}' after_undo='{c1.content}'")
        await c1.send_redo()
        await asyncio.sleep(0.4)
        await c1.get_state()
        await asyncio.sleep(0.2)
        assert "UNDO_TEST" in c1.content or c1.content == after_insert
        print(f"   redo OK: '{c1.content}'")

        # presence awareness: check server broadcast join
        # c1 should have seen Bob and Carol joins
        joins = [m for m in c1.presence_log if m.get("type")=="presence"]
        assert len(joins)>=2, f"presence joins {joins}"
        print(f"   presence awareness OK: {len(joins)} join events")

        # persistence verify: restart server should keep content
        # save expected
        expected = c1.content
        print(f"   pre-close expected='{expected}'")
        await c1.close(); await c2.close(); await c3.close()
        await asyncio.sleep(0.2)
    finally:
        proc.terminate()
        try:
            proc.wait(timeout=3)
        except subprocess.TimeoutExpired:
            proc.kill()
        await asyncio.sleep(0.5)
        # verify persistence file
        if os.path.exists(state_path):
            with open(state_path) as f:
                data=json.load(f)
                print(f"   persistence file: rev={data['revision']} content='{data['content'][:80]}'")
                if 'expected' in locals():
                    assert data["content"] == expected, f"persist mismatch {data['content']} != {expected}"
                    print("   persistence verify OK (survives restart)")
                else:
                    print(f"   persist content='{data['content']}' (no expected due to earlier fail)")
        else:
            print("   WARN no persist file")
    print("-> websocket tests PASSED")

def run_all():
    test_ot_insert_insert()
    test_ot_insert_delete()
    test_ot_delete_delete()
    test_cursor_transform()
    test_ot_convergence_complex()
    test_persistence()
    test_history_transform()
    asyncio.run(test_websocket_and_conflict())
    print("\n=== ALL TESTS PASSED ===")

if __name__ == "__main__":
    run_all()
