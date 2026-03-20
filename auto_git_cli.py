#!/usr/bin/env python3
"""
AUTO-GIT CLI - Professional Research-to-Code-to-GitHub Pipeline
Author: Auto-GIT Team
License: MIT
"""

import typer
import os
from typing import Optional
from rich.console import Console
from rich.panel import Panel
from rich.prompt import Prompt, Confirm
from rich.table import Table
from rich import box
import asyncio

app = typer.Typer(
    name="auto-git",
    help="🚀 Autonomous Research-to-GitHub Pipeline powered by LangGraph",
    add_completion=False
)
console = Console()


def _upsert_env_var(env_path: str, key: str, value: str) -> None:
    """Insert or update a key=value pair in a .env file."""
    import os
    lines: list[str] = []
    if os.path.exists(env_path):
        with open(env_path, "r") as f:
            lines = f.readlines()

    found = False
    new_lines: list[str] = []
    for line in lines:
        stripped = line.strip()
        if stripped.startswith(f"{key}=") or stripped.startswith(f"{key} ="):
            new_lines.append(f"{key}={value}\n")
            found = True
        else:
            new_lines.append(line)

    if not found:
        if new_lines and not new_lines[-1].endswith("\n"):
            new_lines.append("\n")
        new_lines.append(f"{key}={value}\n")

    with open(env_path, "w") as f:
        f.writelines(new_lines)


def _extract_checkpoint_state(raw_checkpoint: object) -> dict:
    """Best-effort checkpoint payload extraction across saver backends."""
    if isinstance(raw_checkpoint, dict):
        return raw_checkpoint
    if raw_checkpoint is None:
        return {}

    # LangGraph checkpoint tuples often expose checkpoint/channel_values attrs.
    for attr in ("checkpoint", "channel_values", "values"):
        value = getattr(raw_checkpoint, attr, None)
        if isinstance(value, dict):
            return value

    if hasattr(raw_checkpoint, "_asdict"):
        try:
            data = raw_checkpoint._asdict()  # type: ignore[attr-defined]
            if isinstance(data, dict):
                return data
        except Exception:
            return {}
    return {}


def _pipeline_stage_order() -> list[str]:
    return [
        "initialized",
        "requirements_extracted",
        "research_complete",
        "perspectives_generated",
        "problems_extracted",
        "solutions_generated",
        "critiques_complete",
        "solution_selected",
        "architect_spec_complete",
        "code_generated",
        "testing_complete",
        "feature_verification_complete",
        "code_fixed",
        "smoke_test_passed",
        "self_eval_approved",
        "goal_eval_approved",
        "published",
    ]


def _build_checkpoint_diagnostics(state: dict) -> dict:
    """Build replay diagnostics including resumability and stage progression hints."""
    stage = str(state.get("current_stage", "unknown"))
    node_calls = state.get("_node_exec_frequency", {}) if isinstance(state.get("_node_exec_frequency"), dict) else {}
    top_node = ""
    if node_calls:
        top_node = sorted(node_calls.items(), key=lambda kv: kv[1], reverse=True)[0][0]

    required_keys = [
        "current_stage",
        "errors",
        "warnings",
        "_node_exec_frequency",
        "_loop_detection_state",
    ]
    missing_keys = [k for k in required_keys if k not in state]

    order = _pipeline_stage_order()
    if stage in order:
        idx = order.index(stage)
        next_stages = order[idx + 1: idx + 4]
    else:
        next_stages = order[:3]

    resumable = len(missing_keys) == 0 and stage not in {"unknown", ""}

    return {
        "stage": stage,
        "loop_state": str(state.get("_loop_detection_state", "clean")),
        "top_node": top_node or "N/A",
        "node_count": len(node_calls),
        "missing_keys": missing_keys,
        "resumable": resumable,
        "next_stages": next_stages,
    }


def _normalize_telemetry_parity_mode(mode: str) -> str:
    """Normalize telemetry parity mode to warn|strict with safe fallback."""
    normalized = str(mode or "warn").strip().lower()
    if normalized not in {"warn", "strict"}:
        return "warn"
    return normalized


