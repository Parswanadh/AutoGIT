#!/usr/bin/env python3
"""
Auto-GIT Interactive CLI
A conversational interface like Gemini CLI or Claude Code
"""

import asyncio
import sys
from typing import Optional
from rich.console import Console
from rich.panel import Panel
from rich.prompt import Prompt
from rich.markdown import Markdown
from rich.table import Table
from rich import box
from rich.live import Live
from rich.spinner import Spinner

console = Console()

# ASCII Art Logo
LOGO = """[bold cyan]
   ___         __           _______ ______
  / _ | __ __ / /_ ___     / ___/  /  ___/
 / __ |/ // // __// _ \   / (_ / / / /    
/_/ |_|\_,_/ \__/ \___/   \___//_/ /_/     
                                           
[/bold cyan][dim]Autonomous Research → Code → GitHub Pipeline
Powered by LangGraph | Built with ❤️[/dim]
"""

WELCOME_MESSAGE = """
Welcome to [bold cyan]Auto-GIT Interactive[/bold cyan]! 🚀

I'm your AI-powered research assistant. I can help you:

• 🔍 **Research** papers and implementations
• 💡 **Debate** solutions from multiple expert perspectives
• 💻 **Generate** production-ready code
• 📤 **Publish** to GitHub automatically

[dim]Type your request in natural language, or use commands:
  • 'help' - Show all commands
  • 'status' - Check system health
  • 'exit' or 'quit' - Leave the session[/dim]
"""

def show_banner():
    """Display the Auto-GIT banner"""
    console.clear()
    console.print(LOGO)
    console.print(Panel(WELCOME_MESSAGE, border_style="cyan", box=box.ROUNDED))
    console.print()


def show_help():
    """Display help information"""
    help_table = Table(
        title="💡 Available Commands & Natural Language",
        show_header=True,
        header_style="bold magenta",
        border_style="cyan",
        box=box.ROUNDED
    )
    
    help_table.add_column("Command/Phrase", style="cyan", width=30)
    help_table.add_column("What it does", style="white")
    help_table.add_column("Example", style="dim")
    
    # Natural language commands
    help_table.add_row(
        "[bold]generate <idea>[/bold]",
        "Full pipeline: research → debate → code → publish",
        "generate sparse attention"
    )
    
    help_table.add_row(
        "[bold]fix <project>[/bold]",
        "Test & fix existing code from output folder",
        "fix transformer-attention"
    )
    
    help_table.add_row(
        "[bold]research <topic>[/bold]",
        "Search papers and implementations",
        "research transformer models"
    )
    
    help_table.add_row(
        "[bold]debate <problem>[/bold]",
        "Multi-perspective expert debate",
        "debate efficient attention"
    )
    
    help_table.add_row(
        "[bold]publish <directory>[/bold]",
        "Publish directory to GitHub",
        "publish ./output/my-project"
    )
    
    help_table.add_row(
        "[bold]help[/bold]",
        "Show this help message",
        "help"
    )
    
    help_table.add_row(
        "[bold]status[/bold]",
        "Check system health & models",
        "status"
    )
    
    help_table.add_row(
        "[bold]config[/bold]",
        "Configure GitHub token",
        "config"
    )
    
    help_table.add_row(
        "[bold]clear[/bold]",
        "Clear the screen",
        "clear"
    )
    
    help_table.add_row(
        "[bold]exit / quit[/bold]",
        "Exit the interactive session",
        "exit"
    )
    
    console.print("\n")
    console.print(help_table)
    console.print("\n")
    
    # Natural language tips
    console.print(Panel(
        "[bold cyan]💬 Natural Language Tips[/bold cyan]\n\n"
        "You can also chat naturally:\n"
        "  • [dim]'Can you help me research efficient transformers?'[/dim]\n"
        "  • [dim]'I need code for sparse attention mechanisms'[/dim]\n"
        "  • [dim]'Generate a PyTorch implementation of...'[/dim]\n"
        "  • [dim]'What's the best approach for...?'[/dim]\n\n"
        "I'll understand your intent and route to the right pipeline!",
        border_style="blue",
        box=box.ROUNDED
    ))
    console.print()


