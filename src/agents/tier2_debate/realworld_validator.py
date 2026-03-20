"""
Real-World Validator Agent
Validates solution feasibility in real-world scenarios.
"""

import json
from typing import Dict, Any

from src.models.schemas import FinalSolution, ValidationResult, ProblemStatement
from src.utils.logger import get_logger
from src.utils.ollama_client import get_ollama_client
from src.pipeline.state import AgentState, update_state_status

logger = get_logger("realworld_validator")


async def validate_solution(
    solution: FinalSolution,
    problem: ProblemStatement
) -> ValidationResult:
    """
    Validate solution against real-world constraints.
    
    Args:
        solution: Final solution to validate
        problem: Original problem
    
    Returns:
        ValidationResult with feasibility checks
    """
    logger.info("🔬 Validating real-world feasibility...")
    
    client = get_ollama_client()
    
    prompt = f"""You are a pragmatic ML engineer evaluating if this solution can be implemented.

PROBLEM:
{problem.challenge}

Datasets Required: {', '.join(problem.datasets) if problem.datasets else 'TBD'}
Metrics: {', '.join(problem.metrics) if problem.metrics else 'TBD'}

PROPOSED SOLUTION:
{solution.solution.approach_name}

Architecture: {solution.solution.architecture_design}
Implementation Plan: {solution.solution.implementation_plan}

CHECK FEASIBILITY:

1. Hardware:
   - GPU memory needed (estimate GB)
   - Can run on single RTX 3090/4090? (24GB VRAM)
   - Training time reasonable? (<48 hours)
   - Inference speed practical?

2. Datasets:
   - Are datasets publicly available?
   - Licenses compatible?
   - Size manageable? (<100GB)

3. Implementation:
   - Can code in <2000 lines?
   - All dependencies in PyPI?
   - No exotic requirements?

4. Reproducibility:
   - Deterministic?
   - Hyperparameters clear?
   - Stable training?

Output ONLY valid JSON:
{{
  "is_feasible": true/false,
  "feasibility_score": 8.5,
  "hardware_check": {{
    "gpu_memory_ok": true,
    "training_time_ok": true,
    "inference_speed_ok": true
  }},
  "dataset_check": {{
    "publicly_available": true,
    "license_ok": true,
    "size_manageable": true
  }},
  "implementation_check": {{
    "code_complexity_ok": true,
    "dependencies_ok": true,
    "no_exotic_requirements": true
  }},
  "blocking_issues": [],
  "warnings": ["warning1"],
  "recommendations": ["rec1", "rec2"]
}}"""

    try:
        response = await client.generate(
            model="qwen3:8b",  # Fast practical assessment
            prompt=prompt,
            temperature=0.2  # Low - we want realistic assessment
        )
        
        content = response.get("content", response.get("response", ""))
        
        # Parse JSON
        try:
            if "```json" in content:
                content = content.split("```json")[1].split("```")[0].strip()
            elif "```" in content:
                content = content.split("```")[1].split("```")[0].strip()
            
            validation_data = json.loads(content)
            validation = ValidationResult(**validation_data)
            
            logger.info(f"  Feasible: {'✅ YES' if validation.is_feasible else '❌ NO'}")
            logger.info(f"  Score: {validation.feasibility_score:.1f}/10")
            
            if validation.blocking_issues:
                logger.warning(f"  Blocking Issues: {len(validation.blocking_issues)}")
                for issue in validation.blocking_issues[:3]:
                    logger.warning(f"    - {issue}")
            
            if validation.warnings:
                logger.info(f"  Warnings: {len(validation.warnings)}")
            
            return validation
            
        except json.JSONDecodeError as e:
            logger.error(f"Failed to parse validation: {e}")
            logger.debug(f"Raw response: {content[:500]}...")
            
            # Conservative fallback
            return ValidationResult(
                is_feasible=False,
                feasibility_score=5.0,
                hardware_check={},
                dataset_check={},
                implementation_check={},
                blocking_issues=["Could not parse validation response"],
                warnings=[],
                recommendations=["Retry validation"]
            )
        
    except Exception as e:
        logger.error(f"Validation failed: {e}")
        return ValidationResult(
            is_feasible=False,
            feasibility_score=0.0,
            hardware_check={},
            dataset_check={},
            implementation_check={},
            blocking_issues=[str(e)],
            warnings=[],
            recommendations=[]
        )


async def realworld_validator_node(state: AgentState) -> AgentState:
    """
    LangGraph node for real-world validation.
    
    Args:
        state: Pipeline state
    
    Returns:
        Updated state with validation_result
    """
    final_solution = state.get("final_solution")
    problem = state.get("problem_statement")
    
    if not final_solution or not problem:
        logger.error("Missing final_solution or problem in state")
        return state
    
    logger.info("🔬 Real-World Validator: Checking feasibility...")
    
    validation = await validate_solution(final_solution, problem)
    
    state["validation_result"] = validation
    state["passes_validation"] = validation.is_feasible and validation.feasibility_score >= 6.0
    
    if state["passes_validation"]:
        state = update_state_status(state, "validated_ready_for_code", f"Solution validated (score: {validation.feasibility_score:.1f}/10)")
        logger.info("✅ Solution validated - ready for implementation!")
    else:
        logger.warning(f"⚠️  Solution failed validation (score: {validation.feasibility_score:.1f}/10)")
    
    return state


def should_proceed_after_validation(state: AgentState) -> str:
    """
    Conditional edge after validation.
    
    Args:
        state: Pipeline state
    
    Returns:
        Next node name
    """
    if state.get("passes_validation", False):
        return "code_generator"  # Proceed to Tier 3
    else:
        # Check if more papers available
        if state.get("discovered_papers", []):
            logger.info("Validation failed - trying next paper")
            return "paper_scout"
        else:
            return "END"