def _normalize_trust_mode(mode: str) -> str:
    """Normalize trust mode to trusted|constrained|untrusted with safe fallback."""
    normalized = str(mode or "trusted").strip().lower()
    if normalized not in {"trusted", "constrained", "untrusted"}:
        return "trusted"
    return normalized


def _normalize_allowlist_mode(mode: str) -> str:
    """Normalize allowlist mode to permissive|strict with safe fallback."""
    normalized = str(mode or "permissive").strip().lower()
    if normalized not in {"permissive", "strict"}:
        return "permissive"
    return normalized


def _normalize_failover_profile(profile: str) -> str:
    """Normalize failover profile to supported values with safe fallback."""
    normalized = str(profile or "balanced").strip().lower()
    if normalized not in {"balanced", "resilient", "cost_saver"}:
        return "balanced"
    return normalized


def _normalize_hitl_decision(value: str) -> str:
    """Normalize HITL decision input for high-risk nodes."""
    normalized = str(value or "pending").strip().lower()
    if normalized in {"approve", "edit", "reject", "pending"}:
        return normalized
    return "pending"


def _resolve_hitl_decisions(trust_mode: str, hitl_git_publishing: str, hitl_interactive: bool) -> dict:
    """Resolve per-node HITL decisions from CLI flags and optional interactive prompts."""
    resolved = _normalize_hitl_decision(hitl_git_publishing)
    trust = _normalize_trust_mode(trust_mode)

    if hitl_interactive and trust in {"constrained", "untrusted"} and resolved == "pending":
        decision = Prompt.ask(
            "HITL decision for git_publishing",
            choices=["approve", "edit", "reject"],
            default="reject",
        )
        resolved = _normalize_hitl_decision(decision)

    if resolved == "pending":
        return {}
    return {"git_publishing": resolved}


def _apply_cloud_only_mode(cloud_only: bool) -> None:
    """Apply cloud-only runtime switches for this process execution."""
    if not cloud_only:
        return
    os.environ["AUTOGIT_DISABLE_LOCAL_MODELS"] = "true"
    os.environ["PERPLEXICA_ENABLED"] = "false"
    console.print("[cyan]☁️  Cloud-only mode enabled (local models + Perplexica disabled for this run).[/cyan]")

# ASCII Art Logo
LOGO = r"""
   ___         __           _______ ______
  / _ | __ __ / /_ ___     / ___/  /  ___/
 / __ |/ // // __// _ \   / (_ / / / /    
/_/ |_|\_,_/ \__/ \___/   \___//_/ /_/     
                                           
 Autonomous Research → Code → GitHub Pipeline
 Powered by LangGraph | Built with ❤️
"""

def show_banner():
    """Display the Auto-GIT banner"""
    console.print(Panel(
        LOGO,
        style="bold cyan",
        border_style="bright_blue",
        box=box.DOUBLE
    ))


def show_main_menu():
    """Display the main menu options"""
    table = Table(
        title="🎯 Available Commands",
        show_header=True,
        header_style="bold magenta",
        border_style="cyan",
        box=box.ROUNDED
    )
    
    table.add_column("Command", style="cyan", width=20)
    table.add_column("Description", style="white")
    table.add_column("Status", style="green")
    
    table.add_row(
        "generate",
        "Generate code from research idea or paper",
        "✅ Ready"
    )
    table.add_row(
        "research",
        "Research-only mode (no code generation)",
        "✅ Ready"
    )
    table.add_row(
        "debate",
        "Run multi-perspective debate on idea",
        "✅ Ready"
    )
    table.add_row(
        "publish",
        "Publish existing code to GitHub",
        "🚧 Beta"
    )
    table.add_row(
        "status",
        "Check system health & configuration",
        "✅ Ready"
    )
    table.add_row(
        "config",
        "Configure API keys and settings",
        "✅ Ready"
    )
    
    console.print(table)
    console.print("\n💡 [dim]Use --help with any command for more options[/dim]\n")


@app.command()
def menu():
    """
    🎮 Interactive menu mode - browse all features
    """
    show_banner()
    show_main_menu()


