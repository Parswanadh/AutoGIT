"""
Robust JSON parsing utilities for LLM outputs.
Handles various formats: markdown blocks, text preambles, malformed JSON, etc.
"""

import json
import re
import logging
from typing import Optional, Union, Dict, List, Any

logger = logging.getLogger(__name__)


def extract_json_from_text(text: str, expected_type: str = "auto") -> Optional[Union[Dict, List]]:
    """
    Robustly extract JSON from text that may contain markdown, preambles, or other noise.
    
    Args:
        text: Raw text that should contain JSON
        expected_type: "object" for {}, "array" for [], "auto" to detect
    
    Returns:
        Parsed JSON object/array, or None if extraction fails
    """
    if not text or not text.strip():
        logger.error("Empty text provided to JSON extractor")
        return None
    
    original_text = text
    
    # Step 1: Remove markdown code blocks
    if "```json" in text:
        logger.debug("Found ```json markdown block")
        try:
            text = text.split("```json")[1].split("```")[0].strip()
        except IndexError:
            logger.warning("Malformed ```json block")
    elif "```" in text:
        logger.debug("Found ``` markdown block")
        try:
            text = text.split("```")[1].split("```")[0].strip()
        except IndexError:
            logger.warning("Malformed ``` block")
    
    # Step 2: Try direct parse (if it's already clean JSON)
    text = text.strip()
    if text and (text[0] in ['{', '[']) and (text[-1] in ['}', ']']):
        try:
            result = json.loads(text)
            logger.debug(f"Successfully parsed clean JSON ({type(result).__name__})")
            return result
        except json.JSONDecodeError as e:
            logger.debug(f"Direct parse failed: {e}")
    
    # Step 3: Extract JSON using regex (handles text before/after)
    if expected_type == "array" or (expected_type == "auto" and "[" in text):
        # Try to extract array
        pattern = r'\[(?:[^\[\]]|\[[^\[\]]*\])*\]'
        matches = re.findall(pattern, text, re.DOTALL)
        
        if matches:
            # Try longest match first (most likely to be complete)
            for match in sorted(matches, key=len, reverse=True):
                try:
                    result = json.loads(match)
                    if isinstance(result, list):
                        logger.debug(f"Extracted JSON array with {len(result)} items")
                        return result
                except json.JSONDecodeError:
                    continue
    
    if expected_type == "object" or (expected_type == "auto" and "{" in text):
        # Try to extract object
        # This regex handles nested braces
        pattern = r'\{(?:[^{}]|\{(?:[^{}]|\{[^{}]*\})*\})*\}'
        matches = re.findall(pattern, text, re.DOTALL)
        
        if matches:
            for match in sorted(matches, key=len, reverse=True):
                try:
                    result = json.loads(match)
                    if isinstance(result, dict):
                        logger.debug(f"Extracted JSON object with {len(result)} keys")
                        return result
                except json.JSONDecodeError:
                    continue
    
    # Step 4: Try to find JSON by looking for common start patterns
    for start_char in ['{', '[']:
        start_idx = text.find(start_char)
        if start_idx != -1:
            # Find matching closing brace
            end_char = '}' if start_char == '{' else ']'
            depth = 0
            for i in range(start_idx, len(text)):
                if text[i] == start_char:
                    depth += 1
                elif text[i] == end_char:
                    depth -= 1
                    if depth == 0:
                        candidate = text[start_idx:i+1]
                        try:
                            result = json.loads(candidate)
                            logger.debug(f"Extracted JSON by brace matching")
                            return result
                        except json.JSONDecodeError:
                            break
    
    # Step 5: Last resort - try to clean common issues
    # Remove common preambles
    preambles = [
        "As an AI expert",
        "As a researcher",
        "Here's",
        "Here is",
        "The answer is",
        "Output:",
        "Result:",
        "JSON:"
    ]
    
    for preamble in preambles:
        if preamble.lower() in text.lower():
            logger.debug(f"Removing preamble: {preamble}")
            idx = text.lower().find(preamble.lower())
            text = text[idx + len(preamble):].strip()
            # Try parsing again
            try:
                if text and text[0] in ['{', '[']:
                    result = json.loads(text)
                    logger.debug("Parsed after removing preamble")
                    return result
            except json.JSONDecodeError:
                pass
    
    # Failed all attempts
    logger.error(f"Failed to extract JSON from text (length: {len(original_text)})")
    logger.debug(f"First 200 chars: {original_text[:200]}")
    logger.debug(f"Last 200 chars: {original_text[-200:]}")
    return None


