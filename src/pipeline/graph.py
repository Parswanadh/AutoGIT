"""
LangGraph Pipeline Graph Definition.
Production-grade stateful agent orchestration.
"""

from typing import Literal
from langgraph.graph import StateGraph, END
from langgraph.checkpoint.memory import MemorySaver

from src.pipeline.state import AgentState, create_initial_state
from src.agents.tier1_discovery.paper_scout import paper_scout_node
from src.agents.tier1_discovery.novelty_classifier import novelty_classifier_node
from src.agents.tier1_discovery.priority_router import priority_router_node
from src.agents.tier2_problem.problem_extractor import problem_extractor_node
from src.agents.tier2_debate.debate_moderator import debate_moderator_node, should_continue_debate
from src.agents.tier2_debate.realworld_validator import realworld_validator_node, should_proceed_after_validation
from src.utils.logger import get_logger


logger = get_logger("pipeline.graph")


def should_continue_after_novelty(state: AgentState) -> str:
    """
    Conditional edge after novelty classification.
    
    Args:
        state: Current pipeline state
    
    Returns:
        Next node name
    """
    if not state.get("passes_novelty", False):
        novelty_result = state.get('novelty_result')
        novelty_score = novelty_result.score if novelty_result else 0
        logger.info(f"Paper failed novelty check (score: {novelty_score})")
        
        # Check if more papers available
        if state.get("discovered_papers", []):
            logger.info("Moving to next paper...")
            return "paper_scout"
        else:
            logger.info("No more papers to process")
            return END
    
    logger.info("Paper passed novelty check, routing to priority...")
    return "priority_router"


def should_continue_after_priority(state: AgentState) -> str:
    """
    Conditional edge after priority routing.
    
    Args:
        state: Current pipeline state
    
    Returns:
        Next node name
    """
    if not state.get("passes_priority", False):
        priority_result = state.get('priority_result')
        priority_score = priority_result.priority if priority_result else 0
        logger.info(f"Paper failed priority check (score: {priority_score})")
        
        # Check if more papers available
        if state.get("discovered_papers", []):
            logger.info("Moving to next paper...")
            return "paper_scout"
        else:
            logger.info("No more papers to process")
            return END
    
    logger.info("Paper passed priority check, proceeding to problem extraction...")
    return "problem_extractor"


def create_pipeline_graph() -> StateGraph:
    """
    Create the complete 4-tier LangGraph pipeline.
    
    Returns:
        StateGraph with all agents and conditional edges
    """
    logger.info("Building LangGraph pipeline...")
    
    # Initialize graph with typed state
    workflow = StateGraph(AgentState)
    
    # ============================================
    # TIER 1: DISCOVERY NODES
    # ============================================
    workflow.add_node("paper_scout", paper_scout_node)
    workflow.add_node("novelty_classifier", novelty_classifier_node)
    workflow.add_node("priority_router", priority_router_node)
    
    # ============================================
    # TIER 2: PROBLEM EXTRACTION & SOLUTION DEBATE
    # ============================================
    workflow.add_node("problem_extractor", problem_extractor_node)
    workflow.add_node("debate_moderator", debate_moderator_node)
    workflow.add_node("real_world_validator", realworld_validator_node)
    
    # ============================================
    # TIER 3: GENERATION NODES (Coming Soon)
    # ============================================
    # workflow.add_node("code_generator", code_generator_node)
    # workflow.add_node("validator", validator_node)
    # workflow.add_node("optimizer", optimizer_node)
    
    # ============================================
    # TIER 4: PUBLISHING NODES (Coming Soon)
    # ============================================
    # workflow.add_node("repo_scaffolder", repo_scaffolder_node)
    # workflow.add_node("doc_generator", doc_generator_node)
    # workflow.add_node("publisher", publisher_node)
    
    # ============================================
    # EDGES: TIER 1 FLOW
    # ============================================
    
    # Entry point
    workflow.set_entry_point("paper_scout")
    
    # Paper Scout → Novelty Classifier
    workflow.add_edge("paper_scout", "novelty_classifier")
    
    # Novelty Classifier → Conditional
    workflow.add_conditional_edges(
        "novelty_classifier",
        should_continue_after_novelty,
        {
            "priority_router": "priority_router",
            "paper_scout": "paper_scout",
            END: END
        }
    )
    
    # Priority Router → Conditional
    workflow.add_conditional_edges(
        "priority_router",
        should_continue_after_priority,
        {
            "problem_extractor": "problem_extractor",
            "paper_scout": "paper_scout",
            END: END
        }
    )
    
    # ============================================
    # EDGES: TIER 2 FLOW
    # ============================================
    
    # Problem Extractor → Debate Moderator
    workflow.add_edge("problem_extractor", "debate_moderator")
    
    # Debate Moderator → Conditional
    workflow.add_conditional_edges(
        "debate_moderator",
        should_continue_debate,
        {
            "real_world_validator": "real_world_validator",
            "paper_scout": "paper_scout",
            "END": END
        }
    )
    
    # Real-World Validator → Conditional
    workflow.add_conditional_edges(
        "real_world_validator",
        should_proceed_after_validation,
        {
            "code_generator": END,  # Temporarily end here (Tier 3 not implemented yet)
            "paper_scout": "paper_scout",
            "END": END
        }
    )
    
    logger.info("✅ Pipeline graph built successfully")
    
    return workflow


def compile_pipeline(checkpointer: bool = True) -> StateGraph:
    """
    Compile the pipeline graph with optional checkpointing.
    
    Args:
        checkpointer: Enable memory checkpointing for state persistence
    
    Returns:
        Compiled graph ready for execution
    """
    workflow = create_pipeline_graph()
    
    if checkpointer:
        # Memory checkpointer for state persistence
        memory = MemorySaver()
        compiled = workflow.compile(checkpointer=memory)
        logger.info("✅ Pipeline compiled with memory checkpointing")
    else:
        compiled = workflow.compile()
        logger.info("✅ Pipeline compiled without checkpointing")
    
    return compiled


# Export for easy import
__all__ = [
    "create_pipeline_graph",
    "compile_pipeline",
    "AgentState",
    "create_initial_state"
]