@app.command()
def generate(
    idea: str = typer.Argument(..., help="Research idea or arXiv paper ID"),
    output_dir: Optional[str] = typer.Option(None, "--output", "-o", help="Output directory for generated code"),
    github: bool = typer.Option(False, "--github", "-g", help="Automatically publish to GitHub"),
    max_rounds: int = typer.Option(2, "--rounds", "-r", help="Maximum debate rounds"),
    web_search: bool = typer.Option(True, "--search/--no-search", help="Enable web search"),
    checkpointer_provider: str = typer.Option("sqlite", "--checkpointer", help="Checkpoint provider: sqlite|memory|local|redis"),
    trust_mode: str = typer.Option("trusted", "--trust-mode", help="Execution trust mode: trusted|constrained|untrusted"),
    allowlist_mode: str = typer.Option("permissive", "--allowlist-mode", help="Tool allowlist mode: permissive|strict"),
    model_failover_profile: str = typer.Option("balanced", "--failover-profile", help="Model failover profile"),
    telemetry_parity_mode: str = typer.Option("warn", "--telemetry-parity-mode", help="Telemetry parity policy: warn|strict"),
    hitl_git_publishing: str = typer.Option("pending", "--hitl-git-publishing", help="HITL decision for git publishing: approve|edit|reject|pending"),
    hitl_interactive: bool = typer.Option(False, "--hitl-interactive", help="Prompt for HITL decisions in constrained/untrusted modes"),
    cloud_only: bool = typer.Option(False, "--cloud-only", help="Disable local models and run with cloud providers only"),
):
    """
    🚀 Generate code from research idea using LangGraph pipeline
    
    This runs the full pipeline:
    1. Research (arXiv + web search)
    2. Problem extraction
    3. Multi-perspective debate
    4. Solution selection
    5. Code generation (DeepSeek Coder)
    6. GitHub publishing (if --github flag)
    
    Example:
        auto-git generate "Efficient transformer attention for long sequences"
        auto-git generate "2301.12345" --github
    """
    show_banner()
    
    console.print(f"\n[bold green]🚀 Starting Auto-GIT Pipeline[/bold green]")
    console.print(f"[cyan]Research Idea:[/cyan] {idea}")
    console.print(f"[cyan]Max Debate Rounds:[/cyan] {max_rounds}")
    console.print(f"[cyan]Web Search:[/cyan] {'✅ Enabled' if web_search else '❌ Disabled'}")
    console.print(f"[cyan]Auto-Publish:[/cyan] {'✅ Yes' if github else '❌ No'}\n")
    
    if not Confirm.ask("🤔 Ready to start?", default=True):
        console.print("[yellow]Pipeline cancelled[/yellow]")
        raise typer.Exit()

    _apply_cloud_only_mode(cloud_only)
    
    # Run the pipeline
    from src.langraph_pipeline.workflow_enhanced import run_auto_git_pipeline
    
    parity_mode = _normalize_telemetry_parity_mode(telemetry_parity_mode)
    normalized_trust_mode = _normalize_trust_mode(trust_mode)
    normalized_allowlist_mode = _normalize_allowlist_mode(allowlist_mode)
    normalized_failover_profile = _normalize_failover_profile(model_failover_profile)
    normalized_hitl_publish = _normalize_hitl_decision(hitl_git_publishing)
    hitl_decisions = _resolve_hitl_decisions(
        trust_mode=normalized_trust_mode,
        hitl_git_publishing=normalized_hitl_publish,
        hitl_interactive=hitl_interactive,
    )

    if parity_mode != str(telemetry_parity_mode or "warn").strip().lower():
        console.print("[yellow]⚠️  Invalid telemetry parity mode provided; using 'warn'.[/yellow]")
    if normalized_trust_mode != str(trust_mode or "trusted").strip().lower():
        console.print("[yellow]⚠️  Invalid trust mode provided; using 'trusted'.[/yellow]")
    if normalized_allowlist_mode != str(allowlist_mode or "permissive").strip().lower():
        console.print("[yellow]⚠️  Invalid allowlist mode provided; using 'permissive'.[/yellow]")
    if normalized_failover_profile != str(model_failover_profile or "balanced").strip().lower():
        console.print("[yellow]⚠️  Invalid failover profile provided; using 'balanced'.[/yellow]")
    if normalized_hitl_publish != str(hitl_git_publishing or "pending").strip().lower():
        console.print("[yellow]⚠️  Invalid HITL decision provided; using 'pending'.[/yellow]")

    try:
        console.print("\n[bold cyan]⚙️  Initializing LangGraph workflow...[/bold cyan]\n")
        
        result = asyncio.run(run_auto_git_pipeline(
            idea=idea,
            max_debate_rounds=max_rounds,
            use_web_search=web_search,
            auto_publish=github,
            output_dir=output_dir,
            checkpointer_provider=checkpointer_provider,
            trust_mode=normalized_trust_mode,
            tool_allowlist_mode=normalized_allowlist_mode,
            model_failover_profile=normalized_failover_profile,
            telemetry_parity_mode=parity_mode,
            hitl_decisions=hitl_decisions,
        ))
        
        # Display results
        console.print("\n" + "="*80)
        console.print(Panel(
            "[bold green]✅ Pipeline Completed Successfully![/bold green]",
            style="green",
            border_style="bright_green"
        ))
        
        # Show final solution
        if result.get("final_solution"):
            console.print(f"\n[bold cyan]🏆 Selected Solution:[/bold cyan]")
            console.print(f"  [green]{result['final_solution'].get('approach_name', 'N/A')}[/green]")
        
        # Show GitHub URL if published
        if result.get("github_url"):
            console.print(f"\n[bold cyan]📦 GitHub Repository:[/bold cyan]")
            console.print(f"  [link={result['github_url']}]{result['github_url']}[/link]")
        
        console.print("\n" + "="*80 + "\n")
        
    except KeyboardInterrupt:
        console.print("\n[yellow]⚠️  Pipeline interrupted by user[/yellow]")
        raise typer.Exit(1)
    except Exception as e:
        console.print(f"\n[bold red]❌ Pipeline failed: {e}[/bold red]")
        raise typer.Exit(1)