def check_status():
    """Check and display system status"""
    console.print("\n[bold cyan]🔍 System Status Check[/bold cyan]\n")
    
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
            required_models = ["gemma2:2b", "qwen3:4b", "deepseek-coder-v2:16b"]
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
        console.print("  [yellow]⚠️  GitHub token not set[/yellow]")
        console.print("     [dim]Set it with: export GITHUB_TOKEN=ghp_xxx[/dim]")
    
    console.print("\n[bold green]✅ System check complete![/bold green]\n")


def configure_settings():
    """Interactive configuration"""
    console.print("\n[bold cyan]⚙️  Configuration[/bold cyan]\n")
    
    # GitHub token
    if Prompt.ask("Do you want to set GitHub token?", choices=["y", "n"], default="n") == "y":
        token = Prompt.ask("Enter your GitHub personal access token", password=True)
        if token:
            env_path = ".env"
            with open(env_path, "a") as f:
                f.write(f"\nGITHUB_TOKEN={token}\n")
            console.print("[green]✅ GitHub token saved to .env[/green]")
    
    console.print()


def parse_direct_command(user_input: str) -> tuple[str, str]:
    """
    Parse direct commands like 'generate X', 'research Y', 'debate Z'
    
    Returns:
        (command, topic) tuple where command is None if not a direct command
    """
    user_input = user_input.strip()
    lower = user_input.lower()
    
    # Check for generate command
    if lower.startswith("generate "):
        topic = user_input[9:].strip()  # Remove "generate "
        if topic:
            return ("generate", topic)
    
    # Check for fix command
    if lower.startswith("fix "):
        project = user_input[4:].strip()  # Remove "fix "
        if project:
            return ("fix", project)
    elif lower == "fix":
        return ("fix", None)  # List projects
    
    # Check for research command
    if lower.startswith("research "):
        topic = user_input[9:].strip()  # Remove "research "
        if topic:
            return ("research", topic)
    
    # Check for debate command
    if lower.startswith("debate "):
        topic = user_input[7:].strip()  # Remove "debate "
        if topic:
            return ("debate", topic)
    
    # Check for publish command
    if lower.startswith("publish "):
        path = user_input[8:].strip()  # Remove "publish "
        if path:
            return ("publish", path)
    
    return (None, None)


def parse_intent(user_input: str) -> tuple[str, str]:
    """
    Parse user input to determine intent and extract topic
    
    Returns:
        (command, topic) tuple
    """
    user_input = user_input.strip()
    user_input_lower = user_input.lower()
    
    # Direct commands
    if user_input_lower in ["help", "h", "?"]:
        return ("help", "")
    elif user_input_lower in ["status", "check"]:
        return ("status", "")
    elif user_input_lower in ["config", "configure", "settings"]:
        return ("config", "")
    elif user_input_lower in ["exit", "quit", "q", "bye"]:
        return ("exit", "")
    elif user_input_lower == "clear":
        return ("clear", "")
    
    # Command-style inputs
    if user_input_lower.startswith("generate "):
        return ("generate", user_input[len("generate "):].strip())
    elif user_input_lower.startswith("research "):
        return ("research", user_input[len("research "):].strip())
    elif user_input_lower.startswith("debate "):
        return ("debate", user_input[len("debate "):].strip())
    
    # Natural language detection
    generate_keywords = ["generate", "create", "build", "implement", "code for", "make"]
    research_keywords = ["research", "find", "search", "look for", "papers on", "papers about"]
    debate_keywords = ["debate", "discuss", "analyze", "evaluate", "compare approaches"]
    
    if any(keyword in user_input_lower for keyword in generate_keywords):
        # Extract topic by removing trigger words (case-insensitive)
        topic = user_input
        for keyword in generate_keywords:
            import re
            topic = re.sub(re.escape(keyword), "", topic, flags=re.IGNORECASE).strip()
        topic = topic.replace("?", "").strip()
        return ("generate", topic)
    
    elif any(keyword in user_input_lower for keyword in research_keywords):
        topic = user_input
        for keyword in research_keywords:
            import re
            topic = re.sub(re.escape(keyword), "", topic, flags=re.IGNORECASE).strip()
        topic = topic.replace("?", "").strip()
        return ("research", topic)
    
    elif any(keyword in user_input_lower for keyword in debate_keywords):
        topic = user_input
        for keyword in debate_keywords:
            import re
            topic = re.sub(re.escape(keyword), "", topic, flags=re.IGNORECASE).strip()
        topic = topic.replace("?", "").strip()
        return ("debate", topic)
    
    # Default: treat as generate if it looks like a research idea
    if len(user_input) > 10:
        return ("generate", user_input)
    
    return ("unknown", user_input)


