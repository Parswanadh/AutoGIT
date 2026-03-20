"""
LangGraph Integration Nodes for Single-Model Multi-Agent System.

This module integrates:
1. SequentialAgentOrchestrator (6 specialized personas with qwen3:4b)
2. HierarchicalMemory (learn from past debates)
3. ToolRegistry (external knowledge access)

Mapping:
- Existing 3 perspectives → 6 specialized personas:
  - ML Researcher → researcher + ml_theorist
  - Systems Engineer → systems_engineer + code_reviewer
  - Applied Scientist → applied_scientist + architect
"""

import asyncio
import logging
from typing import Dict, Any, List, Optional
from datetime import datetime

from langchain_core.messages import SystemMessage, HumanMessage
from langchain_ollama import ChatOllama

from .state import AutoGITState
from .nodes import extract_json_from_text
from ..agents.sequential_orchestrator import (
    SequentialAgentOrchestrator,
    create_orchestrator,
    CritiqueResult,
    ConsensusResult
)
from ..agents.memory.hierarchical_memory import get_memory, Episode
from ..agents.tools.tool_registry import get_tool_registry
from ..utils.logger import get_logger

logger = logging.getLogger(__name__)


# ============================================
# Integration Node 1: Memory Retrieval
# ============================================

async def memory_retrieval_node(state: AutoGITState) -> Dict[str, Any]:
    """
    Node 1.5: Retrieve relevant past experiences from memory.

    This should run AFTER research but BEFORE problem extraction.
    It provides context from past debates to improve problem identification.
    """
    logger.info("🧠 Memory Retrieval Node")

    try:
        memory = get_memory()

        # Build problem context for similarity search
        problem_context = {
            "domain": state.get("idea", ""),
            "challenge": state.get("idea", ""),
            "current_solutions": state.get("research_context", {}).get("papers", [])[:3]
        }

        # Retrieve similar episodes
        similar_episodes = await memory.retrieve_relevant(
            problem=problem_context,
            top_k=5,
            min_similarity=0.3
        )

        # Get applicable skills
        skills = await memory.get_applicable_skills(problem_context)

        logger.info(f"  Retrieved {len(similar_episodes)} similar episodes")
        logger.info(f"  Found {len(skills)} applicable skills")

        # Format memory context for downstream nodes
        memory_context = {
            "similar_episodes": [
                {
                    "episode_id": ep.episode_id,
                    "problem": ep.problem,
                    "solution_summary": ep.solution[:200] if ep.solution else "",
                    "outcome": ep.outcome,
                    "quality_score": ep.quality_score
                }
                for ep in similar_episodes
            ],
            "applicable_skills": [
                {
                    "name": skill.name,
                    "description": skill.description,
                    "success_rate": skill.success_rate
                }
                for skill in skills
            ],
            "statistics": memory.get_statistics()
        }

        return {
            "current_stage": "memory_retrieved",
            "memory_context": memory_context
        }

    except Exception as e:
        logger.warning(f"Memory retrieval failed (continuing without): {e}")
        return {
            "current_stage": "memory_retrieval_failed",
            "memory_context": None
        }


# ============================================
# Integration Node 2: Enhanced Research
# ============================================

