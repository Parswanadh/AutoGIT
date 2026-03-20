"""
LangGraph State Management for Auto-GIT

Defines the state schema that flows through the entire pipeline.
Uses TypedDict for type safety and clarity.
"""

from typing import TypedDict, List, Dict, Optional, Annotated, Literal, Any
from datetime import datetime
import operator

# Import research report types from Integration #11
try:
    from agents.research import ResearchReport
except ImportError:
    ResearchReport = None  # Optional if research module not available


class PaperMetadata(TypedDict):
    """Metadata for a research paper"""
    title: str
    authors: List[str]
    summary: str
    pdf_url: str
    published: str
    categories: List[str]


class WebResult(TypedDict):
    """Web search result"""
    title: str
    href: str
    body: str


class ResearchContext(TypedDict):
    """Research context from web searches"""
    papers: List[PaperMetadata]
    web_results: List[WebResult]
    implementations: List[WebResult]
    search_timestamp: str


class SolutionProposal(TypedDict):
    """A proposed solution from one perspective"""
    approach_name: str
    perspective: str  # ML Researcher, Systems Engineer, etc.
    key_innovation: str
    architecture_design: str
    implementation_plan: List[str]
    expected_advantages: List[str]
    potential_challenges: List[str]
    novelty_score: float
    feasibility_score: float


class Critique(TypedDict):
    """Critique of a solution proposal"""
    solution_id: str
    reviewer_perspective: str
    overall_assessment: Literal["promising", "needs-work", "flawed"]
    strengths: List[str]
    weaknesses: List[str]
    specific_concerns: List[str]
    improvement_suggestions: List[str]
    feasibility_score: float
    recommendation: Literal["accept", "revise", "reject"]


class DebateRound(TypedDict):
    """One round of debate"""
    round_number: int
    proposals: List[SolutionProposal]
    critiques: List[Critique]
    consensus_reached: bool
    round_summary: str


class GeneratedCode(TypedDict):
    """Generated implementation code"""
    file_name: str
    code: str
    language: str
    description: str
    dependencies: List[str]


