"""lineage_store — sqlite candidate lineage for AVO (stdlib only)."""
import hashlib, json, sqlite3, time
from dataclasses import dataclass, field
from pathlib import Path
from typing import Dict, List, Optional

try:
    from src.utils.artifact_cache import compute_fp as _compute_fp  # type: ignore
except ImportError:
    _compute_fp = None  # type: ignore

def _files_hash(files: Optional[Dict[str, str]], mode: str = "full") -> str:
    """hash files dict; prefers artifact_cache.compute_fp if available."""
    if not files:
        return ""
    if _compute_fp is not None:
        try: return _compute_fp(files, mode=mode)  # type: ignore
        except TypeError:
            try: return _compute_fp(files)  # type: ignore
            except Exception: pass
        except Exception: pass
    h = hashlib.sha256()
    for k in sorted(files):
        h.update(k.encode()); h.update(b"\x00")
        h.update(str(files[k]).replace("\r\n","\n").replace("\r","\n").encode()); h.update(b"\x00")
    return h.hexdigest()

# public alias for callers that need files_hash
compute_files_hash = _files_hash

def _total(s: Dict) -> float:
    if not isinstance(s, dict):
        return 0.0
    return float(s.get("tests",0) or 0)+float(s.get("feature",0) or 0)+float(s.get("quality",0) or 0)

@dataclass
class Candidate:
    id: str
    parent_id: Optional[str] = None
    files_hash: str = ""
    scores: Dict = field(default_factory=dict)  # {tests, feature, quality}
    eval: Dict = field(default_factory=dict)
    created_at: float = field(default_factory=time.time)

def _row(r) -> Candidate:
    return Candidate(id=r[0], parent_id=r[1], files_hash=r[2], scores=json.loads(r[3]) if r[3] else {}, eval=json.loads(r[4]) if r[4] else {}, created_at=float(r[5] or 0))

class LineageStore:
    """table lineage(id,parent_id,files_hash,scores,eval,created_at)"""
    def __init__(self, db_path: str = "data/lineage.db"):
        self.db_path = str(db_path)
        self._mem = None
        if self.db_path == ":memory:":
            self._mem = sqlite3.connect(":memory:", timeout=30.0, check_same_thread=False)
        else:
            Path(self.db_path).parent.mkdir(parents=True, exist_ok=True)
        self._init()
    def _connect(self):
        if self._mem is not None:
            return self._mem
        c = sqlite3.connect(self.db_path, timeout=30.0, check_same_thread=False)
        try: c.execute("PRAGMA journal_mode=WAL;")
        except sqlite3.Error: pass
        try: c.execute("PRAGMA busy_timeout=30000;")
        except sqlite3.Error: pass
        return c
    def _init(self):
        with self._connect() as c:
            c.execute("CREATE TABLE IF NOT EXISTS lineage (id TEXT PRIMARY KEY, parent_id TEXT, files_hash TEXT, scores TEXT, eval TEXT, created_at REAL)")
            c.commit()
    def add(self, candidate: Candidate) -> None:
        with self._connect() as c:
            c.execute("INSERT OR REPLACE INTO lineage VALUES (?,?,?,?,?,?)",
                (candidate.id, candidate.parent_id, candidate.files_hash, json.dumps(candidate.scores or {}), json.dumps(candidate.eval or {}), float(candidate.created_at)))
            c.commit()
    def top(self, k: int = 5) -> List[Candidate]:
        with self._connect() as c: rows=c.execute("SELECT id,parent_id,files_hash,scores,eval,created_at FROM lineage").fetchall()
        cands=[_row(r) for r in rows]; cands.sort(key=lambda x: (_total(x.scores), x.created_at), reverse=True); return cands[:k]
    def last(self, n: int = 5) -> List[Candidate]:
        with self._connect() as c: rows=c.execute("SELECT id,parent_id,files_hash,scores,eval,created_at FROM lineage ORDER BY created_at DESC LIMIT ?", (n,)).fetchall()
        return [_row(r) for r in rows]
    def prune(self, limit: int = 200) -> int:
        with self._connect() as c: rows=c.execute("SELECT id,scores,created_at FROM lineage").fetchall()
        if len(rows) <= limit: return 0
        scored=[(r[0], _total(json.loads(r[1]) if r[1] else "{}"), float(r[2] or 0)) for r in rows]
        scored.sort(key=lambda x: (x[1], x[2]), reverse=True); keep={s[0] for s in scored[:limit]}
        with self._connect() as c:
            cur=c.execute(f"SELECT id FROM lineage WHERE id NOT IN ({','.join('?'*len(keep))})", tuple(keep))
            todel=[r[0] for r in cur.fetchall()]
            if todel: c.execute(f"DELETE FROM lineage WHERE id IN ({','.join('?'*len(todel))})", tuple(todel)); c.commit()
            return len(todel)
# ponytail: prune keeps best 200 by sum(tests+feature+quality); per-parent pruning if throughput matters
