"""
Global Novelty Checker
Checks novelty against comprehensive research landscape (1000s of papers).
"""

from pathlib import Path
from typing import List, Dict, Tuple
import chromadb
from chromadb.config import Settings

from src.models.schemas import PaperMetadata, SolutionProposal
from src.utils.logger import get_logger
from src.utils.config import get_config

logger = get_logger("global_novelty")


class GlobalNoveltyChecker:
    """Check novelty against comprehensive research index."""
    
    def __init__(self, domain: str = None):
        self.domain = domain
        self.config = get_config()
        self.embedding_model = None
        self.collections = {}
    
    def load_embedding_model(self):
        """Load SBERT model."""
        if not self.embedding_model:
            from sentence_transformers import SentenceTransformer
            logger.info("Loading embedding model...")
            self.embedding_model = SentenceTransformer('all-MiniLM-L6-v2')
    
    def get_collection(self, domain: str):
        """Get ChromaDB collection for domain."""
        if domain in self.collections:
            return self.collections[domain]
        
        db_path = Path(self.config.vector_db_path) / domain
        
        if not db_path.exists():
            logger.warning(f"No index found for domain: {domain}")
            logger.warning(f"   Run: python scripts/build_global_index.py {domain}")
            return None
        
        client = chromadb.PersistentClient(
            path=str(db_path),
            settings=Settings(anonymized_telemetry=False)
        )
        
        collection = client.get_collection(name=f"{domain}_papers")
        self.collections[domain] = collection
        
        logger.info(f"📚 Loaded {domain} index: {collection.count()} papers")
        return collection
    
    def check_paper_novelty(
        self,
        paper: PaperMetadata,
        domain: str,
        top_k: int = 10
    ) -> Tuple[float, List[Dict]]:
        """
        Check paper novelty against global index.
        
        Args:
            paper: Paper to check
            domain: Research domain
            top_k: Number of similar papers to return
        
        Returns:
            (novelty_score, similar_papers)
        """
        collection = self.get_collection(domain)
        
        if not collection:
            return 5.0, []  # Default if no index
        
        self.load_embedding_model()
        
        # Generate embedding for paper
        text = f"{paper.title} {paper.abstract}"
        embedding = self.embedding_model.encode([text])[0]
        
        # Search for similar papers
        results = collection.query(
            query_embeddings=[embedding.tolist()],
            n_results=top_k
        )
        
        if not results["distances"] or not results["distances"][0]:
            return 10.0, []  # Very novel if no similar papers found
        
        # Calculate novelty from similarity
        max_similarity = 1.0 - min(results["distances"][0])  # Convert distance to similarity
        novelty_score = (1.0 - max_similarity) * 10.0  # Scale to 0-10
        novelty_score = max(0.0, min(10.0, novelty_score))
        
        # Format similar papers
        similar_papers = []
        for i in range(len(results["ids"][0])):
            similar_papers.append({
                "arxiv_id": results["ids"][0][i],
                "title": results["metadatas"][0][i].get("title", "Unknown"),
                "similarity": 1.0 - results["distances"][0][i],
                "published_date": results["metadatas"][0][i].get("published_date", "Unknown")
            })
        
        logger.info(f"📊 Global novelty: {novelty_score:.1f}/10")
        logger.info(f"   Most similar paper: {similar_papers[0]['title'][:60]}...")
        logger.info(f"   Similarity: {similar_papers[0]['similarity']:.3f}")
        
        return novelty_score, similar_papers
    
    def check_solution_novelty(
        self,
        solution: SolutionProposal,
        domain: str,
        top_k: int = 10
    ) -> Tuple[float, List[Dict]]:
        """
        Check solution novelty against global index.
        
        Args:
            solution: Solution to check
            domain: Research domain
            top_k: Number of similar papers to return
        
        Returns:
            (novelty_score, similar_papers)
        """
        collection = self.get_collection(domain)
        
        if not collection:
            return 5.0, []
        
        self.load_embedding_model()
        
        # Generate embedding for solution
        text = f"{solution.approach_name} {solution.key_innovation} {solution.architecture_design}"
        embedding = self.embedding_model.encode([text])[0]
        
        # Search for similar approaches
        results = collection.query(
            query_embeddings=[embedding.tolist()],
            n_results=top_k
        )
        
        if not results["distances"] or not results["distances"][0]:
            return 10.0, []
        
        # Calculate novelty
        max_similarity = 1.0 - min(results["distances"][0])
        novelty_score = (1.0 - max_similarity) * 10.0
        novelty_score = max(0.0, min(10.0, novelty_score))
        
        # Format results
        similar_papers = []
        for i in range(len(results["ids"][0])):
            similar_papers.append({
                "arxiv_id": results["ids"][0][i],
                "title": results["metadatas"][0][i].get("title", "Unknown"),
                "similarity": 1.0 - results["distances"][0][i],
                "abstract": results["documents"][0][i][:200] + "..."
            })
        
        logger.info(f"🔬 Solution novelty vs. {collection.count()} papers: {novelty_score:.1f}/10")
        
        if novelty_score < 5.0:
            logger.warning(f"⚠️  Similar approach found: {similar_papers[0]['title'][:60]}...")
        
        return novelty_score, similar_papers


def get_global_checker(domain: str = None) -> GlobalNoveltyChecker:
    """Get global novelty checker instance."""
    return GlobalNoveltyChecker(domain)