class AutoGITState(TypedDict):
    """
    Main state that flows through the LangGraph pipeline
    
    This is the central data structure that each node reads from and writes to.
    LangGraph automatically manages state updates and persistence.
    """
    
    # Input
    idea: str
    user_requirements: Optional[str]
    requirements: Optional[Dict[str, Any]]  # Structured requirements from conversation agent
    
    # Research Context (Legacy - keeping for compatibility)
    research_context: Optional[ResearchContext]
    related_work_summary: Optional[str]
    
    # Integration #11: Enhanced Research (multi-source web + academic)
    research_report: Optional[Any]  # ResearchReport from Integration #11
    research_summary: Optional[str]  # Quick summary for prompts
    
    # Problem Extraction
    problems: List[str]
    selected_problem: Optional[str]
    
    # Multi-Perspective Debate
    debate_rounds: Annotated[List[DebateRound], operator.add]  # Append-only
    current_round: int
    max_rounds: int
    perspectives: List[str]  # Active expert perspectives
    
    # Solution Selection
    final_solution: Optional[SolutionProposal]
    selection_reasoning: Optional[str]
    
    # Code Generation
    generated_code: Dict[str, Any]  # {"files": {filename: content}, "approach": str, ...}
    implementation_notes: Optional[str]
    
    # Code Testing
    test_results: Optional[Dict[str, Any]]
    tests_passed: bool
    fix_attempts: int  # Number of times we've tried to fix code
    max_fix_attempts: int  # Maximum fix attempts before giving up

    # Pipeline Self-Evaluation (Node 9.5)
    self_eval_attempts: int   # How many self-eval reruns have been triggered so far
    self_eval_score: float    # Latest holistic quality score (0-10), -1 if skipped
    self_eval_unverified: bool

    # Goal Achievement Evaluation (Node 9.9)
    goal_eval_attempts: int    # How many goal-eval regen loops have been triggered
    goal_eval_report: Optional[Dict[str, Any]]   # Per-requirement goal evaluation result
    goal_eval_unverified: bool

    # Architecture Specification (Node 6.5) — pre-code-gen planning
    architecture_spec: Optional[Dict[str, Any]]   # Structured spec JSON from architect_spec_node
    _architecture_spec_text: Optional[str]         # Human-readable spec injected into code gen prompts
    repo_map: Optional[str]                        # Compact repo/file/symbol map for prompt-efficient context
    context_budget_report: Optional[Dict[str, Any]]

    # Strategy Reasoner (Node 8.4) — reasoning-in-the-loop
    _prev_fix_strategies: List[str]  # History of fix strategies tried (prevents repeats)
    _prev_strategy_hashes: List[str]  # Dedup semantic strategy retries separately from raw errors
    _prev_error_hashes: List[str]    # Error hashes from prior fix iterations (for dedup/escalation)
    _auto_fixed_errors: List[str]    # Errors auto-fixed by deterministic fixers (for tracer)
    _error_fingerprints_history: List[str]  # Error fingerprints across fix attempts (oscillation detection)
    _persistent_error_tracker: Dict[str, int]  # Circuit breaker: {error_key: consecutive_count}

    # S20 Improvements
    pinned_requirements: Optional[List[str]]  # S20-Rank7: Canonical requirement list for goal-eval (prevents hallucination)
    fix_diffs: List[Dict[str, str]]           # S20-Rank8: Unified diffs from each fix iteration for debugging

    # Dynamic Agent Spawner (Kimi K2.5-style adaptive multi-agent)
    spawned_agent_roles: Optional[List[Dict[str, Any]]]  # AgentRole dicts for the current team
    agent_pool_log: Annotated[List[Dict[str, Any]], operator.add]  # Execution logs per spawn event
    spawn_coordination_mode: Optional[str]               # parallel|sequential|hierarchical|round_robin

    # Operational telemetry
    node_budget_report: Optional[Dict[str, Any]]
    resource_events: Annotated[List[Dict[str, Any]], operator.add]

    # Workflow-level loop detection telemetry (DeerFlow-inspired guardrail)
    _node_exec_frequency: Dict[str, int]
    _current_node_path: List[str]
    _node_paths_history: List[str]
    _workflow_state_fingerprints: List[str]
    _loop_detection_state: str
    _loop_detection_notes: List[str]

    # Pipeline todo tracking (generated from requirements + updated by workflow middleware)
    pipeline_todos: List[Dict[str, Any]]
    todo_progress: Optional[Dict[str, Any]]
    todo_generation_notes: Optional[str]
    
    # Git Publishing
    repo_name: Optional[str]
    commit_message: Optional[str]
    published: bool
    github_url: Optional[str]  # V8 FIX: renamed from publication_url to match nodes.py usage
    
    # Metadata
    pipeline_start_time: str
    current_stage: str
    correctness_passed: bool
    hard_failures: Annotated[List[str], operator.add]
    soft_warnings: Annotated[List[str], operator.add]
    errors: Annotated[List[str], operator.add]  # Append-only error log
    warnings: Annotated[List[str], operator.add]  # Append-only warning log
    structured_errors: Annotated[List[Dict[str, Any]], operator.add]
    telemetry_parity: Optional[Dict[str, Any]]

    # Context offload + compaction controls
    context_offload_refs: Annotated[List[Dict[str, Any]], operator.add]
    todo_context_pointer: Optional[str]
    summarize_now: bool
    
    # Dynamic expert perspectives (generated per-topic by LLM — overrides EXPERT_PERSPECTIVES)
    dynamic_perspective_configs: Optional[List[Any]]  # List[PerspectiveConfig], set by generate_perspectives

    # S22 FIX: Previously undeclared state keys (written by nodes but silently dropped
    # by LangGraph during state merges — caused fix_review to ALWAYS be skipped).
    should_continue_debate: bool       # Set by consensus_check_node
    fix_review_required: bool          # Set by code_fixing_node — triggers deep review on 1st fix
    auto_publish: bool                 # Set by workflow entry — whether to auto-publish to GitHub
    output_dir: Optional[str]          # Set by git_publishing_node — path to output directory
    output_path: Optional[str]         # Set by git_publishing_node (error paths)
    smoke_test: Optional[Dict[str, Any]]  # Set by code_testing_node — smoke test results

    # Trust/policy controls
    trust_mode: str                      # trusted|constrained|untrusted
    tool_allowlist_mode: str             # permissive|strict
    hitl_decisions: Dict[str, str]       # per high-risk node, e.g. {"git_publishing": "approve"}
    policy_events: Annotated[List[Dict[str, Any]], operator.add]

    # Ops profile controls
    checkpointer_provider: str
    model_failover_profile: str
    telemetry_parity_mode: str         # warn|strict

    # Configuration
    use_web_search: bool
    max_debate_rounds: int
    min_consensus_score: float


class PerspectiveConfig(TypedDict):
    """Configuration for expert perspectives"""
    name: str
    role: str
    expertise: str
    focus_areas: List[str]
    evaluation_criteria: List[str]


# Expert Perspectives (from STORM paper)
EXPERT_PERSPECTIVES: List[PerspectiveConfig] = [
    {
        "name": "ML Researcher",
        "role": "Machine Learning Research Scientist",
        "expertise": "Deep learning architectures, training methodologies, theoretical foundations",
        "focus_areas": ["novelty", "theoretical soundness", "empirical validation", "scalability"],
        "evaluation_criteria": [
            "Is the approach theoretically grounded?",
            "Does it advance the state-of-the-art?",
            "Are the claims supported by evidence?",
            "How does it compare to existing methods?"
        ]
    },
    {
        "name": "Systems Engineer",
        "role": "ML Systems Engineer",
        "expertise": "Production ML systems, optimization, deployment, infrastructure",
        "focus_areas": ["implementation feasibility", "computational efficiency", "production readiness", "maintainability"],
        "evaluation_criteria": [
            "Can this be implemented efficiently?",
            "What are the computational costs?",
            "Is it production-ready?",
            "How maintainable is the system?"
        ]
    },
    {
        "name": "Applied Scientist",
        "role": "Applied ML Scientist",
        "expertise": "Real-world applications, practical constraints, user impact",
        "focus_areas": ["practical utility", "real-world applicability", "user impact", "deployment challenges"],
        "evaluation_criteria": [
            "Does it solve a real problem?",
            "What are the practical limitations?",
            "How easy is it to adopt?",
            "What's the impact on end-users?"
        ]
    }
]