async def handle_fix_project(project_name: Optional[str] = None):
    """Test, fix, and publish existing projects from output folder"""
    from pathlib import Path
    from src.utils.code_executor import CodeExecutor
    from src.langraph_pipeline.nodes import code_fixing_node
    from src.langraph_pipeline.state import create_initial_state
    
    output_dir = Path("output")
    
    if not output_dir.exists():
        console.print("[red]❌ No output folder found. Generate a project first![/red]\n")
        return
    
    # List all projects
    projects = [d for d in output_dir.iterdir() if d.is_dir()]
    
    if not projects:
        console.print("[red]❌ No projects found in output folder![/red]\n")
        return
    
    # If no project specified, show list
    if not project_name:
        console.print("\n[bold cyan]📂 Available Projects:[/bold cyan]\n")
        for i, proj in enumerate(projects, 1):
            # Get latest timestamp folder
            timestamps = [d for d in proj.iterdir() if d.is_dir()]
            if timestamps:
                latest = max(timestamps, key=lambda x: x.name)
                console.print(f"{i}. [cyan]{proj.name}[/cyan] [dim](last: {latest.name})[/dim]")
        console.print("\n[dim]Usage: fix <project-name>[/dim]\n")
        return
    
    # Find matching project
    matching_project = None
    for proj in projects:
        if project_name.lower() in proj.name.lower():
            matching_project = proj
            break
    
    if not matching_project:
        console.print(f"[red]❌ Project '{project_name}' not found![/red]\n")
        return
    
    # Get latest timestamp folder
    timestamps = [d for d in matching_project.iterdir() if d.is_dir()]
    if not timestamps:
        console.print(f"[red]❌ No code found in {matching_project.name}![/red]\n")
        return
    
    latest_folder = max(timestamps, key=lambda x: x.name)
    
    console.print(f"\n[bold green]🔧 Fixing Project:[/bold green] [cyan]{matching_project.name}[/cyan]")
    console.print(f"[dim]Location: {latest_folder}[/dim]\n")
    
    # Load all files
    files = {}
    for file_path in latest_folder.glob("*.py"):
        files[file_path.name] = file_path.read_text(encoding="utf-8")
    
    # Load requirements.txt
    req_file = latest_folder / "requirements.txt"
    if req_file.exists():
        files["requirements.txt"] = req_file.read_text(encoding="utf-8")
    
    console.print(f"[green]✓[/green] Loaded {len(files)} files\n")
    
    # Test and fix loop
    max_attempts = 6
    attempt = 0
    
    while attempt < max_attempts:
        attempt += 1
        console.print(f"[bold cyan]🧪 Test Attempt {attempt}/{max_attempts}[/bold cyan]\n")
        
        # Create executor and test
        executor = CodeExecutor(latest_folder)
        test_results = executor.run_full_test_suite()
        
        # Check results
        all_pass = (
            test_results.get("environment_created", False) and
            test_results.get("dependencies_installed", False) and
            test_results.get("syntax_valid", False) and
            test_results.get("import_successful", False)
        )
        
        if all_pass:
            console.print("\n[bold green]✅ All tests passed![/bold green]\n")
            
            # Ask what to do next
            choice = Prompt.ask(
                "What would you like to do?",
                choices=["publish", "save", "continue"],
                default="publish"
            )
            
            if choice == "publish":
                console.print("\n[cyan]📤 Publishing to GitHub...[/cyan]\n")
                
                # Use publish script
                from publish_to_github import publish_to_github
                try:
                    success = publish_to_github(str(latest_folder))
                    if success:
                        console.print(f"\n[bold green]🚀 Published![/bold green]\n")
                    else:
                        console.print(f"\n[red]❌ Publishing failed[/red]\n")
                except Exception as e:
                    console.print(f"\n[red]❌ Publishing failed: {e}[/red]\n")
                break
            elif choice == "save":
                console.print(f"\n[green]💾 Project saved to {latest_folder}[/green]\n")
                break
            elif choice == "continue":
                console.print("\n[yellow]Continuing testing...[/yellow]\n")
                continue
        
        # Tests failed - show errors
        errors = test_results.get("execution_errors", [])
        console.print(f"\n[yellow]⚠️  Found {len(errors)} errors:[/yellow]")
        for error in errors[:3]:
            console.print(f"  [red]•[/red] [dim]{error}[/dim]")
        
        # Give user control options
        if attempt < max_attempts:
            control_choice = Prompt.ask(
                "\n[cyan]What would you like to do?[/cyan]",
                choices=["continue", "stop", "publish"],
                default="continue"
            )
            
            if control_choice == "stop":
                console.print(f"\n[yellow]⏹️  Stopping. Saving changes...[/yellow]\n")
                for filename, content in files.items():
                    file_path = latest_folder / filename
                    file_path.write_text(content, encoding="utf-8")
                console.print(f"[green]💾 Changes saved to {latest_folder}[/green]\n")
                break
            elif control_choice == "publish":
                console.print("\n[yellow]⚠️  Publishing despite test failures...[/yellow]\n")
                from publish_to_github import publish_to_github
                try:
                    success = publish_to_github(str(latest_folder))
                    if success:
                        console.print(f"\n[bold yellow]⚠️  Published (with errors)![/bold yellow]\n")
                    else:
                        console.print(f"\n[red]❌ Publishing failed[/red]\n")
                except Exception as e:
                    console.print(f"\n[red]❌ Publishing failed: {e}[/red]\n")
                break
        
        if attempt >= max_attempts:
            console.print(f"\n[red]❌ Max attempts ({max_attempts}) reached.[/red]\n")
            
            # Ask user if they want to continue with timeout
            import threading
            import time
            
            user_choice = [None]  # Use list to modify in thread
            
            def get_input():
                try:
                    choice = Prompt.ask(
                        "[yellow]Continue fixing? (y/n)[/yellow]",
                        choices=["y", "n"],
                        default="n"
                    )
                    user_choice[0] = choice
                except:
                    pass
            
            console.print(f"[dim]You have 120 seconds to respond (default: save and exit)...[/dim]")
            
            input_thread = threading.Thread(target=get_input)
            input_thread.daemon = True
            input_thread.start()
            
            # Wait for 120 seconds
            input_thread.join(timeout=120)
            
            if user_choice[0] == "y":
                console.print("\n[green]Continuing with 3 more attempts...[/green]\n")
                max_attempts += 3
                continue
            else:
                console.print(f"\n[yellow]⏱️  Timeout or declined. Saving changes and exiting...[/yellow]\n")
                # Save current state
                for filename, content in files.items():
                    file_path = latest_folder / filename
                    file_path.write_text(content, encoding="utf-8")
                console.print(f"[green]💾 Changes saved to {latest_folder}[/green]\n")
                break
        
        # Auto-fix
        console.print(f"\n[yellow]🔧 Attempting auto-fix...[/yellow]\n")
        
        # Create minimal state for fixing
        state = {
            "test_results": test_results,
            "fix_attempts": attempt - 1,
            "max_fix_attempts": max_attempts,
            "generated_code": {"files": files}
        }
        
        # Run fixing node
        from src.langraph_pipeline.nodes import code_fixing_node
        fix_result = await code_fixing_node(state)
        
        if fix_result.get("current_stage") == "code_fixed":
            # Update files with fixes
            fixed_files = fix_result.get("generated_code", {}).get("files", {})
            files = fixed_files
            
            # Save fixed files
            for filename, content in fixed_files.items():
                file_path = latest_folder / filename
                file_path.write_text(content, encoding="utf-8")
            
            console.print("[green]✓[/green] Applied fixes, re-testing...\n")
        else:
            console.print("[red]❌ Auto-fix failed[/red]\n")
            break
    
    # Cleanup
    try:
        executor.cleanup()
    except:
        pass


