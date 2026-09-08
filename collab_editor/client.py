"""
Client simulation for collaborative editing.
Supports:
- connect via websockets, join with name/cursor
- send operations (insert/delete) with revision tracking
- local document shadow + pending ops
- cursor sync
- undo/redo
"""
import asyncio
import json
import uuid
import websockets
from typing import Optional

class SimClient:
    def __init__(self, name: str, uri="ws://127.0.0.1:8767", color="#000"):
        self.name = name
        self.uri = uri
        self.color = color
        self.client_id: Optional[str] = None
        self.revision = 0
        self.content = ""
        self.cursor = 0
        self.ws = None
        self.recv_task = None
        self.ops_received = []
        self.presence_log = []
        self._connected = False

    async def connect(self):
        self.ws = await websockets.connect(self.uri)
        self._connected = True
        self.recv_task = asyncio.create_task(self._recv_loop())
        # wait for init
        await asyncio.sleep(0.2)
        # join
        await self.ws.send(json.dumps({"type":"join", "name": self.name, "color": self.color, "cursor": self.cursor}))
        await asyncio.sleep(0.1)
        return self

    async def _recv_loop(self):
        try:
            async for raw in self.ws:
                msg = json.loads(raw)
                t = msg.get("type")
                if t == "init":
                    self.client_id = msg["client_id"]
                    self.content = msg["content"]
                    self.revision = msg["revision"]
                elif t == "operation":
                    op = msg["op"]
                    self.revision = msg["revision"]
                    self.content = msg["content"]
                    self.ops_received.append(op)
                    # adjust cursor if not own op? server already transforms, but client updates shadow
                    # simple: update content and revision
                elif t == "ack":
                    if "revision" in msg:
                        self.revision = msg["revision"]
                elif t in ("presence","presence_update","cursor_update"):
                    self.presence_log.append(msg)
                elif t == "state":
                    self.content = msg["content"]
                    self.revision = msg["revision"]
        except websockets.exceptions.ConnectionClosed:
            pass

    async def send_insert(self, pos: int, text: str):
        op = {"type":"insert", "position": pos, "text": text, "revision": self.revision, "op_id": str(uuid.uuid4())}
        await self.ws.send(json.dumps({"type":"operation", "op": op}))
        await asyncio.sleep(0.05)

    async def send_delete(self, pos: int, length: int):
        op = {"type":"delete", "position": pos, "length": length, "revision": self.revision, "op_id": str(uuid.uuid4())}
        await self.ws.send(json.dumps({"type":"operation", "op": op}))
        await asyncio.sleep(0.05)

    async def send_cursor(self, pos: int):
        self.cursor = pos
        await self.ws.send(json.dumps({"type":"cursor", "position": pos}))
        await asyncio.sleep(0.02)

    async def send_undo(self):
        await self.ws.send(json.dumps({"type":"undo"}))
        await asyncio.sleep(0.1)

    async def send_redo(self):
        await self.ws.send(json.dumps({"type":"redo"}))
        await asyncio.sleep(0.1)

    async def get_state(self):
        await self.ws.send(json.dumps({"type":"get_state"}))
        await asyncio.sleep(0.1)
        return self.content, self.revision

    async def close(self):
        if self.recv_task:
            self.recv_task.cancel()
            try:
                await self.recv_task
            except asyncio.CancelledError:
                pass
        if self.ws:
            await self.ws.close()
        self._connected = False

    def __repr__(self):
        return f"<SimClient {self.name} id={self.client_id} rev={self.revision} content='{self.content[:20]}'>"
