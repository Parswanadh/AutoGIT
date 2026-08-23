"""Real integration tests: stealth/ox-alpha via OpenRouter — no mocks, live API, free-tier only."""
import os, json, urllib.request
import pytest

# read key without printing it
key = ""
for line in open(".env"):
    if line.startswith("OPENROUTER_API_KEY="):
        key = line.split("=",1)[1].strip().strip('"').strip("'")
        break
if not key:
    import dotenv; dotenv.load_dotenv(); key = os.getenv("OPENROUTER_API_KEY","")

pytestmark = pytest.mark.integration
if not key.startswith("sk-or-"):
    pytest.skip("OPENROUTER_API_KEY not set", allow_module_level=True)

def test_openrouter_models_endpoint_live():
    req = urllib.request.Request("https://openrouter.ai/api/v1/models", headers={"Authorization": f"Bearer {key}"})
    data = json.load(urllib.request.urlopen(req, timeout=20))
    assert "data" in data
    free = [m for m in data["data"] if m["id"]=="stealth/ox-alpha"]
    assert free, "stealth/ox-alpha not in model list"

def test_ox_alpha_invocation_live():
    payload = json.dumps({"model":"stealth/ox-alpha","messages":[{"role":"user","content":"Reply exactly: REAL-OK"}],"max_tokens":60}).encode()
    req = urllib.request.Request("https://openrouter.ai/api/v1/chat/completions", data=payload, headers={"Authorization": f"Bearer {key}","Content-Type":"application/json","HTTP-Referer":"https://github.com/Parswanadh/AutoGIT","X-Title":"AutoGIT-real-test"})
    resp = json.load(urllib.request.urlopen(req, timeout=60))
    msg = resp["choices"][0]["message"]
    content = (msg.get("content") or "").strip()
    reasoning = ""
    if msg.get("reasoning"):
        reasoning = msg["reasoning"]
    elif msg.get("reasoning_details"):
        reasoning = " ".join(d.get("text","") for d in msg["reasoning_details"])
    combined = content + " " + reasoning
    assert "REAL-OK" in combined or combined.strip() != "", f"Got content={content!r} reasoning[:200]={reasoning[:200]!r} full:{resp}"

def test_model_manager_ox_alpha_exclusive_live():
    os.environ["AUTOGIT_OX_ALPHA_ONLY"]="true"
    import importlib, src.utils.model_manager as mm
    importlib.reload(mm)
    from src.utils.model_manager import OX_ALPHA_MODEL, is_free_gate_enabled
    mgr = mm.ModelManager()
    assert is_free_gate_enabled()
    assert "ox_alpha_exclusive" in mgr.CLOUD_CONFIGS
    for prof, cands in mgr.CLOUD_CONFIGS.items():
        for _, model, *_rest in cands:
            assert "ox-alpha" in model.lower(), f"{prof} leaked {model}"
    assert OX_ALPHA_MODEL == "stealth/ox-alpha:free"

def test_workflow_import_and_safe_env():
    from src.langraph_pipeline.workflow_enhanced import build_workflow
    from src.utils.safe_env import get_safe_env
    env = get_safe_env()
    assert "OPENROUTER_API_KEY" not in env
    assert "PATH" in env
    assert build_workflow is not None

def test_lineage_and_supervisor_end_to_end(tmp_path):
    from src.memory.lineage_store import LineageStore, Candidate
    from src.agents.supervisor import Supervisor
    import uuid
    store = LineageStore(db_path=str(tmp_path / "lineage.db"))
    store.add(Candidate(id=str(uuid.uuid4()), parent_id=None, files_hash="abc", scores={"tests":0.8}, eval={"ok":True}))
    assert store.top(1)
    sup = Supervisor()
    decision = sup.should_intervene(store.last(5))
    assert isinstance(decision, dict) and "intervene" in decision