@app.command()
def research(
    idea: str = typer.Argument(..., help="Research topic or question"),
    max_results: int = typer.Option(5, "--max", "-m", help="Maximum papers to find"),
):
    """
    🔍 Research-only mode - find papers and implementations
    
    Searches arXiv and GitHub without code generation.
    """
    show_banner()
    console.print(f"\n[bold cyan]🔍 Searching for:[/bold cyan] {idea}\n")
    
    from src.utils.web_search import ResearchSearcher
    
    searcher = ResearchSearcher()
    result = searcher.search_comprehensive(idea)
    papers = result.get("papers", [])
    web_results = result.get("web_results", [])
    implementations = result.get("implementations", [])
    
    # Display papers
    if papers:
        console.print(Panel(f"[bold green]📚 Found {len(papers)} papers on arXiv[/bold green]", style="green"))
        for i, paper in enumerate(papers[:5], 1):
            console.print(f"\n{i}. [cyan]{paper['title']}[/cyan]")
            console.print(f"   [dim]{paper['authors']}[/dim]")
            console.print(f"   [link={paper['pdf_url']}]PDF Link[/link]")
    
    # Display implementations
    if implementations:
        console.print(f"\n[bold green]💻 Found {len(implementations)} implementations[/bold green]")
        for i, impl in enumerate(implementations[:3], 1):
            console.print(f"\n{i}. {impl.get('title', 'N/A')}")
            console.print(f"   [link={impl.get('href', '#')}]{impl.get('href', '#')}[/link]")
    
    console.print()


