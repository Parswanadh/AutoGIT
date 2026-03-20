"""
Global Research Index Builder
Downloads papers from arXiv and builds comprehensive ChromaDB index.
"""

import asyncio
import arxiv
from pathlib import Path
from typing import List, Dict
from datetime import datetime, timedelta
from sentence_transformers import SentenceTransformer

from src.utils.logger import get_logger
from src.utils.config import get_config

logger = get_logger("domain_indexer")


# Domain-specific arXiv queries
DOMAIN_QUERIES = {
    "computer_vision": [
        "vision transformer",
        "object detection",
        "image segmentation",
        "video understanding",
        "3D vision",
        "self-supervised vision"
    ],
    "nlp": [
        "large language model",
        "transformer architecture",
        "attention mechanism",
        "question answering",
        "natural language understanding",
        "text generation"
    ],
    "reinforcement_learning": [
        "reinforcement learning",
        "policy gradient",
        "Q-learning",
        "model-based RL",
        "multi-agent RL",
        "offline RL"
    ],
    "generative_models": [
        "diffusion models",
        "GAN",
        "VAE",
        "flow models",
        "generative adversarial",
        "image generation"
    ],
    "graph_learning": [
        "graph neural network",
        "GNN",
        "graph transformer",
        "molecular learning",
        "knowledge graph"
    ]
}


