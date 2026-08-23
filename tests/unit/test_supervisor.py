"""TDD for supervisor — oscillation / stagnation / flat + LLM fallback, free-only."""
import asyncio
from unittest.mock import MagicMock, patch, AsyncMock
import pytest
from src.agents.supervisor import Supervisor
from src.utils.fingerprint import is_oscillating
from src.utils.model_manager import _estimate_cost


def _lineage(scores=None, fprints=None, stag=0):
    # helper to build lineage_last_5 list of dicts
    lineage=[]
    n=max(len(scores) if scores else 0, len(fprints) if fprints else 0, 1 if stag else 0)
    # if not provided, build 5 entries with defaults
    if scores is None: scores=[0.5,0.55,0.6,0.65,0.7]
    if fprints is None: fprints=[f"fp{i}" for i in range(5)]
    # pad to 5
    while len(scores)<5: scores.append(scores[-1])
    while len(fprints)<5: fprints.append(fprints[-1])
    for i in range(5):
        lineage.append({"fingerprint":fprints[i],"score":scores[i],"stagnation_streak": stag if i==4 else 0})
    return lineage


def test_no_intervene_when_stable():
    sup=Supervisor()
    lineage=_lineage(scores=[0.5,0.6,0.7,0.8,0.9], fprints=["a","b","c","d","e"], stag=0)
    # ensure not flat, not oscill, not stag
    with patch("src.agents.supervisor.get_llm", side_effect=Exception("should not call")) , patch("src.agents.supervisor.get_fallback_llm", side_effect=Exception("should not call")):
        r=sup.should_intervene(lineage)
    assert r["intervene"] is False
    assert r["hint"]=="" and r["new_plan"]==""

def test_intervene_oscillating():
    sup=Supervisor()
    # duplicate fps -> is_oscillating true
    lineage=_lineage(fprints=["a","b","a","b","a"], scores=[0.5,0.6,0.7,0.8,0.9], stag=0)
    # mock LLM to avoid real call, return heuristic via fallback check
    mock_llm=MagicMock()
    mock_llm.invoke.return_value=MagicMock(content="oscillation plan")
    with patch("src.agents.supervisor.get_llm", return_value=mock_llm), patch("src.agents.supervisor.get_fallback_llm", return_value=mock_llm):
        r=sup.should_intervene(lineage)
    assert r["intervene"] is True
    assert "hint" in r and "new_plan" in r
    assert r["hint"]!="" and r["new_plan"]!=""

def test_intervene_stagnation():
    sup=Supervisor()
    lineage=_lineage(scores=[0.5,0.6,0.7,0.8,0.9], fprints=["a","b","c","d","e"], stag=3)
    mock_llm=MagicMock()
    mock_llm.invoke.return_value=MagicMock(content="stagnation new angle")
    with patch("src.agents.supervisor.get_llm", return_value=mock_llm), patch("src.agents.supervisor.get_fallback_llm", return_value=mock_llm):
        r=sup.should_intervene(lineage)
    assert r["intervene"] is True
    assert r["hint"]!=""


def test_intervene_flat_scores():
    sup=Supervisor()
    # last 3 scores flat <0.02 delta
    lineage=_lineage(scores=[0.5,0.6,0.70,0.701,0.702], fprints=["a","b","c","d","e"], stag=0)
    # delta 0.002 so flat
    mock_llm=MagicMock()
    mock_llm.invoke.return_value=MagicMock(content="flat plan")
    with patch("src.agents.supervisor.get_llm", return_value=mock_llm), patch("src.agents.supervisor.get_fallback_llm", return_value=mock_llm):
        r=sup.should_intervene(lineage)
    assert r["intervene"] is True

def test_not_flat_when_delta_large():
    sup=Supervisor()
    lineage=_lineage(scores=[0.5,0.6,0.7,0.8,0.9], fprints=["a","b","c","d","e"], stag=0)
    # delta 0.1 not flat, not oscill, not stag -> no intervene (already tested but explicit)
    # but force flat false
    r=sup._flat([0.5,0.6,0.9])
    assert r is False
    r2=sup._flat([0.70,0.701,0.702])
    assert r2 is True

def test_is_oscillating_from_fingerprint():
    assert is_oscillating(["a","b","a","b","a"]) is True
    assert is_oscillating(["a","b","c","d","e"]) is False
    # also test via supervisor import
    from src.agents.supervisor import is_oscillating as sup_iso
    assert sup_iso(["x","x"]) is True

