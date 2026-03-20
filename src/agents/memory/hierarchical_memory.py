"""
Hierarchical Memory System for Long-Term Learning.

Three-level memory architecture based on cognitive science:
1. Episodic Memory: Raw experiences (debates, solutions, outcomes)
2. Semantic Memory: Abstracted patterns and concepts
3. Procedural Memory: Skills and "how-to" knowledge

Research Background:
- Cognitive science: Tulving's multiple trace theory (1972, 1983)
- ML systems: Complementary Learning Systems (McClelland et al., 1995)
- Memory consolidation: Sleep-like replay for long-term retention

Benefits:
- Learn from past debates to improve future performance
- Recognize similar problems and apply proven solutions
- Build procedural knowledge over time
- Adaptive routing based on success patterns
"""

import asyncio
import time
import json
from typing import Dict, Any, List, Optional, Tuple
from dataclasses import dataclass, field, asdict
from datetime import datetime
from pathlib import Path
import hashlib

from src.utils.logger import get_logger
from src.utils.ollama_client import get_ollama_client

logger = get_logger("hierarchical_memory")


# ============================================
# DATA STRUCTURES
# ============================================

@dataclass
class Episode:
    """Single episodic memory (raw experience)."""
    episode_id: str
    timestamp: float
    problem: Dict[str, Any]
    solution: str
    critiques: List[Dict[str, Any]]
    consensus: Dict[str, Any]
    outcome: str  # "success" | "partial" | "failure"
    quality_score: float  # 0-10
    tokens_used: int
    latency_seconds: float

    # Computed embedding (for similarity search)
    embedding: Optional[List[float]] = None

    def to_dict(self) -> Dict[str, Any]:
        """Convert to dictionary for storage."""
        data = asdict(self)
        data['embedding'] = self.embedding  # Keep as-is
        return data

    @classmethod
    def from_dict(cls, data: Dict[str, Any]) -> 'Episode':
        """Create from dictionary."""
        return cls(**data)


@dataclass
class Pattern:
    """Semantic memory (abstracted pattern)."""
    pattern_id: str
    pattern_type: str  # "problem_type" | "solution_approach" | "weakness_type"
    description: str
    keywords: List[str]
    episodes: List[str]  # Episode IDs that contributed to this pattern
    confidence: float  # 0-1, increases with more evidence
    created_at: float
    last_accessed: float

    def to_dict(self) -> Dict[str, Any]:
        """Convert to dictionary for storage."""
        return asdict(self)

    @classmethod
    def from_dict(cls, data: Dict[str, Any]) -> 'Pattern':
        """Create from dictionary."""
        return cls(**data)


@dataclass
class Skill:
    """Procedural memory (skill/knowledge)."""
    skill_id: str
    name: str
    description: str
    triggers: List[str]  # When to apply this skill
    steps: List[str]  # How to apply
    success_rate: float  # Track effectiveness
    usage_count: int
    created_at: float
    last_used: float

    def to_dict(self) -> Dict[str, Any]:
        """Convert to dictionary for storage."""
        return asdict(self)

    @classmethod
    def from_dict(cls, data: Dict[str, Any]) -> 'Skill':
        """Create from dictionary."""
        return cls(**data)


# ============================================
# HIERARCHICAL MEMORY
# ============================================