async def enhanced_research_node(state: AutoGITState) -> Dict[str, Any]:
    """
    Node 1 (Enhanced): Research using ToolRegistry.

    Uses ToolRegistry instead of basic ResearchSearcher.
    Provides access to arXiv, GitHub, PapersWithCode, datasets.
    """
    logger.info("🔍 Enhanced Research Node (with ToolRegistry)")

    try:
        registry = get_tool_registry()

        idea = state.get("idea", "")
        if not idea:
            return {
                "current_stage": "research_failed",
                "research_context": None,
                "errors": ["No idea provided"]
            }

        # Parallel tool calls for research
        logger.info("  Executing research tools in parallel...")

        parallel_calls = {
            "arxiv_search": {
                "query": idea,
                "categories": ["cs.AI", "cs.CL", "cs.CV", "cs.LG"],
                "max_results": 10
            },
            "github_search": {
                "query": idea,
                "language": "python",
                "max_results": 5
            }
        }

        # Execute tools in parallel
        results = await registry.call_tools_parallel(parallel_calls)

        # Format results
        papers = []
        if results.get("arxiv_search") and results["arxiv_search"].success:
            papers = results["arxiv_search"].data
            logger.info(f"  [arXiv] Found {len(papers)} papers")

        repos = []
        if results.get("github_search") and results["github_search"].success:
            repos = results["github_search"].data
            logger.info(f"  [GitHub] Found {len(repos)} repos")

        # Build research context
        research_context = {
            "papers": [
                {
                    "title": p.get("title", ""),
                    "abstract": p.get("abstract", ""),
                    "authors": p.get("authors", []),
                    "published": p.get("published", ""),
                    "url": p.get("url", "")
                }
                for p in papers
            ],
            "implementations": [
                {
                    "name": r.get("name", ""),
                    "description": r.get("description", ""),
                    "stars": r.get("stars", 0),
                    "url": r.get("url", "")
                }
                for r in repos
            ],
            "tool_execution_times": {
                name: result.execution_time
                for name, result in results.items()
                if result.success
            }
        }

        logger.info(f"✅ Enhanced research complete: {len(papers)} papers, {len(repos)} repos")

        return {
            "current_stage": "research_complete",
            "research_context": research_context
        }

    except Exception as e:
        logger.error(f"Enhanced research failed: {e}")
        return {
            "current_stage": "research_failed",
            "research_context": None,
            "errors": [f"Research failed: {str(e)}"]
        }


# ============================================
# Integration Node 3: Persona Solution Generation
# ============================================

async def persona_solution_generation_node(state: AutoGITState) -> Dict[str, Any]:
    """
    Node 3 (Enhanced): Generate solutions using 6 specialized personas.

    Uses SequentialAgentOrchestrator instead of basic ChatOllama.
    Provides 2x more diverse perspectives (6 vs 3).
    """
    logger.info(f"💡 Persona Solution Generation Node (Round {state['current_round'] + 1})")

    try:
        orchestrator = create_orchestrator()

        problem = state.get("selected_problem", state.get("idea", ""))

        # Map existing perspectives to our 6 personas
        persona_mapping = {
            "ml_researcher": ["researcher", "ml_theorist"],
            "systems_engineer": ["systems_engineer", "code_reviewer"],
            "applied_scientist": ["applied_scientist", "architect"]
        }

        # Use original 3 perspectives for compatibility, but expand to 6 personas
        proposals = []

        for perspective_name in state.get("perspectives", ["ml_researcher", "systems_engineer", "applied_scientist"]):
            # Get the personas for this perspective
            personas = persona_mapping.get(perspective_name, ["architect"])

            for persona in personas:
                logger.info(f"  🧠 {persona}: Proposing solution...")

                # Generate solution using orchestrator
                result = await orchestrator.execute_with_persona(
                    task=f"""Generate a solution for this research problem:

Problem: {problem}

Research context: {state.get('research_context', {})}

Generate a comprehensive solution proposal with:
1. Approach name
2. Key innovation
3. Architecture design
4. Implementation plan
5. Expected advantages
6. Potential challenges

Return your response as structured JSON with these fields:
- approach_name: string
- key_innovation: string
- architecture_design: string
- implementation_plan: array of strings
- expected_advantages: array of strings
- potential_challenges: array of strings
- novelty_score: float (0-1)
- feasibility_score: float (0-1)""",
                    persona=persona,
                    temperature=0.8
                )

                # Parse result
                content = result.get("content", "")
                solution_json = extract_json_from_text(content)

                if solution_json and isinstance(solution_json, dict):
                    proposal = {
                        "approach_name": solution_json.get("approach_name", f"{persona.title()} Approach"),
                        "perspective": persona,
                        "key_innovation": solution_json.get("key_innovation", ""),
                        "architecture_design": solution_json.get("architecture_design", ""),
                        "implementation_plan": solution_json.get("implementation_plan", []),
                        "expected_advantages": solution_json.get("expected_advantages", []),
                        "potential_challenges": solution_json.get("potential_challenges", []),
                        "novelty_score": float(solution_json.get("novelty_score", 0.5)),
                        "feasibility_score": float(solution_json.get("feasibility_score", 0.5))
                    }
                    proposals.append(proposal)
                    logger.info(f"    ✅ Generated: {proposal['approach_name']}")

        logger.info(f"✅ Generated {len(proposals)} solutions from 6 personas")

        return {
            "current_stage": "solutions_generated",
            "current_round": state["current_round"] + 1,
            "debate_rounds": [{
                "round_number": state["current_round"] + 1,
                "proposals": proposals,
                "critiques": [],
                "consensus_reached": False,
                "round_summary": f"Generated {len(proposals)} proposals from 6 personas"
            }]
        }

    except Exception as e:
        logger.error(f"Persona solution generation failed: {e}")
        import traceback
        traceback.print_exc()
        return {
            "current_stage": "solution_generation_failed",
            "errors": [f"Solution generation failed: {str(e)}"]
        }