@app.command()
def debate(
    idea: str = typer.Argument(..., help="Research problem to debate"),
    rounds: int = typer.Option(2, "--rounds", "-r", help="Number of debate rounds"),
):
    """
    🗣️  Multi-perspective debate on research problem
    
    Runs the debate system with 3 expert perspectives:
    - ML Researcher
    - Systems Engineer
    - Applied Scientist
    """
    show_banner()
    console.print(f"\n[bold cyan]🗣️  Starting multi-perspective debate[/bold cyan]")
    console.print(f"[cyan]Topic:[/cyan] {idea}")
    console.print(f"[cyan]Rounds:[/cyan] {rounds}\n")
    
    from src.langraph_pipeline.workflow_enhanced import run_auto_git_pipeline
    
    try:
        result = asyncio.run(run_auto_git_pipeline(
            idea=idea,
            max_debate_rounds=rounds,
            use_web_search=True,
            stop_after="solution_selection"  # Don't generate code
        ))
        
        console.print("\n[bold green]✅ Debate complete![/bold green]\n")
    except KeyboardInterrupt:
        console.print("\n[yellow]⚠️  Debate interrupted by user[/yellow]")
        raise typer.Exit(1)
    except Exception as e:
        console.print(f"\n[bold red]❌ Debate failed: {e}[/bold red]")
        raise typer.Exit(1)


@app.command()
def status():
    """
    📊 Check system status and configuration
    
    Verifies:
    - Ollama connection
    - Available models
    - GitHub token
    - Directory structure
    """
    show_banner()
    
    console.print("[bold cyan]🔍 System Status Check[/bold cyan]\n")
    
    # Check Ollama
    console.print("[cyan]Checking Ollama...[/cyan]")
    try:
        import httpx
        response = httpx.get("http://localhost:11434/api/tags", timeout=5)
        if response.status_code == 200:
            models = response.json().get("models", [])
            console.print(f"  [green]✅ Ollama running ({len(models)} models available)[/green]")
            
            # Check for required models
            model_names = [m["name"] for m in models]
            required_models = ["qwen3:4b", "deepseek-coder-v2:16b"]
            for model in required_models:
                if any(model in name for name in model_names):
                    console.print(f"  [green]✅ {model} available[/green]")
                else:
                    console.print(f"  [yellow]⚠️  {model} not found[/yellow]")
        else:
            console.print("  [red]❌ Ollama not responding[/red]")
    except Exception as e:
        console.print(f"  [red]❌ Ollama connection failed: {e}[/red]")
    
    # Check GitHub token
    console.print("\n[cyan]Checking GitHub...[/cyan]")
    import os
    if os.getenv("GITHUB_TOKEN"):
        console.print("  [green]✅ GitHub token configured[/green]")
    else:
        console.print("  [yellow]⚠️  GitHub token not set (use: export GITHUB_TOKEN=...)[/yellow]")
    
    # Check directories
    console.print("\n[cyan]Checking directories...[/cyan]")
    dirs = ["src/langraph_pipeline", "src/utils", "output"]
    for dir_path in dirs:
        import os
        if os.path.exists(dir_path):
            console.print(f"  [green]✅ {dir_path}/[/green]")
        else:
            console.print(f"  [yellow]⚠️  {dir_path}/ missing[/yellow]")
    
    console.print("\n[bold green]System check complete![/bold green]\n")