async def handle_generate_direct(topic: str):
    """Direct pipeline execution"""
    from src.langraph_pipeline.workflow_enhanced import run_auto_git_pipeline
    
    try:
        result = await run_auto_git_pipeline(
            idea=topic,
            max_debate_rounds=2,
            use_web_search=True,
            auto_publish=False,
            output_dir="output"
        )
        
        console.print("\n[bold green]✅ Pipeline completed![/bold green]\n")
        
        if result.get("final_solution"):
            console.print(Panel(
                f"[bold cyan]🏆 Generated Solution[/bold cyan]\n\n"
                f"{result['final_solution'].get('approach_name', 'N/A')}\n\n"
                f"[dim]{result['final_solution'].get('key_innovation', 'N/A')[:200]}...[/dim]",
                border_style="green"
            ))
    
    except KeyboardInterrupt:
        console.print("\n[yellow]⚠️  Pipeline interrupted[/yellow]\n")
    except Exception as e:
        console.print(f"\n[bold red]❌ Error: {e}[/bold red]\n")


async def handle_research_direct(topic: str):
    """Direct research"""
    from src.langraph_pipeline.workflow_enhanced import run_auto_git_pipeline
    
    try:
        result = await run_auto_git_pipeline(
            idea=topic,
            use_web_search=True,
            stop_after="research"
        )
        
        console.print("\n[bold green]✅ Research complete![/bold green]\n")
    
    except Exception as e:
        console.print(f"\n[bold red]❌ Error: {e}[/bold red]\n")