def parse_llm_json_response(
    text: str,
    expected_type: str = "auto",
    fallback_value: Optional[Any] = None
) -> Union[Dict, List, Any]:
    """
    Parse JSON from LLM response with fallback.
    
    Args:
        text: Raw LLM output
        expected_type: "object", "array", or "auto"
        fallback_value: Value to return if parsing fails
    
    Returns:
        Parsed JSON or fallback_value
    """
    result = extract_json_from_text(text, expected_type)
    
    if result is None:
        logger.warning("JSON extraction failed, returning fallback")
        return fallback_value if fallback_value is not None else {}
    
    return result


def validate_solution_proposal(data: Dict) -> bool:
    """
    Validate that a solution proposal has required fields.
    
    Args:
        data: Dict that should contain solution proposal fields
    
    Returns:
        True if valid, False otherwise
    """
    required_fields = [
        "approach_name",
        "key_innovation",
        "architecture_design",
        "implementation_plan",
        "expected_advantages",
        "potential_challenges",
        "expected_performance"
    ]
    
    for field in required_fields:
        if field not in data:
            logger.error(f"Missing required field: {field}")
            return False
    
    return True


def validate_critique_report(data: Dict) -> bool:
    """
    Validate that a critique report has required fields.
    
    Args:
        data: Dict that should contain critique fields
    
    Returns:
        True if valid, False otherwise
    """
    required_fields = [
        "overall_assessment",
        "strengths",
        "weaknesses",
        "technical_concerns",
        "missing_considerations",
        "real_world_feasibility",
        "optimization_suggestions",
        "verdict"
    ]
    
    for field in required_fields:
        if field not in data:
            logger.error(f"Missing required field: {field}")
            return False
    
    # Validate types
    if not isinstance(data.get("real_world_feasibility"), (int, float)):
        logger.error("real_world_feasibility must be a number")
        return False
    
    return True


def safe_parse_solutions(text: str, iteration: int = 1) -> List[Dict]:
    """
    Safely parse solution proposals from LLM output.
    Returns empty list if parsing fails.
    
    Args:
        text: Raw LLM output
        iteration: Current iteration number (for default values)
    
    Returns:
        List of solution dicts (may be empty)
    """
    result = extract_json_from_text(text, expected_type="array")
    
    if result is None or not isinstance(result, list):
        logger.error("Failed to extract solutions array")
        return []
    
    valid_solutions = []
    for i, sol in enumerate(result):
        if not isinstance(sol, dict):
            logger.warning(f"Solution {i} is not a dict, skipping")
            continue
        
        # Add iteration if missing
        if "iteration" not in sol:
            sol["iteration"] = iteration
        
        # Ensure lists for list fields
        for field in ["expected_advantages", "potential_challenges"]:
            if field in sol and not isinstance(sol[field], list):
                if isinstance(sol[field], str):
                    sol[field] = [sol[field]]
                else:
                    sol[field] = []
        
        # Ensure implementation_plan is list or string
        if "implementation_plan" in sol:
            if not isinstance(sol["implementation_plan"], (list, str)):
                sol["implementation_plan"] = str(sol["implementation_plan"])
        
        valid_solutions.append(sol)
    
    logger.info(f"Parsed {len(valid_solutions)}/{len(result)} valid solutions")
    return valid_solutions


def safe_parse_critique(text: str) -> Optional[Dict]:
    """
    Safely parse critique report from LLM output.
    Returns None if parsing fails.
    
    Args:
        text: Raw LLM output
    
    Returns:
        Critique dict or None
    """
    result = extract_json_from_text(text, expected_type="object")
    
    if result is None or not isinstance(result, dict):
        logger.error("Failed to extract critique object")
        return None
    
    # Ensure numeric feasibility score
    if "real_world_feasibility" in result:
        try:
            result["real_world_feasibility"] = float(result["real_world_feasibility"])
        except (ValueError, TypeError):
            logger.warning("Invalid feasibility score, defaulting to 5.0")
            result["real_world_feasibility"] = 5.0
    
    # Ensure lists for list fields
    for field in ["strengths", "weaknesses", "technical_concerns", 
                  "missing_considerations", "optimization_suggestions"]:
        if field in result and not isinstance(result[field], list):
            if isinstance(result[field], str):
                result[field] = [result[field]]
            else:
                result[field] = []
    
    return result
