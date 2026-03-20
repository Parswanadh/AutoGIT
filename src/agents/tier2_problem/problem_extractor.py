"""
Problem Statement Extractor Agent
Extracts structured problem statements from research papers.
"""

import json
from typing import Dict, Any

from src.models.schemas import PaperMetadata, ProblemStatement
from src.utils.logger import get_logger
from src.utils.ollama_client import get_ollama_client
from src.pipeline.state import AgentState, update_state_status, add_warning

logger = get_logger("problem_extractor")


async def problem_extractor_node(state: AgentState) -> AgentState:
    """
    Extract structured problem statement from paper.
    
    LangGraph Node Function.
    
    Args:
        state: Current pipeline state
    
    Returns:
        Updated state with problem_statement
    """
    logger.info("🎯 Problem Extractor: Analyzing paper...")
    
    paper = state.get("current_paper")
    if not paper:
        logger.error("No current paper in state")
        return state
    
    client = get_ollama_client()
    
    # Build prompt for problem extraction
    prompt = f"""You are an expert research analyst. Extract the core problem statement from this research paper.

Paper Title: {paper.title}
Abstract: {paper.abstract}

Analyze and extract:
1. Domain: What field is this? (Computer Vision, NLP, RL, etc.)
2. Challenge: What core problem is being addressed?
3. Current Solutions: What existing approaches are mentioned?
4. Limitations: Why do current solutions fall short?
5. Datasets: What benchmarks/datasets are used?
6. Metrics: How is success measured?
7. Requirements: What's needed to solve this?
8. Paper's Solution: How does THIS paper solve it?

Output ONLY valid JSON with this structure:
{{
  "domain": "string",
  "challenge": "string",
  "current_solutions": ["solution1", "solution2"],
  "limitations": ["limitation1", "limitation2"],
  "datasets": ["dataset1", "dataset2"],
  "metrics": ["metric1", "metric2"],
  "requirements": ["req1", "req2"],
  "paper_solution": "string"
}}"""

    try:
        # Generate problem analysis
        response = await client.generate(
            model="qwen3:8b",  # Reasoning model (GPU efficient)
            prompt=prompt,
            temperature=0.3  # Lower temperature for extraction
        )
        
        content = response.get("content", response.get("response", ""))
        
        # Parse JSON response
        try:
            # Clean markdown code blocks
            if "```json" in content:
                content = content.split("```json")[1].split("```")[0].strip()
            elif "```" in content:
                content = content.split("```")[1].split("```")[0].strip()
            
            problem_data = json.loads(content)
            
            # Create ProblemStatement object
            problem_statement = ProblemStatement(**problem_data)
            
            logger.info(f"✅ Problem extracted: {problem_statement.domain}")
            logger.info(f"   Challenge: {problem_statement.challenge[:100]}...")
            logger.info(f"   Solutions found: {len(problem_statement.current_solutions)}")
            logger.info(f"   Limitations identified: {len(problem_statement.limitations)}")
            
            # Update state
            state["problem_statement"] = problem_statement
            state = update_state_status(state, "problem_extracted", "Problem statement extracted successfully")
            
        except json.JSONDecodeError as e:
            logger.warning(f"Failed to parse LLM response as JSON: {e}")
            logger.debug(f"Raw response: {content[:500]}...")
            
            # Fallback: create basic problem statement from abstract
            problem_statement = ProblemStatement(
                domain="Unknown",
                challenge=paper.abstract[:200],
                current_solutions=[],
                limitations=[],
                datasets=[],
                metrics=[],
                requirements=[],
                paper_solution="See paper for details"
            )
            
            state["problem_statement"] = problem_statement
            state = add_warning(state, "Problem extraction incomplete - using fallback", tier=2)
        
        return state
        
    except Exception as e:
        logger.error(f"Problem extraction failed: {e}")
        state = add_warning(state, f"Problem extraction failed: {str(e)}", tier=2)
        return state


def get_problem_statement(state: AgentState) -> ProblemStatement:
    """
    Helper function to get problem statement from state.
    
    Args:
        state: Pipeline state
    
    Returns:
        ProblemStatement object or None
    """
    return state.get("problem_statement")