async def handle_debate_direct(topic: str):
    """Direct debate"""
    from src.langraph_pipeline.workflow_enhanced import run_auto_git_pipeline
    
    try:
        result = await run_auto_git_pipeline(
            idea=topic,
            use_web_search=True,
            max_debate_rounds=2,
            stop_after="solution_selection"
        )
        
        console.print("\n[bold green]✅ Debate complete![/bold green]\n")
        
        if result.get("final_solution"):
            console.print(Panel(
                f"[bold cyan]🏆 Consensus Solution[/bold cyan]\n\n"
                f"{result['final_solution'].get('approach_name', 'N/A')}\n\n"
                f"[dim]{result['final_solution'].get('key_innovation', 'N/A')[:200]}...[/dim]",
                border_style="magenta"
            ))
    
    except Exception as e:
        console.print(f"\n[bold red]❌ Error: {e}[/bold red]\n")


async def handle_publish_direct(directory_path: str):
    """Publish a directory directly to GitHub without testing"""
    from pathlib import Path
    from publish_to_github import publish_to_github
    
    console.print(f"\n[bold cyan]📤 Publishing Directory[/bold cyan]\n")
    
    # Resolve path
    dir_path = Path(directory_path).resolve()
    
    if not dir_path.exists():
        console.print(f"[red]❌ Directory not found: {directory_path}[/red]\n")
        return
    
    if not dir_path.is_dir():
        console.print(f"[red]❌ Not a directory: {directory_path}[/red]\n")
        return
    
    # Show directory info
    files_count = len(list(dir_path.glob("*")))
    console.print(f"[cyan]📁 Directory:[/cyan] {dir_path}")
    console.print(f"[cyan]📄 Files:[/cyan] {files_count}\n")
    
    # Confirm
    if Prompt.ask("[yellow]Continue publishing?[/yellow]", choices=["y", "n"], default="y") != "y":
        console.print("[dim]Cancelled[/dim]\n")
        return
    
    # Publish
    try:
        console.print("\n[cyan]Publishing to GitHub...[/cyan]\n")
        success = publish_to_github(str(dir_path))
        
        if success:
            console.print(f"\n[bold green]✅ Published successfully![/bold green]\n")
        else:
            console.print(f"\n[red]❌ Publishing failed[/red]\n")
    
    except Exception as e:
        console.print(f"\n[bold red]❌ Error: {e}[/bold red]\n")


