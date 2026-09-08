"""
WebSocket server for collaborative editing.
Features:
- OT transform against history
- Broadcast ops to all clients
- Cursor presence sync (transform cursors on edits)
- Presence awareness (join/leave)
- Document persistence via Document class
- Conflict resolution via transform
- Undo/Redo via inverse ops
"""
import asyncio
import json
import uuid
import websockets
from websockets.server import WebSocketServerProtocol
import os
import sys

# allow running as script
sys.path.insert(0, os.path.dirname(os.path.dirname(__file__)))

from collab_editor.ot import Operation, transform_operation_against_history, transform_cursor
from collab_editor.document import Document

HOST = "127.0.0.1"
PORT = 8767

document = Document(initial_text="Hello World", persist_path=os.path.join(os.path.dirname(__file__), "document_state.json"))
clients: dict[str, WebSocketServerProtocol] = {}
client_info: dict[str, dict] = {}  # client_id -> {name, cursor, color}
# protect clients dict
clients_lock = asyncio.Lock()

async def broadcast(message: dict, exclude: str | None = None):
    data = json.dumps(message)
    async with clients_lock:
        targets = [(cid, ws) for cid, ws in clients.items() if cid != exclude]
    # send concurrently
    if not targets:
        return
    await asyncio.gather(*[ws.send(data) for _, ws in targets], return_exceptions=True)

async def send(ws, msg: dict):
    await ws.send(json.dumps(msg))

async def handle_operation(client_id: str, payload: dict):
    try:
        op = Operation(
            type=payload["type"],
            position=payload["position"],
            text=payload.get("text",""),
            length=payload.get("length",0),
            client_id=client_id,
            revision=payload.get("revision",0),
            op_id=payload.get("op_id", str(uuid.uuid4()))
        )
    except Exception as e:
        print(f"[op] invalid payload {payload}: {e}")
        return

    # validation trust boundary
    if op.position < 0 or (op.type=="insert" and op.position > len(document.content)) or (op.type=="delete" and op.position+op.length > len(document.content)):
        # try to transform first before rejecting
        pass

    # transform against history since client's base revision
    base_rev = op.revision
    if base_rev > document.revision:
        base_rev = document.revision
    if base_rev < 0:
        base_rev = 0

    transformed = transform_operation_against_history(op, document.history, base_rev)

    if transformed.is_noop():
        # ack noop
        ws = clients.get(client_id)
        if ws:
            await send(ws, {"type":"ack", "op_id": op.op_id, "revision": document.revision, "noop": True})
        return

    # check bounds after transform
    if transformed.type=="insert" and transformed.position > len(document.content):
        transformed.position = len(document.content)
    if transformed.type=="delete":
        if transformed.position >= len(document.content):
            transformed.type="noop"
            transformed.length=0
        elif transformed.position + transformed.length > len(document.content):
            transformed.length = len(document.content) - transformed.position

    if transformed.is_noop():
        ws = clients.get(client_id)
        if ws:
            await send(ws, {"type":"ack", "op_id": op.op_id, "revision": document.revision, "noop": True})
        return

    # apply
    applied = await document.apply(transformed)

    # transform all cursors
    for cid, info in client_info.items():
        if cid != client_id:
            old = info.get("cursor", 0)
            new = transform_cursor(old, applied)
            info["cursor"] = new

    # broadcast op to all (including sender as ack)
    msg = {
        "type": "operation",
        "op": applied.to_dict(),
        "revision": document.revision,
        "content": document.content
    }
    await broadcast(msg)
    # also update presence cursor broadcast
    await broadcast({"type":"presence_update", "clients": client_info})