@app.command()
def doctor(
    checkpointer: str = typer.Option("sqlite", "--checkpointer", help="Checkpoint provider: sqlite|memory|local|redis"),
    failover_profile: str = typer.Option("balanced", "--failover-profile", help="Model failover profile to validate"),
    thread_id: str = typer.Option("default", "--thread-id", help="Thread ID used for checkpoint resumability checks"),
):
    """
    🩺 Run operational diagnostics for environment, persistence, and runtime prerequisites.
    """
    show_banner()
    console.print("[bold cyan]🩺 Auto-GIT Doctor[/bold cyan]\n")

    rows = []

    # Python environment sanity
    import sys
    rows.append(("Python", "ok", sys.executable))

    # Logs dir write check
    import os
    os.makedirs("logs", exist_ok=True)
    probe = os.path.join("logs", ".doctor_write_probe")
    try:
        with open(probe, "w", encoding="utf-8") as f:
            f.write("ok")
        os.remove(probe)
        rows.append(("Logs directory", "ok", "Writable"))
    except Exception as e:
        rows.append(("Logs directory", "fail", str(e)))

    # API keys
    has_key = any(os.getenv(k) for k in ("OPENROUTER_API_KEY", "GROQ_API_KEY", "OPENAI_API_KEY"))
    rows.append(("LLM API keys", "ok" if has_key else "warn", "At least one key configured" if has_key else "No cloud key detected"))

    # Checkpointer provider health
    try:
        from src.langraph_pipeline.checkpointer_factory import create_checkpointer, load_existing_checkpoint

        bundle = create_checkpointer(provider=checkpointer, logs_dir="logs")
        rows.append(("Checkpointer", "ok", f"{bundle.provider} @ {bundle.location}"))

        config = {"configurable": {"thread_id": thread_id}}
        raw = load_existing_checkpoint(bundle.checkpointer, config)
        state = _extract_checkpoint_state(raw)
        if state:
            diagnostics = _build_checkpoint_diagnostics(state)
            if diagnostics["resumable"]:
                rows.append(("Checkpoint resume", "ok", f"thread={thread_id}, stage={diagnostics['stage']}"))
            else:
                rows.append((
                    "Checkpoint resume",
                    "warn",
                    f"thread={thread_id}, stage={diagnostics['stage']}, missing={','.join(diagnostics['missing_keys']) or 'none'}",
                ))
        else:
            rows.append(("Checkpoint resume", "warn", f"No checkpoint found for thread '{thread_id}'"))

        if getattr(bundle, "close", None):
            bundle.close()
    except Exception as e:
        rows.append(("Checkpointer", "fail", str(e)))

    # Model failover profile sanity
    try:
        from src.model_router.router import ModelRouter

        router = ModelRouter()
        chain = router.get_failover_chain(profile=failover_profile)
        if chain:
            rows.append(("Failover profile", "ok", f"{failover_profile}: {' -> '.join(chain[:4])}"))
        else:
            rows.append(("Failover profile", "warn", f"{failover_profile}: no available models in chain"))
    except Exception as e:
        rows.append(("Failover profile", "warn", f"Unavailable: {e}"))

    # Ollama check (optional)
    try:
        import httpx
        response = httpx.get("http://localhost:11434/api/tags", timeout=3)
        if response.status_code == 200:
            rows.append(("Ollama", "ok", "Service reachable"))
        else:
            rows.append(("Ollama", "warn", f"HTTP {response.status_code}"))
    except Exception as e:
        rows.append(("Ollama", "warn", f"Unavailable: {e}"))

    table = Table(title="Doctor Report", box=box.ROUNDED, border_style="cyan")
    table.add_column("Check", style="cyan", width=24)
    table.add_column("Status", width=10)
    table.add_column("Details", style="white")

    for check_name, status_name, details in rows:
        color = "green" if status_name == "ok" else ("yellow" if status_name == "warn" else "red")
        table.add_row(check_name, f"[{color}]{status_name.upper()}[/]", str(details))

    console.print(table)

    if any(status == "fail" for _, status, _ in rows):
        raise typer.Exit(1)