async def handle_generate_conversational(initial_message: str):
    """
    Handle generate with conversational agent
    
    The agent will chat with the user to clarify requirements first,
    then execute the pipeline.
    """
    from src.langraph_pipeline.conversation_agent import have_conversation
    from src.langraph_pipeline.workflow_enhanced import run_auto_git_pipeline
    
    console.print(f"\n[bold cyan]🤖 Auto-GIT Agent[/bold cyan]\n")
    console.print("[dim]I'll chat with you to understand your requirements...[/dim]\n")
    
    # Start conversation
    thread_id = "interactive_session"
    conversation_history = []
    current_message = initial_message
    
    max_turns = 5  # Quick conversation: 2-3 turns max
    turn = 0
    
    while turn < max_turns:
        turn += 1
        
        # Agent responds
        try:
            result = await have_conversation(current_message, thread_id=thread_id)
            
            agent_response = result["agent_response"]
            ready = result["ready_for_pipeline"]
            requirements = result["requirements"]
            confidence = result["confidence"]
            
            # Show agent response
            console.print(f"[bold cyan]Agent:[/bold cyan] {agent_response}\n")
            
            # Check if ready to execute
            if ready:
                console.print(Panel(
                    f"[bold green]✅ Ready to Execute![/bold green]\n\n"
                    f"Confidence: {confidence:.0%}\n"
                    f"Core Idea: {requirements.get('core_idea', 'N/A')}\n"
                    f"Approach: {requirements.get('approach', 'N/A')}\n"
                    f"Search Papers: {requirements.get('search_papers', True)}",
                    border_style="green"
                ))
                
                # Confirm with user
                if Prompt.ask("Proceed with pipeline?", choices=["y", "n"], default="y") == "y":
                    # Execute pipeline with ACTUAL requirements
                    console.print(f"\n[bold green]🚀 Executing pipeline...[/bold green]\n")
                    
                    pipeline_result = await run_auto_git_pipeline(
                        idea=requirements.get('core_idea', initial_message),
                        requirements=requirements,  # Pass structured requirements!
                        max_debate_rounds=2,
                        use_web_search=requirements.get('search_papers', True),
                        auto_publish=requirements.get('publish_github', False),
                        output_dir="output"
                    )
                    
                    console.print("\n[bold green]✅ Pipeline completed![/bold green]\n")
                    
                    if pipeline_result.get("final_solution"):
                        console.print(Panel(
                            f"[bold cyan]🏆 Selected Solution[/bold cyan]\n\n"
                            f"{pipeline_result['final_solution'].get('approach_name', 'N/A')}",
                            border_style="green"
                        ))
                else:
                    console.print("[yellow]Pipeline cancelled[/yellow]\n")
                
                break
            
            # Not ready, continue conversation
            user_response = Prompt.ask("[bold green]You[/bold green]")
            
            if not user_response.strip():
                console.print("[yellow]Please provide more information[/yellow]\n")
                continue
            
            # Check if user wants to exit
            if user_response.lower() in ["exit", "quit", "cancel", "stop"]:
                console.print("[yellow]Conversation cancelled[/yellow]\n")
                break
            
            current_message = user_response
            conversation_history.append(("user", user_response))
            
        except KeyboardInterrupt:
            console.print("\n[yellow]⚠️  Conversation interrupted[/yellow]\n")
            break
        except Exception as e:
            console.print(f"\n[bold red]❌ Error: {e}[/bold red]\n")
            break
    
    if turn >= max_turns:
        console.print("[yellow]Maximum conversation turns reached[/yellow]\n")


async def handle_research(topic: str):
    """Handle research request"""
    from src.utils.web_search import ResearchSearcher
    
    console.print(f"\n[bold cyan]🔍 Researching: {topic}[/bold cyan]\n")
    
    with console.status("[cyan]Searching arXiv and web...", spinner="dots"):
        searcher = ResearchSearcher()
        result = searcher.search_comprehensive(topic)
        papers = result.get("papers", [])
        web_results = result.get("web_results", [])
        implementations = result.get("implementations", [])
    
    # Display papers
    if papers:
        console.print(Panel(
            f"[bold green]📚 Found {len(papers)} papers on arXiv[/bold green]",
            style="green"
        ))
        for i, paper in enumerate(papers[:5], 1):
            console.print(f"\n{i}. [cyan]{paper['title']}[/cyan]")
            console.print(f"   [dim]{paper['authors'][:100]}...[/dim]")
            console.print(f"   [link={paper['pdf_url']}]PDF Link[/link]")
    
    # Display implementations
    if implementations:
        console.print(f"\n[bold green]💻 Found {len(implementations)} implementations[/bold green]")
        for i, impl in enumerate(implementations[:3], 1):
            console.print(f"\n{i}. {impl.get('title', 'N/A')}")
            console.print(f"   [link={impl.get('href', '#')}]{impl.get('href', '#')}[/link]")
    
    console.print()


