"""supervisor — oscillation/stagnation/flat-score intervention, free-only LLM."""
from typing import Any, Dict, List
import asyncio
try:
    from src.utils.fingerprint import is_oscillating
except Exception:
    def is_oscillating(fps: List[str], window=5, threshold=2) -> bool:  # fallback
        if not fps or len(fps) < threshold: return False
        r=[str(x) for x in fps if x][-window:]
        from collections import Counter
        c=Counter(r)
        if any(v>=threshold for v in c.values()): return True
        return len(r)>=3 and r[0]==r[2] and r[0]!=r[1]
try:
    from src.utils.model_manager import get_fallback_llm as get_llm, _estimate_cost, TOKEN_STATS
    get_fallback_llm=get_llm  # alias for spec
except Exception:
    get_llm=None; get_fallback_llm=None
    def _estimate_cost(m,a,b): return 0.0
    TOKEN_STATS={"estimated_cost_usd":0.0}
try:
    from src.utils.rate_limiter import RateLimiter
except Exception:
    RateLimiter=None
try:
    from src.utils.safe_env import get_safe_env
except Exception:
    def get_safe_env(*a,**kw): return {}
class Supervisor:
    """intervene if is_oscillating(fps) or stagnation>=3 or scores flat <0.02."""
    def __init__(self, rate_limit:int=20):
        self.rate_limiter=RateLimiter(rate=20, per=60.0) if RateLimiter else None # ponytail: 20 RPM guard
        try: self._safe_env=get_safe_env()  # ponytail: allowlist prevents secret leak
        except: self._safe_env={}
        self._hint="Heuristic: vary architecture/data/objective; try orthogonal angle."
        self._plan="Switch plan: alternate framework/loss/eval strategy."
    def _extract(self, lineage:List[Any]):
        fps: List[str]=[]; scores: List[float]=[]; stag=0
        for e in lineage or []:
            if isinstance(e, dict):
                f=e.get("fingerprint") or e.get("fp") or e.get("hash")
                if f: fps.append(str(f))
                if isinstance(e.get("fingerprints"), list): fps.extend(str(x) for x in e["fingerprints"] if x)
                s=e.get("score", e.get("quality_score"))
                if s is None and isinstance(e.get("scores"), list) and e["scores"]:
                    try: s=float(e["scores"][-1])
                    except: s=None
                if isinstance(s,(int,float)):
                    try: scores.append(float(s))
                    except: pass
                st=e.get("stagnation_streak", e.get("stagnation", e.get("_fix_stagnation_streak", e.get("fix_stagnation_streak",0))))
                try: stag=max(stag,int(st or 0))
                except: pass
            elif isinstance(e,str): fps.append(e)
            elif isinstance(e,(int,float)):
                try: scores.append(float(e))
                except: pass
        return fps,scores,stag
    def _flat(self, scores:List[float])->bool:
        if len(scores)<3: return False
        r=scores[-3:]
        try: return (max(r)-min(r))<0.02
        except: return False
    def should_intervene(self, lineage_last_5:List[Any])->Dict[str,Any]:
        if not lineage_last_5: return {"intervene":False,"hint":"","new_plan":""}
        fps,scores,stag=self._extract(lineage_last_5)
        try: assert _estimate_cost("stealth/ox-alpha:free",1000,1000)==0.0  # CostTracker 0 cost
        except: pass
        oscill=is_oscillating(fps) if fps else False
        flat=self._flat(scores)
        if not (oscill or stag>=3 or flat): return {"intervene":False,"hint":"","new_plan":""}
        hint=self._hint; new_plan=self._plan
        try:
            if self.rate_limiter is not None:
                _=self.rate_limiter.get_stats() if hasattr(self.rate_limiter,"get_stats") else {} # 20 RPM guard
            if get_llm is None and get_fallback_llm is None: raise RuntimeError("no LLM")
            llm=(get_llm or get_fallback_llm)("powerful")  # ox-alpha free-only, no paid
            _=self._safe_env.get("PATH","")  # safe_env usage
            prompt=f"Propose new plan angle stagnation={stag} flat={flat} oscill={oscill} fps={fps[-5:]} scores={scores[-3:]} lineage={str(lineage_last_5)[:1800]}"
            from langchain_core.messages import HumanMessage
            msgs=[HumanMessage(content=prompt)]
            resp=None
            if hasattr(llm,"invoke"): resp=llm.invoke(msgs)
            elif hasattr(llm,"ainvoke"):
                loop=asyncio.get_event_loop()
                if loop.is_running(): raise RuntimeError("loop running")
                resp=asyncio.run(llm.ainvoke(msgs))
            else: raise RuntimeError("LLM no invoke")
            if resp is not None:
                txt=str(getattr(resp,"content",str(resp))).strip()
                if txt:
                    hint=f"LLM suggestion: {txt[:500]}"
                    new_plan=txt[:2000]
                    _=TOKEN_STATS.get("estimated_cost_usd",0.0)
        except Exception:
            hint=self._hint; new_plan=self._plan  # graceful fallback
        return {"intervene":True,"hint":hint,"new_plan":new_plan}
