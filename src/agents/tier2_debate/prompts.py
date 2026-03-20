"""
Centralized prompts for the debate system.
All LLM prompts in one place for easy review and modification.
"""

def get_solution_generator_prompt(problem, iteration: int, previous_critique: str = None) -> str:
    """Generate prompt for solution generation."""
    
    base_prompt = f"""You are an AI research expert. Generate 3 NOVEL solutions to this problem.

PROBLEM DOMAIN: {problem.domain}
CHALLENGE: {problem.challenge}

Current State-of-the-Art:
{chr(10).join(f"- {sol}" for sol in problem.current_solutions) if problem.current_solutions else "- No existing solutions documented"}

Known Limitations:
{chr(10).join(f"- {lim}" for lim in problem.limitations)}

Requirements:
{chr(10).join(f"- {req}" for req in problem.requirements) if problem.requirements else "- To be determined"}"""

    if previous_critique:
        base_prompt += f"\n\nPREVIOUS CRITIQUE:\n{previous_critique}\n\nAddress these concerns in your new solutions."
    
    base_prompt += """

Generate 3 NOVEL solutions that are technically sound and implementable.

CRITICAL OUTPUT REQUIREMENTS:
- Your response MUST start with [ and end with ]
- NO text before the JSON array
- NO text after the JSON array
- NO markdown code blocks (no ```)
- NO explanations or preambles

JSON Format (output exactly 3 solutions):
[
  {
    "approach_name": "Descriptive name of the approach",
    "key_innovation": "What makes this solution novel and different",
    "architecture_design": "High-level technical architecture",
    "implementation_plan": ["concrete step 1", "concrete step 2", "concrete step 3"],
    "expected_advantages": ["advantage 1", "advantage 2"],
    "potential_challenges": ["challenge 1", "challenge 2"],
    "expected_performance": "Quantifiable expected results (accuracy, speed, etc)"
  }
]

Remember: Start with [ and end with ]. Nothing else."""

    return base_prompt


def get_expert_critic_prompt(solution, problem) -> str:
    """Generate prompt for solution critique."""
    
    return f"""You are a senior AI researcher conducting peer review. Be thorough and critical.

PROBLEM:
{problem.challenge}

Limitations of Current Solutions:
{chr(10).join(f"- {lim}" for lim in problem.limitations)}

PROPOSED SOLUTION:
Name: {solution.approach_name}
Innovation: {solution.key_innovation}
Architecture: {solution.architecture_design}
Implementation Plan: {', '.join(solution.implementation_plan) if isinstance(solution.implementation_plan, list) else solution.implementation_plan}
Expected Advantages: {', '.join(solution.expected_advantages)}

EVALUATE THESE ASPECTS:
1. Technical Soundness: Is the approach theoretically valid?
2. Novelty: Is this truly different from existing work?
3. Feasibility: Can this be implemented in PyTorch realistically?
4. Computational Efficiency: What's the actual complexity?
5. Scalability: Will this work on large datasets?
6. Real-world Applicability: Is this practical for production use?

Be harsh but constructive. Find the flaws and suggest improvements.

CRITICAL OUTPUT REQUIREMENTS:
- Your response MUST start with {{ and end with }}
- NO text before the JSON object
- NO text after the JSON object
- NO markdown code blocks
- NO preambles like "As an expert..." or "Here's my assessment..."

JSON Format (output exactly this structure):
{{
  "overall_assessment": "promising|needs-work|flawed",
  "strengths": ["strength 1", "strength 2", "strength 3"],
  "weaknesses": ["weakness 1", "weakness 2"],
  "technical_concerns": ["concern 1", "concern 2"],
  "missing_considerations": ["missing aspect 1", "missing aspect 2"],
  "real_world_feasibility": 7.5,
  "optimization_suggestions": ["suggestion 1", "suggestion 2"],
  "verdict": "accept|revise|reject"
}}

Remember: Start with {{ and end with }}. Nothing else."""


def get_realworld_validator_prompt(solution, problem) -> str:
    """Generate prompt for real-world validation."""
    
    return f"""You are a senior ML engineer evaluating solution feasibility for production deployment.

PROBLEM: {problem.challenge}

PROPOSED SOLUTION:
{solution.approach_name}

Innovation: {solution.key_innovation}
Architecture: {solution.architecture_design}
Implementation: {', '.join(solution.implementation_plan) if isinstance(solution.implementation_plan, list) else solution.implementation_plan}

VALIDATE FOR REAL-WORLD DEPLOYMENT:
1. Can this be implemented with existing frameworks (PyTorch/TensorFlow)?
2. What are the computational resource requirements (GPU memory, training time)?
3. Will this scale to production workloads (batch processing, latency)?
4. Are there any showstoppers (hardware limitations, numerical instability)?
5. How maintainable is this solution?

CRITICAL OUTPUT REQUIREMENTS:
- Start with {{ and end with }}
- NO text before or after JSON
- NO markdown blocks

JSON Format:
{{
  "is_feasible": true,
  "feasibility_score": 8.5,
  "implementation_complexity": "low|medium|high",
  "resource_requirements": "Description of compute/memory needs",
  "scaling_potential": "Description of how this scales",
  "risks": ["risk 1", "risk 2"],
  "recommendations": ["recommendation 1", "recommendation 2"],
  "estimated_implementation_time": "X weeks"
}}

Output JSON only."""


def get_web_search_query_prompt(idea: str) -> str:
    """Generate search queries for current research on a topic."""
    
    return f"""Given this research idea, generate 3-5 search queries to find:
1. Recent papers (2023-2025)
2. State-of-the-art methods
3. Open problems and limitations
4. Available datasets and benchmarks

Research Idea: {idea}

Output format (no other text):
{{
  "queries": [
    "search query 1",
    "search query 2",
    "search query 3"
  ],
  "arxiv_categories": ["cs.AI", "cs.LG"],
  "key_terms": ["term1", "term2"]
}}"""