async def handler(ws: WebSocketServerProtocol):
    client_id = str(uuid.uuid4())[:8]
    # wait for join message
    try:
        async with clients_lock:
            clients[client_id] = ws
        print(f"[join] {client_id} connected, total {len(clients)}")

        # send init
        state = await document.get_state()
        await send(ws, {
            "type": "init",
            "client_id": client_id,
            "content": document.content,
            "revision": document.revision,
            "clients": client_info
        })
        # inform others? not yet until join name

        async for raw in ws:
            try:
                msg = json.loads(raw)
            except:
                await send(ws, {"type":"error", "message":"invalid json"})
                continue

            t = msg.get("type")
            if t == "join":
                name = msg.get("name", f"User-{client_id}")
                color = msg.get("color", "#000")
                client_info[client_id] = {"name": name, "cursor": msg.get("cursor",0), "color": color, "id": client_id}
                await broadcast({"type":"presence", "event":"join", "client": client_info[client_id], "clients": client_info})
                print(f"[presence] {name} ({client_id}) joined at cursor {client_info[client_id]['cursor']}")

            elif t == "operation":
                await handle_operation(client_id, msg.get("op", msg))

            elif t == "cursor":
                pos = msg.get("position", 0)
                if client_id in client_info:
                    client_info[client_id]["cursor"] = pos
                else:
                    client_info[client_id] = {"name": f"User-{client_id}", "cursor": pos, "color":"#888", "id": client_id}
                await broadcast({"type":"cursor_update", "client_id": client_id, "position": pos, "clients": client_info}, exclude=None)

            elif t == "undo":
                op = document.get_undo_op(client_id)
                if op:
                    op.revision = document.revision
                    op.op_id = str(uuid.uuid4())
                    # transform and apply like normal op but don't clear redo
                    transformed = transform_operation_against_history(op, document.history, op.revision)
                    if not transformed.is_noop():
                        applied = await document.apply(transformed, is_undo_redo=True)
                        for cid, info in client_info.items():
                            if cid != client_id:
                                info["cursor"] = transform_cursor(info.get("cursor",0), applied)
                        await broadcast({"type":"operation", "op": applied.to_dict(), "revision": document.revision, "content": document.content, "undo": True})
                        await broadcast({"type":"presence_update", "clients": client_info})
                    else:
                        await send(ws, {"type":"ack", "noop": True})
                else:
                    await send(ws, {"type":"error", "message":"nothing to undo"})

            elif t == "redo":
                op = document.get_redo_op(client_id)
                if op:
                    op.revision = document.revision
                    op.op_id = str(uuid.uuid4())
                    transformed = transform_operation_against_history(op, document.history, op.revision)
                    if not transformed.is_noop():
                        applied = await document.apply(transformed, is_undo_redo=True)
                        for cid, info in client_info.items():
                            if cid != client_id:
                                info["cursor"] = transform_cursor(info.get("cursor",0), applied)
                        await broadcast({"type":"operation", "op": applied.to_dict(), "revision": document.revision, "content": document.content, "redo": True})
                        await broadcast({"type":"presence_update", "clients": client_info})
                    else:
                        await send(ws, {"type":"ack", "noop": True})
                else:
                    await send(ws, {"type":"error", "message":"nothing to redo"})

            elif t == "get_state":
                st = await document.get_state()
                await send(ws, {"type":"state", **st, "content": document.content})

            else:
                await send(ws, {"type":"error", "message": f"unknown type {t}"})

    except websockets.exceptions.ConnectionClosed:
        pass
    finally:
        async with clients_lock:
            clients.pop(client_id, None)
        info = client_info.pop(client_id, None)
        if info:
            await broadcast({"type":"presence", "event":"leave", "client": info, "clients": client_info})
        print(f"[leave] {client_id} disconnected")

async def main():
    # clear state for fresh test if needed? keep persistence
    print(f"[server] starting ws://{HOST}:{PORT} with doc='{document.content}' rev={document.revision}")
    async with websockets.serve(handler, HOST, PORT, ping_interval=20, ping_timeout=20):
        await asyncio.Future()

if __name__ == "__main__":
    try:
        asyncio.run(main())
    except KeyboardInterrupt:
        print("shutdown")