@app.command()
def replay(
    thread_id: str = typer.Option("default", "--thread-id", help="Thread ID used by pipeline checkpoints"),
    checkpointer: str = typer.Option("sqlite", "--checkpointer", help="Checkpoint provider: sqlite|memory|local|redis"),
    resume_run: bool = typer.Option(False, "--resume-run", help="Resume pipeline execution from this checkpoint thread"),
    idea: Optional[str] = typer.Option(None, "--idea", help="Idea used if no checkpoint exists and resume-run starts fresh"),
    output_dir: Optional[str] = typer.Option(None, "--output", "-o", help="Output directory when using --resume-run"),
    max_rounds: int = typer.Option(2, "--rounds", "-r", help="Maximum debate rounds when using --resume-run"),
    web_search: bool = typer.Option(True, "--search/--no-search", help="Enable web search when using --resume-run"),
    trust_mode: str = typer.Option("trusted", "--trust-mode", help="Execution trust mode for --resume-run"),
    allowlist_mode: str = typer.Option("permissive", "--allowlist-mode", help="Allowlist mode for --resume-run"),
    failover_profile: str = typer.Option("balanced", "--failover-profile", help="Failover profile for --resume-run"),
    telemetry_parity_mode: str = typer.Option("warn", "--telemetry-parity-mode", help="Telemetry parity policy for --resume-run"),
    hitl_git_publishing: str = typer.Option("pending", "--hitl-git-publishing", help="HITL decision for git publishing: approve|edit|reject|pending"),
    hitl_interactive: bool = typer.Option(False, "--hitl-interactive", help="Prompt for HITL decisions in constrained/untrusted modes"),
    cloud_only: bool = typer.Option(False, "--cloud-only", help="Disable local models and run with cloud providers only"),
    force_resume: bool = typer.Option(False, "--force-resume", help="Force resume even when checkpoint diagnostics are not resumable"),
):
    """
    ♻️ Inspect and summarize the latest checkpoint for a thread.
    """
    show_banner()
    console.print("[bold cyan]♻️ Checkpoint Replay Inspector[/bold cyan]\n")

    parity_mode = _normalize_telemetry_parity_mode(telemetry_parity_mode)
    normalized_trust_mode = _normalize_trust_mode(trust_mode)
    normalized_allowlist_mode = _normalize_allowlist_mode(allowlist_mode)
    normalized_failover_profile = _normalize_failover_profile(failover_profile)
    normalized_hitl_publish = _normalize_hitl_decision(hitl_git_publishing)
    hitl_decisions = _resolve_hitl_decisions(
        trust_mode=normalized_trust_mode,
        hitl_git_publishing=normalized_hitl_publish,
        hitl_interactive=hitl_interactive,
    )

    if parity_mode != str(telemetry_parity_mode or "warn").strip().lower():
        console.print("[yellow]⚠️  Invalid telemetry parity mode provided; using 'warn'.[/yellow]")
    if normalized_trust_mode != str(trust_mode or "trusted").strip().lower():
        console.print("[yellow]⚠️  Invalid trust mode provided; using 'trusted'.[/yellow]")
    if normalized_allowlist_mode != str(allowlist_mode or "permissive").strip().lower():
        console.print("[yellow]⚠️  Invalid allowlist mode provided; using 'permissive'.[/yellow]")
    if normalized_failover_profile != str(failover_profile or "balanced").strip().lower():
        console.print("[yellow]⚠️  Invalid failover profile provided; using 'balanced'.[/yellow]")
    if normalized_hitl_publish != str(hitl_git_publishing or "pending").strip().lower():
        console.print("[yellow]⚠️  Invalid HITL decision provided; using 'pending'.[/yellow]")

    try:
        from src.langraph_pipeline.checkpointer_factory import create_checkpointer, load_existing_checkpoint

        bundle = create_checkpointer(provider=checkpointer, logs_dir="logs")
        config = {"configurable": {"thread_id": thread_id}}
        raw = load_existing_checkpoint(bundle.checkpointer, config)
        state = _extract_checkpoint_state(raw)

        if getattr(bundle, "close", None):
            bundle.close()
    except Exception as e:
        console.print(f"[red]❌ Replay inspection failed: {e}[/red]")
        raise typer.Exit(1)

    if not state:
        console.print("[yellow]No checkpoint found for that thread/provider.[/yellow]")
        raise typer.Exit(1)

    stage = str(state.get("current_stage", "unknown"))
    errors = state.get("errors", []) if isinstance(state.get("errors"), list) else []
    warnings = state.get("warnings", []) if isinstance(state.get("warnings"), list) else []
    node_calls = state.get("_node_exec_frequency", {}) if isinstance(state.get("_node_exec_frequency"), dict) else {}
    diagnostics = _build_checkpoint_diagnostics(state)

    table = Table(title="Checkpoint Summary", box=box.ROUNDED, border_style="cyan")
    table.add_column("Field", style="cyan", width=24)
    table.add_column("Value", style="white")
    table.add_row("Provider", checkpointer)
    table.add_row("Thread ID", thread_id)
    table.add_row("Current Stage", stage)
    table.add_row("Error Count", str(len(errors)))
    table.add_row("Warning Count", str(len(warnings)))
    table.add_row("Visited Nodes", str(len(node_calls)))
    table.add_row("Top Node Calls", ", ".join(f"{k}:{v}" for k, v in list(node_calls.items())[:6]) or "N/A")
    console.print(table)

    diag_table = Table(title="Checkpoint Diagnostics", box=box.ROUNDED, border_style="magenta")
    diag_table.add_column("Field", style="magenta", width=24)
    diag_table.add_column("Value", style="white")
    diag_table.add_row("Resumable", str(bool(diagnostics["resumable"])))
    diag_table.add_row("Loop State", diagnostics["loop_state"])
    diag_table.add_row("Top Node", diagnostics["top_node"])
    diag_table.add_row("Known Nodes", str(diagnostics["node_count"]))
    diag_table.add_row("Missing Keys", ", ".join(diagnostics["missing_keys"]) or "None")
    diag_table.add_row("Next Stages", " -> ".join(diagnostics["next_stages"]) or "N/A")
    console.print(diag_table)

    if not resume_run:
        return

    _apply_cloud_only_mode(cloud_only)

    if not diagnostics.get("resumable", False) and not force_resume:
        console.print("[red]❌ Resume blocked: checkpoint diagnostics marked this thread as non-resumable.[/red]")
        console.print("[yellow]Use --force-resume to override this safety gate.[/yellow]")
        raise typer.Exit(1)

    console.print("\n[bold cyan]♻️ Resuming pipeline from checkpoint[/bold cyan]\n")
    try:
        from src.langraph_pipeline.workflow_enhanced import run_auto_git_pipeline

        resumed = asyncio.run(
            run_auto_git_pipeline(
                idea=idea or f"Resume thread {thread_id}",
                max_debate_rounds=max_rounds,
                use_web_search=web_search,
                output_dir=output_dir,
                thread_id=thread_id,
                resume=True,
                checkpointer_provider=checkpointer,
                trust_mode=normalized_trust_mode,
                tool_allowlist_mode=normalized_allowlist_mode,
                model_failover_profile=normalized_failover_profile,
                telemetry_parity_mode=parity_mode,
                hitl_decisions=hitl_decisions,
            )
        )
    except Exception as e:
        console.print(f"[red]❌ Resume run failed: {e}[/red]")
        raise typer.Exit(1)

    summary = Table(title="Resume Run Result", box=box.ROUNDED, border_style="green")
    summary.add_column("Field", style="cyan", width=24)
    summary.add_column("Value", style="white")
    summary.add_row("Current Stage", str(resumed.get("current_stage", "unknown")))
    summary.add_row("Errors", str(len(resumed.get("errors", []) if isinstance(resumed.get("errors"), list) else [])))
    summary.add_row("Warnings", str(len(resumed.get("warnings", []) if isinstance(resumed.get("warnings"), list) else [])))
    summary.add_row("Published", str(bool(resumed.get("published", False))))
    summary.add_row("GitHub URL", str(resumed.get("github_url", "")) or "N/A")
    console.print(summary)


