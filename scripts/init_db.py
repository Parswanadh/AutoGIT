"""
Initialize pipeline database.
"""

import sys
from pathlib import Path

# Add project root to path
sys.path.insert(0, str(Path(__file__).parent.parent))

from sqlalchemy import create_engine, Column, String, Integer, Float, DateTime, JSON, Boolean
from sqlalchemy.ext.declarative import declarative_base
from sqlalchemy.orm import sessionmaker
from datetime import datetime

from src.utils.config import get_config
from src.utils.logger import setup_logging, get_logger


Base = declarative_base()


class Paper(Base):
    """Paper tracking table."""
    __tablename__ = 'papers'
    
    id = Column(Integer, primary_key=True)
    arxiv_id = Column(String, unique=True, nullable=False, index=True)
    title = Column(String, nullable=False)
    authors = Column(JSON)  # List of author names
    abstract = Column(String)
    pdf_url = Column(String)
    published_date = Column(DateTime)
    categories = Column(JSON)  # List of categories
    
    # Status tracking
    status = Column(String, default='discovered', index=True)
    # Status values: discovered, analyzed, generated, published, failed
    
    # Metadata
    created_at = Column(DateTime, default=datetime.utcnow)
    updated_at = Column(DateTime, default=datetime.utcnow, onupdate=datetime.utcnow)
    processed_at = Column(DateTime, nullable=True)
    
    # Results
    novelty_score = Column(Float, nullable=True)
    priority_score = Column(Float, nullable=True)
    complexity_score = Column(Float, nullable=True)
    
    github_url = Column(String, nullable=True)
    github_repo_name = Column(String, nullable=True)
    
    # Tracking
    error_log = Column(JSON, default=[])
    retry_count = Column(Integer, default=0)
    
    def __repr__(self):
        return f"<Paper(arxiv_id='{self.arxiv_id}', title='{self.title[:50]}')>"


class PipelineRun(Base):
    """Pipeline execution tracking."""
    __tablename__ = 'pipeline_runs'
    
    id = Column(Integer, primary_key=True)
    started_at = Column(DateTime, default=datetime.utcnow)
    completed_at = Column(DateTime, nullable=True)
    
    papers_processed = Column(Integer, default=0)
    papers_succeeded = Column(Integer, default=0)
    papers_failed = Column(Integer, default=0)
    
    total_tokens_used = Column(Integer, default=0)
    total_cost_usd = Column(Float, default=0.0)
    
    config_snapshot = Column(JSON)
    error_log = Column(JSON, default=[])
    
    def __repr__(self):
        return f"<PipelineRun(id={self.id}, started={self.started_at})>"


class Checkpoint(Base):
    """Pipeline state checkpoints."""
    __tablename__ = 'checkpoints'
    
    id = Column(Integer, primary_key=True)
    paper_arxiv_id = Column(String, nullable=False, index=True)
    tier = Column(Integer, nullable=False)  # 1, 2, 3, or 4
    
    state_data = Column(JSON, nullable=False)
    created_at = Column(DateTime, default=datetime.utcnow)
    
    def __repr__(self):
        return f"<Checkpoint(paper={self.paper_arxiv_id}, tier={self.tier})>"


def init_database():
    """Initialize the database with tables."""
    config = get_config()
    logger = setup_logging(log_level=config.log_level)
    
    logger.info("Initializing database...")
    
    # Create database directory
    db_path = Path(config.db_path)
    db_path.parent.mkdir(parents=True, exist_ok=True)
    
    # Create engine
    engine = create_engine(f'sqlite:///{config.db_path}', echo=False)
    
    # Create all tables
    Base.metadata.create_all(engine)
    
    logger.info(f"✅ Database initialized at: {config.db_path}")
    logger.info(f"✅ Tables created: {', '.join(Base.metadata.tables.keys())}")
    
    return engine


if __name__ == "__main__":
    print("🚀 Initializing AUTO-GIT Publisher database...")
    engine = init_database()
    print("✅ Database initialization complete!")
