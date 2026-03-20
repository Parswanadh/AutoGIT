"""
LangGraph Pipeline for Auto-GIT

Production-grade orchestration using LangGraph with:
- Multi-perspective debate system
- Web search integration
- State persistence
- Ollama LLM integration
"""

from .state import (
    AutoGITState,
    create_initial_state,
    EXPERT_PERSPECTIVES,
    PerspectiveConfig,
    SolutionProposal,
    Critique,
    DebateRound
)

try:
    from .workflow import (
        build_workflow,
        compile_workflow,
        run_auto_git_pipeline,
        print_workflow_structure
    )
except ModuleNotFoundError:
    # Allow importing lightweight helpers (state/nodes) even when runtime graph deps
    # are not installed in the active environment.
    pass

try:
    from .nodes import (
        research_node,
        problem_extraction_node,
        solution_generation_node,
        critique_node,
        consensus_check_node,
        solution_selection_node,
        code_generation_node,
        git_publishing_node
    )
except ModuleNotFoundError:
    # Allow package imports in minimal environments that only run lightweight tests.
    pass

try:
    from .integrated_workflow import (
        build_integrated_workflow,
        compile_integrated_workflow,
        run_integrated_pipeline,
        print_integrated_workflow_structure
    )
except ModuleNotFoundError:
    # Keep package importable when optional integration workflow deps are missing.
    pass

try:
    from .integrated_nodes import (
        enhanced_research_node,
        memory_retrieval_node,
        persona_solution_generation_node,
        persona_critique_node,
        weighted_consensus_node,
        store_experience_node
    )
except ModuleNotFoundError:
    # Keep import path stable when optional integrated-node dependencies are absent.
    pass

_EXPORT_CANDIDATES = [
    # State
    "AutoGITState",
    "create_initial_state",
    "EXPERT_PERSPECTIVES",
    "PerspectiveConfig",
    "SolutionProposal",
    "Critique",
    "DebateRound",
    # Workflow
    "build_workflow",
    "compile_workflow",
    "run_auto_git_pipeline",
    "print_workflow_structure",
    # Nodes
    "research_node",
    "problem_extraction_node",
    "solution_generation_node",
    "critique_node",
    "consensus_check_node",
    "solution_selection_node",
    "code_generation_node",
    "git_publishing_node",
    # Integrated Workflow (Single-Model Multi-Agent)
    "build_integrated_workflow",
    "compile_integrated_workflow",
    "run_integrated_pipeline",
    "print_integrated_workflow_structure",
    # Integrated Nodes
    "enhanced_research_node",
    "memory_retrieval_node",
    "persona_solution_generation_node",
    "persona_critique_node",
    "weighted_consensus_node",
    "store_experience_node",
]

__all__ = [name for name in _EXPORT_CANDIDATES if name in globals()]