@app.command()
def config(
    github_token: Optional[str] = typer.Option(None, "--github-token", help="Set GitHub personal access token"),
    ollama_url: Optional[str] = typer.Option(None, "--ollama-url", help="Set Ollama server URL"),
):
    """
    ⚙️  Configure Auto-GIT settings
    
    Set API keys and configuration options.
    """
    show_banner()
    
    if github_token:
        _upsert_env_var(".env", "GITHUB_TOKEN", github_token)
        console.print("[green]✅ GitHub token saved to .env[/green]")
    
    if ollama_url:
        _upsert_env_var(".env", "OLLAMA_BASE_URL", ollama_url)
        console.print(f"[green]✅ Ollama URL set to {ollama_url}[/green]")
    
    if not github_token and not ollama_url:
        console.print("[yellow]No configuration changes made. Use --help for options.[/yellow]")


@app.callback(invoke_without_command=True)
def main(ctx: typer.Context):
    """
    🚀 AUTO-GIT - Autonomous Research-to-GitHub Pipeline
    
    Transforms research ideas into working code and published GitHub repositories.
    
    Powered by LangGraph, Ollama, and Multi-Agent Debate Systems.
    """
    if ctx.invoked_subcommand is None:
        # No command specified, show menu
        menu()


if __name__ == "__main__":
    app()
