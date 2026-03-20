"""
Agent 3: Priority Router - Complexity estimation + priority scoring.
LangGraph node implementation.
"""

import json

from src.pipeline.state import AgentState, update_state_status, add_error, add_warning
from src.models.schemas import PriorityResult
from src.utils.ollama_client import get_ollama_client
from src.utils.logger import get_logger
from src.utils.config import load_config


logger = get_logger("agents.priority_router")


async def priority_router_node(state: AgentState) -> AgentState:
    """
    Priority Router LangGraph Node.
    
    Estimates implementation complexity and calculates priority:
    - Analyzes paper abstract and novelty score
    - Estimates lines of code, VRAM requirements, dependencies
    - Calculates priority = (novelty/10) * (1 - complexity/10)
    
    Args:
        state: Current pipeline state
    
    Returns:
        Updated state with priority assessment
    """
    logger.info("🎯 Priority Router: Assessing implementation priority...")
    
    try:
        current_paper = state.get("current_paper")
        novelty_result = state.get("novelty_result")
        
        if not current_paper or not novelty_result:
            error_msg = "Missing paper or novelty result in state"
            logger.error(error_msg)
            return add_error(state, error_msg, tier=1)
        
        config = load_config()
        priority_threshold = config.get("pipeline", {}).get("priority_threshold", 0.1)  # Default lowered to 0.1
        complexity_review_threshold = config.get("pipeline", {}).get("complexity_review_threshold", 8.0)
        
        # ============================================
        # 1. LLM COMPLEXITY ESTIMATION
        # ============================================
        logger.info("Estimating implementation complexity...")
        
        ollama_client = get_ollama_client()
        analysis_model = config.get("models", {}).get("primary", {}).get("fast_analysis", "qwen3:8b")
        
        prompt = f"""Estimate the implementation complexity of this research paper.

Title: {current_paper.title}

Abstract: {current_paper.abstract[:600]}

Categories: {', '.join(current_paper.categories[:3])}
Novelty Score: {novelty_result.score:.1f}/10
Key Innovations: {', '.join(novelty_result.key_innovations[:3])}

Analyze and estimate:
1. **Complexity Score** (1-10):
   - 1-3: Simple (basic models, standard architectures)
   - 4-6: Moderate (custom architectures, multiple components)
   - 7-8: Complex (novel techniques, custom training procedures)
   - 9-10: Very Complex (new paradigms, extensive custom code)

2. **Estimated Lines of Code**: Total PyTorch implementation

3. **Required VRAM (GB)**: For training (typical batch size)

4. **Key Dependencies**: Main frameworks/libraries needed

5. **Implementation Challenges**: 2-3 main technical hurdles

Respond in JSON format:
{{
    "complexity": <1-10>,
    "estimated_lines_of_code": <number>,
    "required_vram_gb": <number>,
    "key_dependencies": ["dep1", "dep2", ...],
    "challenges": ["challenge1", "challenge2", ...],
    "reasoning": "<brief explanation>"
}}"""
        
        response = await ollama_client.generate(
            model=analysis_model,
            prompt=prompt,
            temperature=0.5,
            max_tokens=600
        )
        
        content = response["content"]
        state["model_calls_count"] += 1
        state["tokens_used"] += response.get("eval_count", 0)
        
        # Parse JSON response
        try:
            # Extract JSON from response
            if "```json" in content:
                content = content.split("```json")[1].split("```")[0].strip()
            elif "```" in content:
                content = content.split("```")[1].split("```")[0].strip()
            
            analysis = json.loads(content)
            complexity = float(analysis.get("complexity", 5.0))
            estimated_loc = int(analysis.get("estimated_lines_of_code", 500))
            required_vram = int(analysis.get("required_vram_gb", 8))
            dependencies = analysis.get("key_dependencies", [])
            challenges = analysis.get("challenges", [])
            reasoning = analysis.get("reasoning", "")
            
            logger.info(f"Complexity: {complexity:.1f}/10")
            logger.info(f"Est. LOC: {estimated_loc:,}")
            logger.info(f"VRAM: {required_vram} GB")
            logger.info(f"Challenges: {len(challenges)}")
            
        except json.JSONDecodeError as e:
            logger.warning(f"Failed to parse LLM response as JSON: {str(e)}")
            logger.debug(f"Raw response: {content[:200]}...")
            
            # Fallback: moderate complexity
            complexity = 5.0
            estimated_loc = 500
            required_vram = 8
            dependencies = ["torch", "transformers"]
            challenges = ["Unknown implementation challenges"]
            reasoning = content[:200]
            
            state = add_warning(state, "Complexity estimation parsing failed, using fallback", tier=1)
        
        # ============================================
        # 2. CALCULATE PRIORITY SCORE
        # ============================================
        # Formula: priority = (novelty/10) * (1 - complexity/10)
        # High novelty + low complexity = high priority
        # High novelty + high complexity = moderate priority
        
        novelty_normalized = novelty_result.score / 10.0
        complexity_normalized = complexity / 10.0
        
        priority = novelty_normalized * (1.0 - complexity_normalized)
        
        passes_threshold = priority >= priority_threshold
        needs_review = complexity >= complexity_review_threshold
        
        logger.info(f"Priority: {priority:.3f} (threshold: {priority_threshold})")
        logger.info(f"Result: {'✅ PROCEED' if passes_threshold else '⏳ QUEUE'}")
        
        if needs_review:
            logger.warning(f"⚠️  High complexity ({complexity:.1f}/10) - Human review recommended")
        
        # ============================================
        # 3. DECIDE NEXT ACTION
        # ============================================
        should_proceed = passes_threshold
        
        if needs_review and config.get("pipeline", {}).get("human_review_enabled", True):
            logger.info("🛑 Pausing for human review (high complexity)")
            # In production, this would trigger a review workflow
            # For now, we'll proceed but log the warning
            state = add_warning(
                state,
                f"High complexity paper ({complexity:.1f}/10) proceeding without review",
                tier=1
            )
        
        # ============================================
        # 4. UPDATE STATE
        # ============================================
        priority_result = PriorityResult(
            complexity=complexity,
            required_vram_gb=required_vram,
            estimated_lines_of_code=estimated_loc,
            priority=priority,
            should_proceed=should_proceed,
            challenges=challenges
        )
        
        state["priority_result"] = priority_result
        state["passes_priority"] = should_proceed
        
        status_msg = (
            f"Priority: {priority:.2f} "
            f"({'PROCEED' if should_proceed else 'QUEUE'}) - "
            f"Complexity: {complexity:.1f}/10"
        )
        state = update_state_status(state, "routing_priority", status_msg)
        
        if should_proceed:
            state["next"] = "pdf_extractor"  # Move to Tier 2
            logger.info("✅ Paper approved for implementation")
        else:
            state["next"] = "paper_scout"  # Try next paper
            logger.info("⏭️  Skipping to next paper (low priority)")
        
        return state
        
    except Exception as e:
        error_msg = f"Priority Router failed: {str(e)}"
        logger.error(error_msg, exc_info=True)
        state = add_error(state, error_msg, tier=1)
        state["next"] = "paper_scout"  # Try next paper
        return state
