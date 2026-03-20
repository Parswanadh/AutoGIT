"""
Data models and schemas for the pipeline.
"""

from typing import List, Dict, Optional, TypedDict, Union
from datetime import datetime
from pydantic import BaseModel, Field


# ============================================
# DISCOVERY MODELS (TIER 1)
# ============================================

class PaperMetadata(BaseModel):
    """Metadata for a research paper from arXiv."""
    arxiv_id: str
    title: str
    authors: List[str]
    abstract: str
    pdf_url: str
    published_date: datetime
    categories: List[str]
    
    class Config:
        json_schema_extra = {
            "example": {
                "arxiv_id": "1706.03762",
                "title": "Attention is All You Need",
                "authors": ["Ashish Vaswani", "Noam Shazeer"],
                "abstract": "The dominant sequence transduction models...",
                "pdf_url": "https://arxiv.org/pdf/1706.03762.pdf",
                "published_date": "2017-06-12T00:00:00",
                "categories": ["cs.CL", "cs.LG"]
            }
        }


class NoveltyResult(BaseModel):
    """Result of novelty classification."""
    score: float = Field(..., ge=0, le=10, description="Novelty score 0-10")
    category: str = Field(..., description="new | incremental | reproduction")
    key_innovations: List[str]
    semantic_similarity: float = Field(..., ge=0, le=1)
    gpt_analysis: Optional[str] = None
    threshold_pass: bool


class PriorityResult(BaseModel):
    """Result of priority calculation."""
    complexity: float = Field(..., ge=0, le=10)
    required_vram_gb: Optional[int] = None
    estimated_lines_of_code: Optional[int] = None
    priority: float = Field(..., ge=0, le=1)
    should_proceed: bool
    challenges: List[str] = []


# ============================================
# ANALYSIS MODELS (TIER 2)
# ============================================

class ExtractedContent(BaseModel):
    """Extracted content from a research paper."""
    sections: Dict[str, str] = Field(
        default_factory=dict,
        description="Section name -> content mapping"
    )
    algorithms: List[str] = []
    figures: List[Dict[str, str]] = []
    hyperparameters: Dict[str, str] = {}  # Changed from any to str
    dependencies: List[str] = []
    full_text: str


class ArchitectureSpec(BaseModel):
    """Architecture specification parsed from paper."""
    name: str
    model_type: str  # "transformer" | "cnn" | "rnn" | "gan" | "diffusion" | "other"
    layers: List[Dict] = []
    connections: List[Dict] = []
    pseudocode: str
    input_shape: Optional[List[int]] = None
    output_shape: Optional[List[int]] = None
    key_components: List[str] = []


class DependencySpec(BaseModel):
    """Technical dependencies specification."""
    requirements_txt: str
    python_version: str = ">=3.8"
    cuda_required: bool = False
    cuda_version: Optional[str] = None
    frameworks: List[str] = []
    datasets: List[str] = []
    environment_yaml: Optional[str] = None


# ============================================
# GENERATION MODELS (TIER 3)
# ============================================

class GeneratedCode(BaseModel):
    """Generated code files."""
    model_file: str
    train_file: str
    evaluate_file: str
    data_loader_file: str
    utils_file: str
    config_file: str
    requirements_file: str
    readme_file: Optional[str] = None


class ValidationResult(BaseModel):
    """Code validation result."""
    syntax_valid: bool
    type_checks_pass: bool
    lint_score: float = Field(..., ge=0, le=100)
    tests_pass: bool
    test_coverage: float = Field(default=0, ge=0, le=100)
    errors: List[str] = []
    warnings: List[str] = []
    quality_score: float = Field(..., ge=0, le=100)


class OptimizationReport(BaseModel):
    """Code optimization report."""
    original_quality: float
    optimized_quality: float
    improvements: List[str] = []
    performance_gain: Optional[str] = None
    optimized_code: Optional[GeneratedCode] = None


# ============================================
# PUBLISHING MODELS (TIER 4)
# ============================================

class LocalRepo(BaseModel):
    """Local repository structure."""
    path: str
    structure: Dict[str, str] = {}  # Changed from any to str
    total_files: int
    total_lines: int


class Documentation(BaseModel):
    """Generated documentation."""
    readme_md: str
    api_docs: Optional[str] = None
    quickstart_notebook: Optional[str] = None
    tutorial_notebook: Optional[str] = None
    contributing_md: Optional[str] = None


class PublishResult(BaseModel):
    """GitHub publishing result."""
    github_url: str
    repo_name: str
    is_published: bool
    release_tag: Optional[str] = None
    release_notes: Optional[str] = None
    topics: List[str] = []


# ============================================
# PIPELINE STATE
# ============================================