class HierarchicalMemory:
    """
    Three-level memory system for long-term learning.

    Memory Levels:
    1. Episodic: Raw experiences (what happened)
    2. Semantic: Patterns and concepts (what was learned)
    3. Procedural: Skills and methods (how to do things)

    Learning Process:
    1. Store episode (episodic)
    2. Extract patterns (semantic)
    3. Extract skills (procedural, if successful)
    4. Consolidate over time (batch processing)
    """

    def __init__(
        self,
        storage_path: str = "./data/memory",
        embedding_model: str = "all-minilm:latest",
        consolidation_interval: int = 100  # Episodes between consolidation
    ):
        """
        Initialize hierarchical memory.

        Args:
            storage_path: Path to store memory data
            embedding_model: Model for generating embeddings
            consolidation_interval: Episodes between batch consolidation
        """
        self.storage_path = Path(storage_path)
        self.storage_path.mkdir(parents=True, exist_ok=True)

        self.embedding_model = embedding_model
        self.consolidation_interval = consolidation_interval
        self.client = get_ollama_client()

        # In-memory stores (persisted to disk)
        self.episodes: Dict[str, Episode] = {}
        self.patterns: Dict[str, Pattern] = {}
        self.skills: Dict[str, Skill] = {}

        # Statistics
        self.total_episodes = 0
        self.consolidation_count = 0

        # Load existing memory
        self._load_memory()

        logger.info(
            f"HierarchicalMemory initialized: "
            f"{len(self.episodes)} episodes, "
            f"{len(self.patterns)} patterns, "
            f"{len(self.skills)} skills"
        )

    async def remember_debate(
        self,
        problem: Dict[str, Any],
        solution: str,
        critiques: List[Dict[str, Any]],
        consensus: Dict[str, Any],
        outcome: str,
        quality_score: float,
        tokens_used: int,
        latency_seconds: float
    ) -> str:
        """
        Store debate experience in all three memory levels.

        Args:
            problem: Problem description
            solution: Generated solution
            critiques: List of critiques
            consensus: Consensus result
            outcome: "success" | "partial" | "failure"
            quality_score: Final quality score (0-10)
            tokens_used: Total tokens consumed
            latency_seconds: Total time taken

        Returns:
            Episode ID
        """
        # Generate episode ID
        episode_id = self._generate_episode_id(problem, solution)

        # 1. Episodic Memory: Store raw experience
        episode = Episode(
            episode_id=episode_id,
            timestamp=time.time(),
            problem=problem,
            solution=solution,
            critiques=critiques,
            consensus=consensus,
            outcome=outcome,
            quality_score=quality_score,
            tokens_used=tokens_used,
            latency_seconds=latency_seconds
        )

        # Generate embedding for similarity search
        episode.embedding = await self._embed_episode(episode)
        self.episodes[episode_id] = episode
        self.total_episodes += 1

        # 2. Semantic Memory: Extract patterns
        patterns = await self._extract_patterns([episode])
        for pattern in patterns:
            if pattern.pattern_id in self.patterns:
                # Update existing pattern
                existing = self.patterns[pattern.pattern_id]
                existing.episodes.append(episode_id)
                existing.confidence = min(1.0, existing.confidence + 0.1)
                existing.last_accessed = time.time()
            else:
                # New pattern
                self.patterns[pattern.pattern_id] = pattern

        # 3. Procedural Memory: Extract skills (if successful)
        if outcome == "success" and quality_score >= 7.0:
            skills = await self._extract_skills(episode)
            for skill in skills:
                if skill.skill_id in self.skills:
                    # Update existing skill
                    existing = self.skills[skill.skill_id]
                    existing.usage_count += 1
                    existing.success_rate = (
                        (existing.success_rate * (existing.usage_count - 1) + 1.0)
                        / existing.usage_count
                    )
                    existing.last_used = time.time()
                else:
                    # New skill
                    self.skills[skill.skill_id] = skill

        # Check if consolidation is needed
        if self.total_episodes % self.consolidation_interval == 0:
            await self._consolidate()

        # Persist to disk
        await self._save_memory()

        logger.info(
            f"Remembered episode {episode_id}: "
            f"outcome={outcome}, score={quality_score:.1f}, "
            f"patterns={len(patterns)}, skills={len(skills) if outcome == 'success' else 0}"
        )

        return episode_id

    async def retrieve_relevant(
        self,
        problem: Dict[str, Any],
        top_k: int = 5,
        min_similarity: float = 0.7
    ) -> List[Episode]:
        """
        Retrieve relevant past experiences using semantic search.

        Args:
            problem: Current problem
            top_k: Maximum number of episodes to return
            min_similarity: Minimum similarity threshold

        Returns:
            List of relevant episodes (sorted by similarity)
        """
        if not self.episodes:
            return []

        # Generate query embedding
        query_text = self._problem_to_text(problem)
        query_embedding = await self.client.embed(
            model=self.embedding_model,
            text=query_text
        )

        # Find similar episodes
        similarities = []
        for episode in self.episodes.values():
            if episode.embedding:
                similarity = self._cosine_similarity(query_embedding, episode.embedding)
                if similarity >= min_similarity:
                    similarities.append((episode, similarity))

        # Sort by similarity
        similarities.sort(key=lambda x: x[1], reverse=True)

        results = [ep for ep, _ in similarities[:top_k]]

        logger.info(
            f"Retrieved {len(results)} relevant episodes "
            f"(query: '{query_text[:50]}...')"
        )

        return results

    async def get_applicable_skills(
        self,
        problem: Dict[str, Any]
    ) -> List[Skill]:
        """
        Get skills applicable to current problem.

        Args:
            problem: Current problem

        Returns:
            List of applicable skills (sorted by success rate)
        """
        problem_text = self._problem_to_text(problem).lower()

        applicable = []
        for skill in self.skills.values():
            # Check if any trigger matches
            for trigger in skill.triggers:
                if trigger.lower() in problem_text:
                    applicable.append(skill)
                    break

        # Sort by success rate
        applicable.sort(key=lambda s: s.success_rate, reverse=True)

        logger.info(f"Found {len(applicable)} applicable skills")

        return applicable

    def get_statistics(self) -> Dict[str, Any]:
        """Get memory statistics."""
        return {
            "total_episodes": len(self.episodes),
            "total_patterns": len(self.patterns),
            "total_skills": len(self.skills),
            "consolidation_count": self.consolidation_count,
            "success_rate": sum(
                1 for ep in self.episodes.values()
                if ep.outcome == "success"
            ) / max(len(self.episodes), 1),
            "avg_quality_score": sum(
                ep.quality_score for ep in self.episodes.values()
            ) / max(len(self.episodes), 1)
        }

    # ============================================
    # PRIVATE METHODS
    # ============================================

    def _generate_episode_id(self, problem: Dict[str, Any], solution: str) -> str:
        """Generate unique episode ID."""
        content = json.dumps(problem, sort_keys=True) + solution[:100]
        hash_hex = hashlib.md5(content.encode()).hexdigest()[:12]
        timestamp = int(time.time())
        return f"ep_{timestamp}_{hash_hex}"

    async def _embed_episode(self, episode: Episode) -> List[float]:
        """Generate embedding for episode."""
        text = self._problem_to_text(episode.problem) + " " + episode.solution[:500]
        return await self.client.embed(
            model=self.embedding_model,
            text=text
        )

    def _problem_to_text(self, problem: Dict[str, Any]) -> str:
        """Convert problem dict to text string."""
        parts = []
        if "domain" in problem:
            parts.append(f"Domain: {problem['domain']}")
        if "challenge" in problem:
            parts.append(f"Challenge: {problem['challenge']}")
        if "limitations" in problem:
            parts.append(f"Limitations: {', '.join(problem['limitations'])}")
        if "requirements" in problem:
            parts.append(f"Requirements: {', '.join(problem['requirements'])}")
        return " | ".join(parts)

    def _cosine_similarity(self, a: List[float], b: List[float]) -> float:
        """Calculate cosine similarity between two vectors."""
        import math
        dot_product = sum(x * y for x, y in zip(a, b))
        magnitude_a = math.sqrt(sum(x * x for x in a))
        magnitude_b = math.sqrt(sum(x * x for x in b))
        if magnitude_a == 0 or magnitude_b == 0:
            return 0.0
        return dot_product / (magnitude_a * magnitude_b)

    async def _extract_patterns(self, episodes: List[Episode]) -> List[Pattern]:
        """
        Extract patterns from episodes.

        Pattern types:
        - problem_type: Category of problem
        - solution_approach: Type of solution used
        - weakness_type: Common weaknesses identified
        """
        patterns = []

        for episode in episodes:
            # Extract problem domain/type
            domain = episode.problem.get("domain", "unknown")
            if domain != "unknown":
                pattern_id = f"problem_type_{domain.lower().replace(' ', '_')}"
                patterns.append(Pattern(
                    pattern_id=pattern_id,
                    pattern_type="problem_type",
                    description=f"Problems in {domain} domain",
                    keywords=[domain, episode.problem.get("challenge", "")[:50]],
                    episodes=[episode.episode_id],
                    confidence=0.5,
                    created_at=time.time(),
                    last_accessed=time.time()
                ))

            # Extract solution approach
            if "quantization" in episode.solution.lower():
                pattern_id = "solution_approach_quantization"
                patterns.append(Pattern(
                    pattern_id=pattern_id,
                    pattern_type="solution_approach",
                    description="Quantization-based solutions",
                    keywords=["quantization", "8-bit", "compression"],
                    episodes=[episode.episode_id],
                    confidence=0.5,
                    created_at=time.time(),
                    last_accessed=time.time()
                ))

            # Extract common weaknesses
            for critique in episode.critiques:
                content = critique.get("content", "").lower()
                if "scalability" in content:
                    pattern_id = "weakness_type_scalability"
                    patterns.append(Pattern(
                        pattern_id=pattern_id,
                        pattern_type="weakness_type",
                        description="Scalability concerns",
                        keywords=["scalability", "scale", "growth"],
                        episodes=[episode.episode_id],
                        confidence=0.5,
                        created_at=time.time(),
                        last_accessed=time.time()
                    ))
                    break

        return patterns

    async def _extract_skills(self, episode: Episode) -> List[Skill]:
        """
        Extract skills from successful episode.

        Skills are procedural knowledge: "how to do X"
        """
        skills = []

        # Example: If solution used quantization successfully
        if "quantization" in episode.solution.lower() and episode.quality_score >= 7.0:
            skills.append(Skill(
                skill_id=f"quantization_{int(time.time())}",
                name="Apply Quantization",
                description="Use quantization to reduce memory and improve speed",
                triggers=["memory", "speed", "efficiency", "training time"],
                steps=[
                    "Consider 8-bit quantization for weights",
                    "Use quantization-aware training to maintain accuracy",
                    "Maintain 32-bit master copy for updates",
                    "Apply loss scaling for gradients"
                ],
                success_rate=1.0,
                usage_count=1,
                created_at=time.time(),
                last_used=time.time()
            ))

        # Example: If solution addressed scalability
        if any("scalability" in c.get("content", "").lower() for c in episode.critiques):
            if episode.quality_score >= 7.0:
                skills.append(Skill(
                    skill_id=f"scalability_{int(time.time())}",
                    name="Design for Scalability",
                    description="Ensure solution scales to production workloads",
                    triggers=["scalability", "production", "large scale", "deployment"],
                    steps=[
                        "Consider batch processing capabilities",
                        "Evaluate memory usage for 10x data growth",
                        "Design for horizontal scaling if needed",
                        "Add monitoring and observability"
                    ],
                    success_rate=1.0,
                    usage_count=1,
                    created_at=time.time(),
                    last_used=time.time()
                ))

        return skills

    async def _consolidate(self):
        """
        Consolidate memory (batch processing).

        - Merge similar patterns
        - Remove outdated skills
        - Prune old episodes
        """
        logger.info("Starting memory consolidation...")

        # Merge similar patterns (by keywords)
        merged_patterns = {}
        for pattern in self.patterns.values():
            key = pattern.pattern_type + "_" + "|".join(sorted(pattern.keywords)[:3])
            if key in merged_patterns:
                existing = merged_patterns[key]
                existing.episodes.extend(pattern.episodes)
                existing.episodes = list(set(existing.episodes))  # Deduplicate
                existing.confidence = max(existing.confidence, pattern.confidence)
            else:
                merged_patterns[key] = pattern

        self.patterns = merged_patterns

        # Remove low-success skills (< 0.3 success rate and used < 5 times)
        self.skills = {
            k: v for k, v in self.skills.items()
            if v.success_rate >= 0.3 or v.usage_count >= 5
        }

        self.consolidation_count += 1

        logger.info(
            f"Consolidation complete: "
            f"{len(self.patterns)} patterns, {len(self.skills)} skills"
        )

    async def _save_memory(self):
        """Save memory to disk."""
        # Save episodes
        episodes_path = self.storage_path / "episodes.jsonl"
        with open(episodes_path, "w", encoding="utf-8") as f:
            for episode in self.episodes.values():
                # Don't save embedding (recompute on load)
                data = episode.to_dict()
                data["embedding"] = None
                f.write(json.dumps(data) + "\n")

        # Save patterns
        patterns_path = self.storage_path / "patterns.json"
        with open(patterns_path, "w", encoding="utf-8") as f:
            json.dump(
                {k: v.to_dict() for k, v in self.patterns.items()},
                f,
                indent=2
            )

        # Save skills
        skills_path = self.storage_path / "skills.json"
        with open(skills_path, "w", encoding="utf-8") as f:
            json.dump(
                {k: v.to_dict() for k, v in self.skills.items()},
                f,
                indent=2
            )

        logger.debug("Memory saved to disk")

    def _load_memory(self):
        """Load memory from disk."""
        # Load episodes
        episodes_path = self.storage_path / "episodes.jsonl"
        if episodes_path.exists():
            with open(episodes_path, "r", encoding="utf-8") as f:
                for line in f:
                    if line.strip():
                        data = json.loads(line)
                        self.episodes[data["episode_id"]] = Episode.from_dict(data)

        # Load patterns
        patterns_path = self.storage_path / "patterns.json"
        if patterns_path.exists():
            with open(patterns_path, "r", encoding="utf-8") as f:
                data = json.load(f)
                self.patterns = {k: Pattern.from_dict(v) for k, v in data.items()}

        # Load skills
        skills_path = self.storage_path / "skills.json"
        if skills_path.exists():
            with open(skills_path, "r", encoding="utf-8") as f:
                data = json.load(f)
                self.skills = {k: Skill.from_dict(v) for k, v in data.items()}

        logger.debug(f"Loaded {len(self.episodes)} episodes from disk")


# ============================================
# SINGLETON
# ============================================

_memory_instance: Optional[HierarchicalMemory] = None


def get_memory() -> HierarchicalMemory:
    """Get global memory instance (singleton)."""
    global _memory_instance
    if _memory_instance is None:
        _memory_instance = HierarchicalMemory()
    return _memory_instance