def test_intervene_calls_llm_powerful():
    sup=Supervisor()
    lineage=_lineage(stag=3)
    mock_llm=MagicMock()
    mock_llm.invoke.return_value=MagicMock(content="new powerful plan")
    with patch("src.agents.supervisor.get_llm") as m_get_llm, patch("src.agents.supervisor.get_fallback_llm") as m_fb:
        m_get_llm.return_value=mock_llm
        m_fb.return_value=mock_llm
        r=sup.should_intervene(lineage)
        # either get_llm or get_fallback_llm called with "powerful"
        called = False
        if m_get_llm.called:
            assert m_get_llm.call_args[0][0]=="powerful"
            called=True
        if m_fb.called:
            # if get_llm not used, fallback should be
            pass
        assert mock_llm.invoke.called
        assert r["new_plan"]!=""
        assert "LLM suggestion" in r["hint"] or "new powerful" in r["hint"] or r["hint"]!=""

def test_fallback_heuristic_when_llm_fails():
    sup=Supervisor()
    lineage=_lineage(stag=5)
    with patch("src.agents.supervisor.get_llm", side_effect=Exception("llm down")), patch("src.agents.supervisor.get_fallback_llm", side_effect=Exception("llm down")):
        r=sup.should_intervene(lineage)
    assert r["intervene"] is True
    # graceful fallback heuristic
    assert "Heuristic" in r["hint"] or "heuristic" in r["hint"].lower()
    assert r["new_plan"]!=""

def test_fallback_no_llm_module():
    # simulate no LLM available -> heuristic
    sup=Supervisor()
    lineage=_lineage(fprints=["a","a","a","a","a"])
    with patch("src.agents.supervisor.get_llm", None), patch("src.agents.supervisor.get_fallback_llm", None):
        r=sup.should_intervene(lineage)
        assert r["intervene"] is True
        assert r["hint"]!=""

def test_rate_limiter_20_rpm_guard():
    sup=Supervisor()
    assert sup.rate_limiter is not None
    # RateLimiter should be 20 RPM per spec
    assert sup.rate_limiter.rate==20 or sup.rate_limiter.rate_limit==20
    # source guard
    txt=open("src/agents/supervisor.py").read()
    assert "RateLimiter" in txt
    assert "20" in txt  # 20 RPM
    assert "per=60" in txt or "per=60.0" in txt

def test_cost_tracker_zero():
    # ox-alpha free cost 0
    assert _estimate_cost("stealth/ox-alpha:free",1000,1000)==0.0
    txt=open("src/agents/supervisor.py").read()
    assert "_estimate_cost" in txt
    assert "stealth/ox-alpha:free" in txt
    assert "TOKEN_STATS" in txt

def test_safe_env_usage():
    txt=open("src/agents/supervisor.py").read()
    assert "get_safe_env" in txt
    # ensure safe_env not leaking secrets via allowlist
    from src.utils.safe_env import get_safe_env
    env=get_safe_env()
    for k in env:
        assert "API_KEY" not in k and "SECRET" not in k

def test_no_new_deps():
    txt=open("src/agents/supervisor.py").read()
    for bad in ["import httpx","import requests","import tavily"]:
        assert bad not in txt
    assert "from src.utils.fingerprint import is_oscillating" in txt or "is_oscillating" in txt
    assert 'get_llm("powerful")' in txt or "get_llm" in txt and '"powerful"' in txt or "'powerful'" in txt

def test_lineage_empty_no_intervene():
    sup=Supervisor()
    assert sup.should_intervene([])=={"intervene":False,"hint":"","new_plan":""}
    assert sup.should_intervene(None)=={"intervene":False,"hint":"","new_plan":""}  # type: ignore

def test_supervisor_file_exists_and_line_count():
    import pathlib
    p=pathlib.Path("src/agents/supervisor.py")
    assert p.exists()
    lines=p.read_text().splitlines()
    assert 80 <= len(lines) <= 140, f"~110 lines expected, got {len(lines)}"

def test_mocked_async_llm():
    sup=Supervisor()
    lineage=_lineage(stag=3)
    mock_llm=MagicMock()
    # only ainvoke, no invoke
    del mock_llm.invoke
    mock_llm.ainvoke=AsyncMock(return_value=MagicMock(content="async plan"))
    with patch("src.agents.supervisor.get_llm", return_value=mock_llm), patch("src.agents.supervisor.get_fallback_llm", return_value=mock_llm):
        r=sup.should_intervene(lineage)
        assert r["intervene"] is True
        # our sync wrapper will try invoke first, fail to fallback? but we deleted invoke, so it goes to ainvoke via asyncio.run
        # if loop running, fallback heuristic; but in test no loop running, should succeed
        assert r["new_plan"]!=""