class PipelineState(TypedDict, total=False):
    """Complete pipeline state."""
    # Metadata
    paper_id: str
    arxiv_id: str
    status: str  # "discovered" | "analyzed" | "generated" | "published" | "failed"
    created_at: str
    updated_at: str
    
    # Discovery (Tier 1)
    discovered_papers: List[PaperMetadata]
    current_paper: PaperMetadata
    novelty_analysis: NoveltyResult
    priority_result: PriorityResult
    
    # Analysis (Tier 2)
    extracted_content: ExtractedContent
    architecture_spec: ArchitectureSpec
    dependency_spec: DependencySpec
    
    # Generation (Tier 3)
    generated_code: GeneratedCode
    validation_result: ValidationResult
    optimization_report: OptimizationReport
    
    # Publishing (Tier 4)
    local_repo: LocalRepo
    documentation: Documentation
    publish_result: PublishResult
    
    # Tracking
    error_log: List[str]
    checkpoint_timestamp: str
    retry_count: int
    total_tokens_used: int
    total_cost_usd: float


# ============================================
# API RESPONSE MODELS
# ============================================

class GroqResponse(BaseModel):
    """Standardized Groq API response."""
    content: str
    model: str
    tokens_used: int
    finish_reason: str
    error: Optional[str] = None


class OllamaResponse(BaseModel):
    """Standardized Ollama response."""
    content: str
    model: str
    error: Optional[str] = None


# ============================================
# PROBLEM EXTRACTION MODELS (TIER 2 - NEW!)
# ============================================

class ProblemStatement(BaseModel):
    """Structured problem statement extracted from paper."""
    domain: str = Field(..., description="Research domain (CV, NLP, RL, etc.)")
    challenge: str = Field(..., description="Core problem being addressed")
    current_solutions: List[str] = Field(default_factory=list, description="Existing approaches mentioned")
    limitations: List[str] = Field(default_factory=list, description="Why current solutions fail")
    datasets: List[str] = Field(default_factory=list, description="Evaluation benchmarks")
    metrics: List[str] = Field(default_factory=list, description="Success criteria")
    requirements: List[str] = Field(default_factory=list, description="Technical requirements")
    paper_solution: str = Field(..., description="How the paper solves it")


# ============================================
# CRITIC-GENERATOR DEBATE MODELS (TIER 2.5 - NEW!)
# ============================================

class SolutionProposal(BaseModel):
    """A proposed novel solution to a problem."""
    approach_name: str = Field(..., description="Name of the approach")
    key_innovation: str = Field(..., description="What makes this novel")
    architecture_design: str = Field(..., description="High-level architecture")
    implementation_plan: Union[str, List[str]] = Field(..., description="Implementation steps (string or list)")
    expected_advantages: List[str] = Field(default_factory=list, description="Why better than baselines")
    potential_challenges: List[str] = Field(default_factory=list, description="What could go wrong")
    expected_performance: str = Field(..., description="Expected results")
    iteration: int = Field(1, description="Which iteration of refinement")


class CritiqueReport(BaseModel):
    """Expert critique of a solution proposal."""
    overall_assessment: str = Field(..., description="promising | needs-work | flawed")
    strengths: List[str] = Field(default_factory=list, description="What's good")
    weaknesses: List[str] = Field(default_factory=list, description="What's problematic")
    technical_concerns: List[str] = Field(default_factory=list, description="Implementation issues")
    missing_considerations: List[str] = Field(default_factory=list, description="What was overlooked")
    real_world_feasibility: float = Field(..., ge=0, le=10, description="Can this actually work?")
    optimization_suggestions: List[str] = Field(default_factory=list, description="How to improve")
    verdict: str = Field(..., description="accept | revise | reject")


class DebateRound(BaseModel):
    """One round of debate between generator and critic."""
    round_number: int
    solution: SolutionProposal
    critique: CritiqueReport
    timestamp: datetime = Field(default_factory=datetime.now)


class FinalSolution(BaseModel):
    """Final solution after debate convergence."""
    solution: SolutionProposal
    debate_history: List[DebateRound] = Field(default_factory=list)
    consensus_reached: bool
    confidence_score: float = Field(..., ge=0, le=10)
    iterations_taken: int
    final_verdict: str = Field(..., description="Solution quality assessment")


class ValidationResult(BaseModel):
    """Real-world validation of solution feasibility."""
    is_feasible: bool
    feasibility_score: float = Field(..., ge=0, le=10)
    hardware_check: Dict[str, bool] = Field(default_factory=dict)
    dataset_check: Dict[str, bool] = Field(default_factory=dict)
    implementation_check: Dict[str, bool] = Field(default_factory=dict)
    blocking_issues: List[str] = Field(default_factory=list)
    warnings: List[str] = Field(default_factory=list)
    recommendations: List[str] = Field(default_factory=list)