def create_initial_state(
    idea: str,
    user_requirements: Optional[str] = None,
    requirements: Optional[Dict[str, Any]] = None,
    use_web_search: bool = True,
    max_rounds: int = 2,
    min_consensus: float = 0.7
) -> AutoGITState:
    """
    Create initial state for the LangGraph pipeline
    
    Args:
        idea: The research idea or topic
        user_requirements: Optional additional requirements
        requirements: Structured requirements from conversation agent (IMPORTANT!)
        use_web_search: Whether to use web search
        max_rounds: Maximum debate rounds
        min_consensus: Minimum consensus score to stop debate
        
    Returns:
        Initial AutoGITState
    """
    return AutoGITState(
        # Input
        idea=idea,
        user_requirements=user_requirements,
        requirements=requirements,  # Pass structured requirements
        
        # Research Context
        research_context=None,
        related_work_summary=None,

        # Integration #11 enhanced research (optional)
        research_report=None,
        research_summary=None,
        
        # Problem Extraction
        problems=[],
        selected_problem=None,
        
        # Multi-Perspective Debate
        debate_rounds=[],
        current_round=0,
        max_rounds=max_rounds,
        perspectives=[p["name"] for p in EXPERT_PERSPECTIVES],

        # Dynamic perspectives (will be overwritten by perspective generation node)
        dynamic_perspective_configs=None,
        
        # Solution Selection
        final_solution=None,
        selection_reasoning=None,
        
        # Code Generation
        generated_code={},
        implementation_notes=None,
        
        # Code Testing
        test_results=None,
        tests_passed=False,  # S22 FIX: was True — if code_testing_node crashes, pipeline should NOT publish
        fix_attempts=0,
        max_fix_attempts=8,  # S24: Was 4 but workflow/nodes default to 8 — inconsistency caused

        # Self-Evaluation
        self_eval_attempts=0,
        self_eval_score=-1.0,
        self_eval_unverified=False,

        # Goal Achievement Evaluation (V14 FIX: was missing)
        goal_eval_attempts=0,
        goal_eval_report=None,
        goal_eval_unverified=False,

        # Architecture Specification
        architecture_spec=None,
        _architecture_spec_text="",
        repo_map="",
        context_budget_report={},

        # Strategy Reasoner
        _prev_fix_strategies=[],
        _prev_strategy_hashes=[],
        _prev_error_hashes=[],
        _auto_fixed_errors=[],
        _persistent_error_tracker={},

        # S20 Improvements
        pinned_requirements=None,
        fix_diffs=[],

        # Dynamic Agent Spawner
        spawned_agent_roles=None,
        agent_pool_log=[],
        spawn_coordination_mode=None,

        # Operational telemetry
        node_budget_report={},
        resource_events=[],

        # Workflow-level loop detection telemetry
        _node_exec_frequency={},
        _current_node_path=[],
        _node_paths_history=[],
        _workflow_state_fingerprints=[],
        _loop_detection_state="clean",
        _loop_detection_notes=[],

        # Pipeline todo tracking
        pipeline_todos=[],
        todo_progress={},
        todo_generation_notes="",
        
        # Git Publishing
        repo_name=None,
        commit_message=None,
        published=False,
        github_url=None,  # V8 FIX: match field name
        
        # Metadata
        pipeline_start_time=datetime.now().isoformat(),
        current_stage="initialized",
        correctness_passed=False,
        hard_failures=[],
        soft_warnings=[],
        errors=[],
        warnings=[],
        structured_errors=[],
        telemetry_parity={},

        # Context offload
        context_offload_refs=[],
        todo_context_pointer=None,
        summarize_now=False,
        
        # Additional fields
        _error_fingerprints_history=[],
        should_continue_debate=False,
        fix_review_required=False,
        output_path=None,
        smoke_test=None,

        # Trust/policy controls
        trust_mode="trusted",
        tool_allowlist_mode="permissive",
        hitl_decisions={},
        policy_events=[],

        # Ops profiles
        checkpointer_provider="sqlite",
        model_failover_profile="balanced",
        telemetry_parity_mode="warn",
        
        # Configuration
        use_web_search=use_web_search,
        max_debate_rounds=max_rounds,
        min_consensus_score=min_consensus
    )


def get_perspective_by_name(name: str) -> Optional[PerspectiveConfig]:
    """Get perspective configuration by name"""
    for perspective in EXPERT_PERSPECTIVES:
        if perspective["name"] == name:
            return perspective
    return None