# ============================================
# Integration Node 4: Persona Critique
# ============================================

async def persona_critique_node(state: AutoGITState) -> Dict[str, Any]:
    """
    Node 4 (Enhanced): Critique from 4 specialized perspectives.

    Uses SequentialAgentOrchestrator's weighted critique system.
    Produces structured PersonaCritique objects for consensus building.
    """
    logger.info("🔍 Persona Critique Node: Multi-perspective review")

    try:
        orchestrator = create_orchestrator()

        # Get current round's proposals
        current_round = state["debate_rounds"][-1]
        proposals = current_round["proposals"]

        # Build problem statement
        problem = state.get("selected_problem", state.get("idea", ""))

        # Combine all proposals for comprehensive critique
        solutions_text = "\n\n".join([
            f"Proposal {i+1}: {p['approach_name']}\n"
            f"Innovation: {p['key_innovation']}\n"
            f"Architecture: {p['architecture_design']}\n"
            f"Plan: {', '.join(p.get('implementation_plan', [])[:3])}"
            for i, p in enumerate(proposals)
        ])

        all_critiques = []

        # Critique from 4 specialized personas
        critique_personas = ["ml_theorist", "systems_engineer", "applied_scientist", "code_reviewer"]

        for persona in critique_personas:
            logger.info(f"  🔍 {persona}: Reviewing proposals...")

            result = await orchestrator.execute_with_persona(
                task=f"""Review these solution proposals:

PROBLEM: {problem}

PROPOSALS:
{solutions_text}

Provide a comprehensive critique from your perspective as {persona}.

For EACH proposal, provide:
1. Score (0-10)
2. Strengths (what's good)
3. Weaknesses (what needs improvement)
4. Specific suggestions

Format your response as JSON:
{{
  "critiques": [
    {{
      "proposal_name": "Proposal name",
      "score": 8.5,
      "strengths": ["strength1", "strength2"],
      "weaknesses": ["weakness1", "weakness2"],
      "suggestions": ["suggestion1"]
    }}
  ],
  "overall_assessment": "your overall view of all proposals"
}}""",
                persona=persona,
                temperature=0.3
            )

            # Parse critique
            content = result.get("content", "")
            critique_json = extract_json_from_text(content)

            if critique_json and isinstance(critique_json, dict):
                critiques_list = critique_json.get("critiques", [])

                for crit in critiques_list:
                    # Map to LangGraph Critique format
                    all_critiques.append({
                        "solution_id": crit.get("proposal_name", ""),
                        "reviewer_perspective": persona,
                        "overall_assessment": "promising" if crit.get("score", 0) >= 7 else "needs-work",
                        "strengths": crit.get("strengths", []),
                        "weaknesses": crit.get("weaknesses", []),
                        "specific_concerns": crit.get("suggestions", []),
                        "improvement_suggestions": crit.get("suggestions", []),
                        "feasibility_score": crit.get("score", 5) / 10,
                        "recommendation": "accept" if crit.get("score", 0) >= 8 else "revise" if crit.get("score", 0) >= 5 else "reject"
                    })

        logger.info(f"✅ Generated {len(all_critiques)} critiques")

        # Update current round with critiques
        updated_round = current_round.copy()
        updated_round["critiques"] = all_critiques
        updated_round["round_summary"] = f"{len(proposals)} proposals, {len(all_critiques)} critiques"

        # Return updated round (will be appended to debate_rounds by operator.add)
        # Note: This creates a duplicate entry, but weighted_consensus_node looks at [-1]
        return {
            "current_stage": "critiques_complete",
            "debate_rounds": [updated_round]
        }

    except Exception as e:
        logger.error(f"Persona critique failed: {e}")
        import traceback
        traceback.print_exc()
        return {
            "current_stage": "critique_failed",
            "errors": [f"Critique failed: {str(e)}"]
        }