class DomainIndexer:
    """Build comprehensive research index for a domain."""
    
    def __init__(self, domain: str, papers_per_query: int = 200):
        self.domain = domain
        self.papers_per_query = papers_per_query
        self.client = arxiv.Client()
        self.embedding_model = None
        self.chroma_client = None
        self.collection = None
        
    def load_embedding_model(self):
        """Load SBERT model for embeddings."""
        if not self.embedding_model:
            logger.info("Loading SBERT embedding model...")
            self.embedding_model = SentenceTransformer('all-MiniLM-L6-v2')
            logger.info("✅ Model loaded")
    
    def init_chroma(self):
        """Initialize ChromaDB collection."""
        import chromadb
        from chromadb.config import Settings
        
        config = get_config()
        db_path = Path(config.vector_db_path) / self.domain
        db_path.mkdir(parents=True, exist_ok=True)
        
        logger.info(f"Initializing ChromaDB at {db_path}...")
        
        self.chroma_client = chromadb.PersistentClient(
            path=str(db_path),
            settings=Settings(anonymized_telemetry=False)
        )
        
        # Create or get collection
        self.collection = self.chroma_client.get_or_create_collection(
            name=f"{self.domain}_papers",
            metadata={"description": f"Research papers in {self.domain}"}
        )
        
        logger.info(f"✅ Collection initialized: {self.collection.count()} papers")
    
    async def download_papers(self, query: str, max_results: int) -> List[Dict]:
        """
        Download papers for a query.
        
        Args:
            query: Search query
            max_results: Max papers to download
        
        Returns:
            List of paper metadata
        """
        logger.info(f"📥 Downloading papers for: '{query}' (max {max_results})...")
        
        # Search arXiv
        search = arxiv.Search(
            query=query,
            max_results=max_results,
            sort_by=arxiv.SortCriterion.SubmittedDate,
            sort_order=arxiv.SortOrder.Descending
        )
        
        papers = []
        try:
            for result in self.client.results(search):
                paper = {
                    "arxiv_id": result.entry_id.split("/")[-1],
                    "title": result.title,
                    "authors": [author.name for author in result.authors],
                    "abstract": result.summary,
                    "published_date": result.published.isoformat(),
                    "categories": result.categories,
                    "pdf_url": result.pdf_url
                }
                papers.append(paper)
        
        except Exception as e:
            logger.error(f"Error downloading papers: {e}")
        
        logger.info(f"  ✅ Downloaded {len(papers)} papers")
        return papers
    
    def embed_papers(self, papers: List[Dict]) -> List[Dict]:
        """
        Generate embeddings for papers.
        
        Args:
            papers: List of paper metadata
        
        Returns:
            Papers with embeddings
        """
        logger.info(f"🧠 Generating embeddings for {len(papers)} papers...")
        
        # Combine title + abstract for embedding
        texts = [f"{p['title']} {p['abstract']}" for p in papers]
        
        # Generate embeddings in batches
        embeddings = self.embedding_model.encode(
            texts,
            batch_size=32,
            show_progress_bar=True,
            convert_to_numpy=True
        )
        
        # Add embeddings to papers
        for paper, embedding in zip(papers, embeddings):
            paper["embedding"] = embedding.tolist()
        
        logger.info("✅ Embeddings generated")
        return papers
    
    def store_in_chroma(self, papers: List[Dict]):
        """
        Store papers in ChromaDB.
        
        Args:
            papers: Papers with embeddings
        """
        logger.info(f"💾 Storing {len(papers)} papers in ChromaDB...")
        
        # Prepare data
        ids = [p["arxiv_id"] for p in papers]
        embeddings = [p["embedding"] for p in papers]
        documents = [p["abstract"] for p in papers]
        metadatas = [
            {
                "title": p["title"],
                "authors": ", ".join(p["authors"][:3]),  # First 3 authors
                "published_date": p["published_date"],
                "categories": ", ".join(p["categories"][:3]),
                "pdf_url": p["pdf_url"]
            }
            for p in papers
        ]
        
        # Add to collection (will skip duplicates)
        try:
            self.collection.add(
                ids=ids,
                embeddings=embeddings,
                documents=documents,
                metadatas=metadatas
            )
            logger.info(f"✅ Stored successfully")
        except Exception as e:
            # Handle duplicates
            logger.warning(f"Some papers may be duplicates: {e}")
    
    async def build_index(self):
        """Build complete index for domain."""
        logger.info(f"{'='*60}")
        logger.info(f"🚀 Building index for domain: {self.domain.upper()}")
        logger.info(f"{'='*60}\n")
        
        # Initialize
        self.load_embedding_model()
        self.init_chroma()
        
        queries = DOMAIN_QUERIES.get(self.domain, [])
        if not queries:
            logger.error(f"No queries defined for domain: {self.domain}")
            return
        
        total_papers = 0
        
        for query in queries:
            # Download papers
            papers = await self.download_papers(query, self.papers_per_query)
            
            if not papers:
                continue
            
            # Generate embeddings
            papers_with_embeddings = self.embed_papers(papers)
            
            # Store in ChromaDB
            self.store_in_chroma(papers_with_embeddings)
            
            total_papers += len(papers)
            
            # Rate limiting
            await asyncio.sleep(2)
        
        final_count = self.collection.count()
        logger.info(f"\n{'='*60}")
        logger.info(f"✅ INDEX COMPLETE: {self.domain.upper()}")
        logger.info(f"   Total papers indexed: {final_count}")
        logger.info(f"   Queries processed: {len(queries)}")
        logger.info(f"{'='*60}\n")


async def build_all_domains(papers_per_query: int = 200):
    """Build indexes for all domains."""
    logger.info("🌍 Building global research index...")
    logger.info(f"Papers per query: {papers_per_query}")
    logger.info(f"Domains: {len(DOMAIN_QUERIES)}\n")
    
    for domain in DOMAIN_QUERIES.keys():
        indexer = DomainIndexer(domain, papers_per_query)
        await indexer.build_index()
        
        # Cleanup
        del indexer
        await asyncio.sleep(5)  # Rate limiting between domains
    
    logger.info("🎉 ALL DOMAINS INDEXED!")


if __name__ == "__main__":
    import sys
    
    if len(sys.argv) > 1:
        domain = sys.argv[1]
        papers = int(sys.argv[2]) if len(sys.argv) > 2 else 200
        
        indexer = DomainIndexer(domain, papers)
        asyncio.run(indexer.build_index())
    else:
        # Build all domains
        asyncio.run(build_all_domains(papers_per_query=200))