async def handle_debate(topic: str):
    """Handle debate request"""
    from src.langraph_pipeline.workflow_enhanced import run_auto_git_pipeline
    
    console.print(f"\n[bold magenta]🗣️  Starting multi-perspective debate...[/bold magenta]")
    console.print(f"[cyan]Topic:[/cyan] {topic}\n")
    
    try:
        result = await run_auto_git_pipeline(
            idea=topic,
            max_debate_rounds=2,
            use_web_search=True,
            stop_after="solution_selection"
        )
        
        console.print("\n[bold green]✅ Debate complete![/bold green]\n")
        
        if result.get("final_solution"):
            console.print(Panel(
                f"[bold cyan]🏆 Consensus Solution[/bold cyan]\n\n"
                f"{result['final_solution'].get('approach_name', 'N/A')}\n\n"
                f"[dim]{result['final_solution'].get('key_innovation', 'N/A')[:200]}...[/dim]",
                border_style="magenta"
            ))
        
    except KeyboardInterrupt:
        console.print("\n[yellow]⚠️  Debate interrupted[/yellow]\n")
    except Exception as e:
        console.print(f"\n[bold red]❌ Error: {e}[/bold red]\n")


async def interactive_session():
    """Main interactive session loop with conversational agent"""
    show_banner()
    
    console.print("[dim]I'm your AI assistant. Let's chat about what you'd like to build![/dim]")
    console.print("[dim]I'll ask questions to understand your requirements, then execute the pipeline.[/dim]\n")
    console.print("[dim]Type 'help' for commands, 'exit' to quit[/dim]\n")
    
    # Session history
    history = []
    
    while True:
        try:
            # Prompt for input
            user_input = Prompt.ask("\n[bold cyan]auto-git>[/bold cyan]")
            
            if not user_input.strip():
                continue
            
            # Strip leading '>' if present (common copy-paste artifact)
            user_input = user_input.lstrip('> ').strip()
            
            history.append(user_input)
            
            # Check for exit commands
            if user_input.lower() in ["exit", "quit", "bye"]:
                console.print("\n[cyan]👋 Thanks for using Auto-GIT! Goodbye![/cyan]\n")
                break
            
            # Show help
            if user_input.lower() in ["help", "h", "?"]:
                show_help()
                continue
            
            # Check for status
            if user_input.lower() == "status":
                check_status()
                continue
            
            # Check for config
            if user_input.lower() == "config":
                configure_settings()
                continue
            
            # Check for clear
            if user_input.lower() == "clear":
                console.clear()
                show_banner()
                continue
            
            # Parse direct commands (bypass agent for explicit commands)
            command, topic = parse_direct_command(user_input)
            
            if command == "generate" and topic:
                # Direct execution without agent
                console.print(f"\n[bold green]🚀 Generating:[/bold green] [cyan]{topic}[/cyan]\n")
                await handle_generate_direct(topic)
            elif command == "fix":
                # Fix existing project
                await handle_fix_project(topic)  # topic is project name or None
            elif command == "research" and topic:
                # Direct research
                console.print(f"\n[bold green]🔍 Researching:[/bold green] [cyan]{topic}[/cyan]\n")
                await handle_research_direct(topic)
            elif command == "debate" and topic:
                # Direct debate
                console.print(f"\n[bold green]💡 Debating:[/bold green] [cyan]{topic}[/cyan]\n")
                await handle_debate_direct(topic)
            elif command == "publish" and topic:
                # Direct publish
                await handle_publish_direct(topic)
            else:
                # All other inputs go through conversational agent
                await handle_generate_conversational(user_input)
        
        except KeyboardInterrupt:
            console.print("\n[dim]Use 'exit' or 'quit' to leave the session[/dim]\n")
            continue
        
        except EOFError:
            console.print("\n[cyan]👋 Goodbye![/cyan]\n")
            break
        
        except Exception as e:
            console.print(f"\n[bold red]❌ Unexpected error: {e}[/bold red]\n")
            console.print("[dim]Type 'help' for usage information[/dim]\n")


def main():
    """Entry point for the auto-git command"""
    try:
        asyncio.run(interactive_session())
    except KeyboardInterrupt:
        console.print("\n[cyan]👋 Goodbye![/cyan]\n")
        sys.exit(0)


if __name__ == "__main__":
    main()
