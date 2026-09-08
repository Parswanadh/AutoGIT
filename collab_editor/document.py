"""
Document model with persistence, revision history, undo/redo.
"""
import json, os, asyncio
from typing import List, Dict, Optional
from .ot import Operation, apply_operation

PERSIST_PATH = os.path.join(os.path.dirname(__file__), "document_state.json")

class Document:
    def __init__(self, initial_text: str = "", persist_path: str = PERSIST_PATH):
        self.content: str = initial_text
        self.revision: int = 0
        self.history: List[Operation] = []
        self.persist_path = persist_path
        self._lock = asyncio.Lock()
        # undo/redo per client: stack of ops applied
        self.undo_stacks: Dict[str, List[Operation]] = {}
        self.redo_stacks: Dict[str, List[Operation]] = {}
        self.load()

    def load(self):
        if os.path.exists(self.persist_path):
            try:
                with open(self.persist_path, "r") as f:
                    data = json.load(f)
                    self.content = data.get("content","")
                    self.revision = data.get("revision",0)
                    self.history = [Operation.from_dict(d) for d in data.get("history",[])]
            except Exception as e:
                print(f"[persist] load failed: {e}")

    def save(self):
        try:
            tmp = self.persist_path + ".tmp"
            with open(tmp, "w") as f:
                json.dump({
                    "content": self.content,
                    "revision": self.revision,
                    "history": [op.to_dict() for op in self.history]
                }, f, indent=2)
            os.replace(tmp, self.persist_path)
        except Exception as e:
            print(f"[persist] save failed: {e}")

    async def apply(self, op: Operation, is_undo_redo: bool = False) -> Operation:
        """Apply op (already transformed) to document. Returns op with updated revision."""
        async with self._lock:
            # capture deleted text for undo of deletes
            if op.type == "delete":
                # store deleted slice into op.text for later inversion (if not already)
                if not op.text:
                    try:
                        op.text = self.content[op.position:op.position+op.length]
                    except:
                        op.text = ""
            before = self.content
            self.content = apply_operation(self.content, op)
            op.revision = self.revision
            self.history.append(op.clone())
            self.revision += 1
            # push to undo
            if op.client_id:
                self.undo_stacks.setdefault(op.client_id, []).append(op.clone())
                if not is_undo_redo:
                    # clear redo on new normal op
                    if op.client_id in self.redo_stacks:
                        self.redo_stacks[op.client_id].clear()
            self.save()
            return op

    async def get_state(self):
        async with self._lock:
            return {"content": self.content, "revision": self.revision, "history_len": len(self.history)}

    def get_undo_op(self, client_id: str) -> Optional[Operation]:
        stack = self.undo_stacks.get(client_id, [])
        if not stack:
            return None
        last_op = stack.pop()
        inv = None
        if last_op.type == "insert":
            inv = Operation(type="delete", position=last_op.position, length=len(last_op.text), client_id=client_id)
        elif last_op.type == "delete":
            deleted_text = last_op.text if last_op.text else "?"*last_op.length
            inv = Operation(type="insert", position=last_op.position, text=deleted_text, client_id=client_id)
        else:
            return None
        self.redo_stacks.setdefault(client_id, []).append(last_op)
        return inv

    def get_redo_op(self, client_id: str) -> Optional[Operation]:
        stack = self.redo_stacks.get(client_id, [])
        if not stack:
            return None
        op = stack.pop()
        self.undo_stacks.setdefault(client_id, []).append(op.clone())
        return op.clone()