# ============================================
# Integration Node 5: Weighted Consensus
# ============================================

async def weighted_consensus_node(state: AutoGITState) -> Dict[str, Any]:
    """
    Node 5 (Enhanced): Calculate weighted consensus.

    Uses SequentialAgentOrchestrator's consensus building system.
    Provides more sophisticated consensus scoring than simple "accept" count.
    """
    logger.info("⚖️  Weighted Consensus Node")

    try:
        orchestrator = create_orchestrator()

        # Get current round's critiques
        current_round = state["debate_rounds"][-1]
        critiques = current_round["critiques"]

        if not critiques:
            logger.warning("No critiques available")
            return {
                "current_stage": "continue_debate"
            }

        # Group critiques by proposal
        proposal_critiques = {}
        for critique in critiques:
            proposal_id = critique["solution_id"]
            if proposal_id not in proposal_critiques:
                proposal_critiques[proposal_id] = []
            proposal_critiques[proposal_id].append(critique)

        # Calculate weighted scores for each proposal
        # Persona weights based on expertise
        persona_weights = {
            "ml_theorist": 0.25,
            "systems_engineer": 0.25,
            "applied_scientist": 0.25,
            "code_reviewer": 0.25
        }

        proposal_scores = {}
        for proposal_id, crits in proposal_critiques.items():
            weighted_score = 0.0
            for crit in crits:
                persona = crit["reviewer_perspective"]
                weight = persona_weights.get(persona, 0.25)
                score = crit.get("feasibility_score", 0.5) * 10  # Convert to 0-10 scale
                weighted_score += score * weight

            proposal_scores[proposal_id] = weighted_score

        # Find best proposal
        best_proposal = max(proposal_scores.items(), key=lambda x: x[1])
        best_score = best_proposal[1]

        # Calculate overall consensus (agreement level)
        scores = list(proposal_scores.values())
        if len(scores) > 1:
            disagreement = max(scores) - min(scores)
            confidence = 1.0 - (disagreement / 10.0)
        else:
            disagreement = 0.0
            confidence = 1.0

        # Check if consensus reached
        min_consensus = state.get("min_consensus_score", 0.7)
        consensus_reached = (
            best_score >= (min_consensus * 10) and  # Convert to 0-10 scale
            confidence >= min_consensus
        )

        max_rounds_reached = state.get("current_round", 0) >= state.get("max_debate_rounds", 3)

        logger.info(f"  Best proposal: {best_proposal[0]} (score: {best_score:.2f}/10)")
        logger.info(f"  Confidence: {confidence:.2f}")
        logger.info(f"  Consensus: {consensus_reached}")

        if consensus_reached:
            logger.info("✅ Weighted consensus reached!")
            return {
                "current_stage": "consensus_reached",
                "weighted_consensus": {
                    "best_proposal": best_proposal[0],
                    "score": best_score,
                    "confidence": confidence
                }
            }
        elif max_rounds_reached:
            logger.info("⚠️  Max rounds reached, forcing selection")
            return {
                "current_stage": "max_rounds_reached",
                "weighted_consensus": {
                    "best_proposal": best_proposal[0],
                    "score": best_score,
                    "confidence": confidence
                }
            }
        else:
            logger.info("🔄 Continue debate")
            return {
                "current_stage": "continue_debate",
                "weighted_consensus": {
                    "best_proposal": best_proposal[0],
                    "score": best_score,
                    "confidence": confidence
                }
            }

    except Exception as e:
        logger.error(f"Weighted consensus failed: {e}")
        import traceback
        traceback.print_exc()
        return {
            "current_stage": "consensus_failed",
            "errors": [f"Consensus calculation failed: {str(e)}"]
        }


