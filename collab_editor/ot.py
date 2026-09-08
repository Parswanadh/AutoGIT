"""
Operational Transformation core.
Supports insert(pos, text) and delete(pos, length).
Transform handles insert/insert, insert/delete, delete/insert, delete/delete
with tie-break on client_id for concurrent inserts at same position.
"""
from __future__ import annotations
import copy
from dataclasses import dataclass, field
from typing import Literal, Optional

OpType = Literal["insert", "delete", "noop"]

@dataclass
class Operation:
    type: OpType
    position: int
    text: str = ""          # for insert
    length: int = 0         # for delete
    client_id: str = ""
    revision: int = 0       # base revision client had
    op_id: str = ""         # unique

    def __post_init__(self):
        if self.type == "insert" and not self.text:
            raise ValueError("insert requires text")
        if self.type == "delete" and self.length <= 0:
            raise ValueError("delete requires length>0")
        if self.position < 0:
            raise ValueError("position <0")

    def is_noop(self) -> bool:
        return self.type == "noop" or (self.type == "delete" and self.length == 0)

    def to_dict(self) -> dict:
        return {
            "type": self.type,
            "position": self.position,
            "text": self.text,
            "length": self.length,
            "client_id": self.client_id,
            "revision": self.revision,
            "op_id": self.op_id,
        }

    @staticmethod
    def from_dict(d: dict) -> "Operation":
        return Operation(
            type=d["type"],
            position=d["position"],
            text=d.get("text",""),
            length=d.get("length",0),
            client_id=d.get("client_id",""),
            revision=d.get("revision",0),
            op_id=d.get("op_id",""),
        )

    def invert(self, doc_before: str) -> "Operation":
        """Return inverse op. For undo."""
        if self.type == "insert":
            return Operation(type="delete", position=self.position, length=len(self.text), client_id=self.client_id)
        elif self.type == "delete":
            deleted_text = doc_before[self.position:self.position+self.length]
            return Operation(type="insert", position=self.position, text=deleted_text, client_id=self.client_id)
        else:
            return Operation(type="noop", position=0, client_id=self.client_id)

    def clone(self) -> "Operation":
        return copy.deepcopy(self)


def apply_operation(document: str, op: Operation) -> str:
    if op.type == "noop" or op.is_noop():
        return document
    if op.type == "insert":
        if op.position > len(document):
            raise ValueError(f"insert pos {op.position} > doc len {len(document)}")
        return document[:op.position] + op.text + document[op.position:]
    elif op.type == "delete":
        if op.position + op.length > len(document):
            raise ValueError(f"delete range {op.position}+{op.length} > doc len {len(document)}")
        return document[:op.position] + document[op.position+op.length:]
    else:
        raise ValueError(f"unknown op {op.type}")


def transform(op_a: Operation, op_b: Operation) -> Operation:
    """
    Transform op_a against op_b.
    Returns op_a' such that applying op_b then op_a' == op_a then op_b' (for op_b' = transform(op_b, op_a))
    Pure function, does not mutate inputs.
    """
    a = op_a.clone()
    b = op_b

    if a.is_noop() or b.is_noop():
        return a

    # insert vs insert
    if a.type == "insert" and b.type == "insert":
        if a.position < b.position:
            return a
        elif a.position > b.position:
            a.position += len(b.text)
            return a
        else: # same position -> tie break by client_id
            if a.client_id < b.client_id:
                return a
            else:
                a.position += len(b.text)
                return a

    # insert vs delete
    if a.type == "insert" and b.type == "delete":
        # b deletes [b.position, b.position+b.length)
        if a.position <= b.position:
            return a
        elif a.position > b.position + b.length:
            a.position -= b.length
            return a
        else: # inside deleted range -> move to delete start
            a.position = b.position
            return a

    # delete vs insert
    if a.type == "delete" and b.type == "insert":
        if a.position >= b.position:
            a.position += len(b.text)
            return a
        else:
            # delete starts before insert. If insert inside delete range, delete length expands
            # Actually if we have delete [a.pos, a.pos+a.len) and insert at b.pos where b.pos <= a.pos+a.len
            # The delete range should expand to include? No, insert shifts the content after insert point.
            # If b inserts before end of a's delete range, the delete should grow? Common OT: delete length unchanged
            # but position unchanged. However if insert is inside delete range, delete length += insert length
            # to preserve intent? Two philosophies. We use: delete length increases if insert inside delete window.
            # Alternative simpler: no length change, just position shift when insert before.
            # We already handled position >= b.pos. For insert inside delete interval, we need to extend length.
            # But since insert at b.pos which is > a.position and < a.position+a.length+?
            # Let's detect: if b.position > a.position and b.position < a.position + a.length
            # Then insert falls inside delete region -> the deleted span should include the inserted text? No.
            # If A deletes "hello" and B inserts "X" inside hello concurrently, intent unclear.
            # Conservative: transform delete to include inserted text? No, delete should not delete B's insert if B's insert is concurrent.
            # So we do NOT expand delete length. Keep length same.
            return a

    # delete vs delete
    if a.type == "delete" and b.type == "delete":
        a_start = a.position
        a_end = a.position + a.length
        b_start = b.position
        b_end = b.position + b.length

        # no overlap, a before b
        if a_end <= b_start:
            return a
        # a after b
        if a_start >= b_end:
            a.position -= b.length
            return a
        # overlap cases
        # a starts before b
        if a_start < b_start:
            if a_end <= b_end:
                # a=[0,5), b=[2,7) => a' should be [0,2) len=2
                a.length = b_start - a_start
                return a
            else: # a contains b or overlaps both sides: a=[0,10), b=[3,6) => a' len = 10-3=7
                a.length -= b.length
                return a
        else: # a_start >= b_start
            if a_end <= b_end:
                # a inside b -> becomes noop
                a.type = "noop"
                a.length = 0
                a.text = ""
                a.position = b_start
                return a
            else: # a starts inside b, extends beyond
                # a=[4,10), b=[2,6) => a' = [2, 10-4?) need calc: new_start = b_start, new_end = a_end - b.length
                overlap = b_end - a_start
                a.position = b_start
                a.length -= overlap
                return a

    return a


def transform_cursor(position: int, op: Operation) -> int:
    """Transform a cursor position against an operation."""
    if op.type == "noop" or op.is_noop():
        return position
    if op.type == "insert":
        if position >= op.position:
            return position + len(op.text)
        return position
    elif op.type == "delete":
        if position <= op.position:
            return position
        elif position >= op.position + op.length:
            return position - op.length
        else:
            return op.position
    return position


def transform_operation_against_history(op: Operation, history: list[Operation], from_revision: int) -> Operation:
    """Transform op against all ops in history[from_revision:]"""
    cur = op.clone()
    for h_op in history[from_revision:]:
        cur = transform(cur, h_op)
        if cur.is_noop():
            break
    return cur
