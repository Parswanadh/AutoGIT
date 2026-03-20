"""
Agent 1: Paper Scout - Autonomous arXiv monitoring.
LangGraph node implementation.
"""

import arxiv
from datetime import datetime
from typing import List

from src.pipeline.state import AgentState, update_state_status, add_error
from src.models.schemas import PaperMetadata
from src.utils.logger import get_logger
from src.utils.config import load_config

try:
    from langgraph.graph import END
except ImportError:
    END = "end"


logger = get_logger("agents.paper_scout")


async def paper_scout_node(state: AgentState) -> AgentState:
    """
    Paper Scout LangGraph Node.
    
    Discovers new papers from arXiv based on configured queries.
    
    Args:
        state: Current pipeline state
    
    Returns:
        Updated state with discovered papers
    """
    logger.info("🔍 Paper Scout: Starting discovery...")
    
    try:
        # Load configuration
        config = load_config()
        arxiv_config = config.get("arxiv", {})
        
        queries = arxiv_config.get("queries", [
            "vision transformer",
            "agentic AI systems",
            "signal processing neural networks"
        ])
        max_results = arxiv_config.get("max_results_per_query", 10)
        min_year = arxiv_config.get("min_publication_year", 2020)
        
        # Check if we already have discovered papers in state
        if state.get("discovered_papers") and len(state["discovered_papers"]) > 0:
            # Pop next paper from queue
            current_paper = state["discovered_papers"].pop(0)
            state["current_paper"] = current_paper
            state["current_paper_id"] = current_paper.arxiv_id
            
            logger.info(f"📄 Retrieved paper from queue: {current_paper.title[:80]}...")
            state = update_state_status(
                state,
                "discovering",
                f"Processing queued paper: {current_paper.arxiv_id}"
            )
            
            return state
        
        # Discover new papers
        logger.info(f"Searching arXiv with {len(queries)} queries...")
        
        discovered: List[PaperMetadata] = []
        client = arxiv.Client()
        
        for query in queries:
            logger.debug(f"Query: {query}")
            
            search = arxiv.Search(
                query=query,
                sort_by=arxiv.SortCriterion.SubmittedDate,
                max_results=max_results
            )
            
            for paper in client.results(search):
                # Filter by year
                if paper.published.year < min_year:
                    continue
                
                # Convert to our schema
                paper_metadata = PaperMetadata(
                    arxiv_id=paper.get_short_id(),
                    title=paper.title,
                    authors=[author.name for author in paper.authors],
                    abstract=paper.summary,
                    pdf_url=paper.pdf_url,
                    published_date=paper.published,
                    categories=paper.categories
                )
                
                discovered.append(paper_metadata)
                logger.debug(f"  ✓ {paper_metadata.arxiv_id}: {paper_metadata.title[:60]}...")
        
        # Remove duplicates by arxiv_id
        unique_papers = {}
        for paper in discovered:
            if paper.arxiv_id not in unique_papers:
                unique_papers[paper.arxiv_id] = paper
        
        discovered = list(unique_papers.values())
        
        logger.info(f"✅ Discovered {len(discovered)} unique papers")
        
        if not discovered:
            logger.warning("No papers discovered matching criteria")
            state = update_state_status(state, "completed", "No papers found")
            state["next"] = END
            return state
        
        # Set current paper and queue rest
        current_paper = discovered[0]
        remaining_papers = discovered[1:]
        
        state["discovered_papers"] = remaining_papers
        state["current_paper"] = current_paper
        state["current_paper_id"] = current_paper.arxiv_id
        
        state = update_state_status(
            state,
            "discovering",
            f"Processing paper: {current_paper.arxiv_id} - {current_paper.title[:60]}"
        )
        
        logger.info(f"📄 Current: {current_paper.title[:80]}...")
        logger.info(f"📚 Queue: {len(remaining_papers)} papers remaining")
        
        state["next"] = "novelty_classifier"
        
        return state
        
    except Exception as e:
        error_msg = f"Paper Scout failed: {str(e)}"
        logger.error(error_msg, exc_info=True)
        state = add_error(state, error_msg, tier=1)
        state["status"] = "failed"
        state["next"] = END
        return state
