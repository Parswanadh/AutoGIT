"""
LangGraph State Definition for AUTO-GIT Publisher Pipeline.
Production-grade typed state management.
"""

from typing import TypedDict, List, Dict, Optional, Annotated
from datetime import datetime
from operator import add

from src.models.schemas import (
    PaperMetadata,
    NoveltyResult,
    PriorityResult,
    ExtractedContent,
    ArchitectureSpec,
    DependencySpec,
    GeneratedCode,
    ValidationResult,
    OptimizationReport,
    LocalRepo,
    Documentation,
    PublishResult,
    ProblemStatement,
    SolutionProposal,
    CritiqueReport,
    FinalSolution
)


class AgentState(TypedDict):
    """
    Complete pipeline state for LangGraph.
    
    This state is passed between all agents in the graph.
    Uses Annotated with operator.add for list accumulation.
    """
    
    # ============================================
    # CORE METADATA
    # ============================================
    pipeline_id: str
    current_paper_id: str
    status: str  # "discovering" | "analyzing" | "generating" | "publishing" | "completed" | "failed"
    created_at: datetime
    updated_at: datetime
    
    # ============================================
    # TIER 1: DISCOVERY
    # ============================================
    discovered_papers: List[PaperMetadata]
    current_paper: Optional[PaperMetadata]
    novelty_result: Optional[NoveltyResult]
    priority_result: Optional[PriorityResult]
    
    # Discovery decisions
    passes_novelty: bool
    passes_priority: bool
    
    # ============================================
    # TIER 2: PROBLEM EXTRACTION & DEBATE (NEW!)
    # ============================================
    problem_statement: Optional[ProblemStatement]
    solution_proposals: List[SolutionProposal]
    solution_critiques: List[tuple]  # (SolutionProposal, CritiqueReport)
    debate_iteration: int
    latest_critique: Optional[str]
    final_solution: Optional[FinalSolution]
    passes_validation: bool
    
    # ============================================
    # TIER 2.5: ANALYSIS (Original)
    # ============================================
    pdf_path: Optional[str]
    extracted_content: Optional[ExtractedContent]
    architecture_spec: Optional[ArchitectureSpec]
    dependency_spec: Optional[DependencySpec]
    
    # Analysis flags
    pdf_extraction_success: bool
    architecture_parsed: bool
    
    # ============================================
    # TIER 3: GENERATION
    # ============================================
    generated_code: Optional[GeneratedCode]
    validation_result: Optional[ValidationResult]
    optimization_report: Optional[OptimizationReport]
    
    # Generation tracking
    generation_attempts: int
    validation_passed: bool
    code_quality_score: float
    
    # ============================================
    # TIER 4: PUBLISHING
    # ============================================
    local_repo: Optional[LocalRepo]
    documentation: Optional[Documentation]
    publish_result: Optional[PublishResult]
    
    # Publishing flags
    repo_created: bool
    github_published: bool
    
    # ============================================
    # TRACKING & MONITORING
    # ============================================
    messages: Annotated[List[str], add]  # Agent messages (accumulated)
    errors: Annotated[List[str], add]    # Error log (accumulated)
    warnings: Annotated[List[str], add]  # Warnings (accumulated)
    
    # Performance metrics
    tokens_used: int
    model_calls_count: int
    total_time_seconds: float
    
    # Retry tracking
    retry_count: int
    max_retries: int
    
    # Checkpointing
    last_checkpoint_tier: int  # 0, 1, 2, 3, or 4
    checkpoint_timestamp: Optional[datetime]
    
    # Configuration snapshot
    config_snapshot: Dict
    
    # Next action
    next: str  # Next node to execute


def create_initial_state() -> AgentState:
    """
    Create initial state for a new pipeline run.
    
    Returns:
        Fresh AgentState with default values
    """
    now = datetime.utcnow()
    
    return AgentState(
        # Core
        pipeline_id=f"pipeline_{now.strftime('%Y%m%d_%H%M%S')}",
        current_paper_id="",
        status="discovering",
        created_at=now,
        updated_at=now,
        
        # Tier 1
        discovered_papers=[],
        current_paper=None,
        novelty_result=None,
        priority_result=None,
        passes_novelty=False,
        passes_priority=False,
        
        # Tier 2: Problem Extraction & Debate
        problem_statement=None,
        solution_proposals=[],
        solution_critiques=[],
        debate_iteration=1,
        latest_critique=None,
        final_solution=None,
        passes_validation=False,
        
        # Tier 2.5: Analysis
        pdf_path=None,
        extracted_content=None,
        architecture_spec=None,
        dependency_spec=None,
        pdf_extraction_success=False,
        architecture_parsed=False,
        
        # Tier 3
        generated_code=None,
        validation_result=None,
        optimization_report=None,
        generation_attempts=0,
        validation_passed=False,
        code_quality_score=0.0,
        
        # Tier 4
        local_repo=None,
        documentation=None,
        publish_result=None,
        repo_created=False,
        github_published=False,
        
        # Tracking
        messages=[],
        errors=[],
        warnings=[],
        tokens_used=0,
        model_calls_count=0,
        total_time_seconds=0.0,
        retry_count=0,
        max_retries=3,
        last_checkpoint_tier=0,
        checkpoint_timestamp=None,
        
        # Config
        config_snapshot={},
        
        # Next
        next="paper_scout"
    )


def update_state_status(state: AgentState, new_status: str, message: str) -> AgentState:
    """
    Helper to update state status with message.
    
    Args:
        state: Current state
        new_status: New status string
        message: Status message
    
    Returns:
        Updated state
    """
    state["status"] = new_status
    state["updated_at"] = datetime.utcnow()
    state["messages"].append(f"[{new_status}] {message}")
    return state


def add_error(state: AgentState, error: str, tier: Optional[int] = None) -> AgentState:
    """
    Add error to state.
    
    Args:
        state: Current state
        error: Error message
        tier: Optional tier number
    
    Returns:
        Updated state
    """
    prefix = f"[Tier {tier}] " if tier else ""
    state["errors"].append(f"{prefix}{error}")
    state["updated_at"] = datetime.utcnow()
    return state


def add_warning(state: AgentState, warning: str, tier: Optional[int] = None) -> AgentState:
    """
    Add warning to state.
    
    Args:
        state: Current state
        warning: Warning message
        tier: Optional tier number
    
    Returns:
        Updated state
    """
    prefix = f"[Tier {tier}] " if tier else ""
    state["warnings"].append(f"{prefix}{warning}")
    state["updated_at"] = datetime.utcnow()
    return state
