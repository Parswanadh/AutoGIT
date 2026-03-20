"""
Agent 2: Novelty Classifier - Semantic similarity + LLM scoring.
LangGraph node implementation.
"""

import json
from typing import List
from sentence_transformers import SentenceTransformer
import chromadb
from chromadb.config import Settings

from src.pipeline.state import AgentState, update_state_status, add_error, add_warning
from src.models.schemas import NoveltyResult
from src.utils.ollama_client import get_ollama_client
from src.utils.logger import get_logger
from src.utils.config import load_config


logger = get_logger("agents.novelty_classifier")


# Global embedding model (lazy load)
_embedding_model = None
_chroma_client = None


def get_embedding_model():
    """Get or create embedding model."""
    global _embedding_model
    if _embedding_model is None:
        logger.info("Loading SBERT embedding model...")
        _embedding_model = SentenceTransformer('all-MiniLM-L6-v2')
        logger.info("✅ Embedding model loaded")
    return _embedding_model


def get_chroma_client():
    """Get or create ChromaDB client."""
    global _chroma_client
    if _chroma_client is None:
        config = load_config()
        vector_db_config = config.get("vector_db", {})
        db_path = vector_db_config.get("path", "./data/vector_db")
        
        logger.info(f"Initializing ChromaDB at {db_path}...")
        _chroma_client = chromadb.PersistentClient(
            path=db_path,
            settings=Settings(anonymized_telemetry=False)
        )
        logger.info("✅ ChromaDB initialized")
    return _chroma_client