# ============================================
# Integration Node 6: Store Experience
# ============================================

async def store_experience_node(state: AutoGITState) -> Dict[str, Any]:
    """
    Node 6.5: Store the debate experience in hierarchical memory.

    Runs after solution selection to learn from this debate.
    """
    logger.info("💾 Store Experience Node")

    try:
        memory = get_memory()

        # Get solution and critiques
        final_solution = state.get("final_solution", {})
        all_critiques = []
        for round_data in state.get("debate_rounds", []):
            all_critiques.extend(round_data.get("critiques", []))

        # Build problem structure
        problem = {
            "domain": state.get("idea", "")[:50],
            "challenge": state.get("selected_problem", state.get("idea", "")),
            "current_solutions": [
                p.get("title", "")[:100]
                for p in state.get("research_context", {}).get("papers", [])[:3]
            ]
        }

        # Format solution
        solution_text = f"""
Approach: {final_solution.get('approach_name', 'Unknown')}
Innovation: {final_solution.get('key_innovation', '')}
Architecture: {final_solution.get('architecture_design', '')}
"""

        # Format critiques
        formatted_critiques = [
            {
                "persona": c.get("reviewer_perspective", "unknown"),
                "content": f"Assessment: {c.get('overall_assessment', '')}\n"
                          f"Strengths: {', '.join(c.get('strengths', []))}\n"
                          f"Weaknesses: {', '.join(c.get('weaknesses', []))}",
                "score": c.get("feasibility_score", 0.5) * 10
            }
            for c in all_critiques[:10]  # Limit to 10 critiques
        ]

        # Calculate consensus
        weighted_consensus = state.get("weighted_consensus", {})
        consensus = {
            "weighted_score": weighted_consensus.get("score", 7.0),
            "confidence": weighted_consensus.get("confidence", 0.7),
            "disagreement": 1.0 - weighted_consensus.get("confidence", 0.7)
        }

        # Determine outcome
        weighted_score = consensus["weighted_score"]
        if weighted_score >= 8.0:
            outcome = "success"
        elif weighted_score >= 6.0:
            outcome = "partial"
        else:
            outcome = "failed"

        # Store in memory
        episode_id = await memory.remember_debate(
            problem=problem,
            solution=solution_text,
            critiques=formatted_critiques,
            consensus=consensus,
            outcome=outcome,
            quality_score=weighted_score,
            tokens_used=state.get("total_tokens", 5000),
            latency_seconds=state.get("total_latency", 120.0)
        )

        logger.info(f"✅ Experience stored: {episode_id}")

        # Get updated statistics
        stats = memory.get_statistics()
        logger.info(f"  Memory: {stats['total_episodes']} episodes, {stats['success_rate']:.1%} success rate")

        return {
            "current_stage": "experience_stored",
            "episode_id": episode_id,
            "memory_stats": stats
        }

    except Exception as e:
        logger.warning(f"Failed to store experience (non-critical): {e}")
        return {
            "current_stage": "experience_store_failed"
        }


# ============================================
# Helper: Map existing nodes to integrated versions
# ============================================

INTEGRATED_NODE_MAPPING = {
    "research": enhanced_research_node,
    "memory_retrieval": memory_retrieval_node,
    "solution_generation": persona_solution_generation_node,
    "critique": persona_critique_node,
    "consensus_check": weighted_consensus_node,
    "store_experience": store_experience_node
}


def get_integrated_node(node_name: str):
    """Get integrated node by name, or None if not integrated."""
    return INTEGRATED_NODE_MAPPING.get(node_name)


def list_integrated_nodes() -> List[str]:
    """List all available integrated nodes."""
    return list(INTEGRATED_NODE_MAPPING.keys())