async def novelty_classifier_node(state: AgentState) -> AgentState:
    """
    Novelty Classifier LangGraph Node.
    
    Evaluates paper novelty using:
    1. Semantic similarity (SBERT embeddings vs historical papers)
    2. LLM analysis (gpt-oss:20b deep reasoning)
    
    Args:
        state: Current pipeline state
    
    Returns:
        Updated state with novelty analysis
    """
    logger.info("🧠 Novelty Classifier: Analyzing paper...")
    
    try:
        current_paper = state.get("current_paper")
        if not current_paper:
            error_msg = "No current paper in state"
            logger.error(error_msg)
            return add_error(state, error_msg, tier=1)
        
        config = load_config()
        novelty_threshold = config.get("pipeline", {}).get("novelty_threshold", 7.0)
        
        # ============================================
        # 1. SEMANTIC SIMILARITY CHECK
        # ============================================
        logger.info("Step 1/2: Computing semantic similarity...")
        
        embedding_model = get_embedding_model()
        chroma_client = get_chroma_client()
        
        # Embed current paper abstract
        abstract = current_paper.abstract
        embedding = embedding_model.encode(abstract).tolist()
        
        # Get or create collection
        collection = chroma_client.get_or_create_collection(
            name="papers_novelty",
            metadata={"description": "Paper embeddings for novelty detection"}
        )
        
        # Query similar papers
        results = collection.query(
            query_embeddings=[embedding],
            n_results=5
        )
        
        # Calculate max similarity
        if results["distances"] and len(results["distances"][0]) > 0:
            # ChromaDB returns distances (lower = more similar)
            # Convert to similarity (higher = more similar)
            max_distance = max(results["distances"][0])
            max_similarity = 1.0 - (max_distance / 2.0)  # Normalize to 0-1
        else:
            max_similarity = 0.0  # No similar papers found
        
        semantic_novelty_score = (1.0 - max_similarity) * 10.0  # Scale to 0-10
        
        logger.info(f"Semantic novelty: {semantic_novelty_score:.2f}/10 (max_similarity: {max_similarity:.3f})")
        
        # ============================================
        # 2. LLM DEEP ANALYSIS
        # ============================================
        logger.info("Step 2/2: LLM deep analysis...")
        
        ollama_client = get_ollama_client()
        analysis_model = config.get("models", {}).get("specialized", {}).get("novelty_scoring", "gpt-oss:20b")
        
        prompt = f"""Analyze the novelty of this research paper. Rate it from 1-10 and categorize it.

Title: {current_paper.title}

Abstract: {abstract[:800]}

Published: {current_paper.published_date.year}
Categories: {', '.join(current_paper.categories[:3])}

Please provide:
1. Novelty score (1-10, where 10 is groundbreaking novel research)
2. Category: "new" (novel approach/architecture), "incremental" (improvement), or "reproduction" (reimplementation)
3. Key innovations (list 2-4 specific novel contributions)

Respond in JSON format:
{{
    "novelty_score": <1-10>,
    "category": "<new|incremental|reproduction>",
    "key_innovations": ["innovation 1", "innovation 2", ...],
    "reasoning": "<brief explanation>"
}}"""
        
        response = await ollama_client.generate(
            model=analysis_model,
            prompt=prompt,
            temperature=0.5,
            max_tokens=500
        )
        
        content = response["content"]
        state["model_calls_count"] += 1
        state["tokens_used"] += response.get("eval_count", 0)
        
        # Parse JSON response
        try:
            # Extract JSON from response (handle markdown code blocks)
            if "```json" in content:
                content = content.split("```json")[1].split("```")[0].strip()
            elif "```" in content:
                content = content.split("```")[1].split("```")[0].strip()
            
            analysis = json.loads(content)
            llm_novelty_score = float(analysis.get("novelty_score", 5.0))
            category = analysis.get("category", "unknown")
            key_innovations = analysis.get("key_innovations", [])
            reasoning = analysis.get("reasoning", "")
            
            logger.info(f"LLM novelty: {llm_novelty_score:.2f}/10 (category: {category})")
            
        except json.JSONDecodeError as e:
            logger.warning(f"Failed to parse LLM response as JSON: {str(e)}")
            logger.debug(f"Raw response: {content[:200]}...")
            
            # Fallback: extract score using regex
            import re
            score_match = re.search(r'novelty[_\s]*score["\s:]*([0-9.]+)', content, re.IGNORECASE)
            if score_match:
                llm_novelty_score = float(score_match.group(1))
                logger.info(f"Extracted novelty score via regex: {llm_novelty_score}")
            else:
                llm_novelty_score = 5.0
                logger.warning("Could not extract score, using default: 5.0")
            
            # Extract category
            category_match = re.search(r'category["\s:]*(["\']?)([a-zA-Z]+)\1', content, re.IGNORECASE)
            category = category_match.group(2) if category_match else "unknown"
            
            # Extract innovations
            innovations_match = re.search(r'innovations?["\s:]*\[([^\]]+)\]', content, re.IGNORECASE | re.DOTALL)
            if innovations_match:
                key_innovations = [item.strip(' "\',') for item in innovations_match.group(1).split(',') if item.strip()]
            else:
                key_innovations = []
            
            reasoning = content[:500]
            
            state = add_warning(state, f"LLM response parsing failed, extracted score={llm_novelty_score} via regex", tier=1)
        
        # ============================================
        # 3. COMBINED SCORE
        # ============================================
        # Weighted average: 40% semantic, 60% LLM
        combined_score = (0.4 * semantic_novelty_score) + (0.6 * llm_novelty_score)
        
        passes_threshold = combined_score >= novelty_threshold
        
        logger.info(f"Combined novelty: {combined_score:.2f}/10 (threshold: {novelty_threshold})")
        logger.info(f"Result: {'✅ PASS' if passes_threshold else '❌ SKIP'}")
        
        # ============================================
        # 4. STORE EMBEDDING FOR FUTURE COMPARISONS
        # ============================================
        if passes_threshold:
            # Add to vector DB for future novelty checks
            collection.add(
                embeddings=[embedding],
                documents=[abstract],
                ids=[current_paper.arxiv_id],
                metadatas=[{
                    "title": current_paper.title,
                    "year": str(current_paper.published_date.year),
                    "categories": ",".join(current_paper.categories[:3])
                }]
            )
            logger.info(f"✅ Added paper to vector DB: {current_paper.arxiv_id}")
        
        # ============================================
        # 5. UPDATE STATE
        # ============================================
        novelty_result = NoveltyResult(
            score=combined_score,
            category=category,
            key_innovations=key_innovations,
            semantic_similarity=max_similarity,
            gpt_analysis=reasoning,
            threshold_pass=passes_threshold
        )
        
        state["novelty_result"] = novelty_result
        state["passes_novelty"] = passes_threshold
        
        status_msg = (
            f"Novelty: {combined_score:.1f}/10 "
            f"({'PASS' if passes_threshold else 'SKIP'}) - {category}"
        )
        state = update_state_status(state, "analyzing_novelty", status_msg)
        
        if passes_threshold:
            state["next"] = "priority_router"
        else:
            state["next"] = "paper_scout"  # Try next paper
        
        return state
        
    except Exception as e:
        error_msg = f"Novelty Classifier failed: {str(e)}"
        logger.error(error_msg, exc_info=True)
        state = add_error(state, error_msg, tier=1)
        state["next"] = "paper_scout"  # Try next paper
        return state
