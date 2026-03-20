"""
LLM Provider Configuration Models

Pydantic models for type-safe configuration of LLM providers.
"""

from typing import Optional, List
from pydantic import BaseModel, Field, field_validator, model_validator
from enum import Enum


class ProviderType(str, Enum):
    """Available LLM provider types."""
    OLLAMA = "ollama"
    GLM = "glm"           # GLM-4.5 (ZhipuAI)
    CLAUDE = "claude"     # Anthropic Claude
    OPENAI = "openai"     # OpenAI GPT-4
    DUAL = "dual"         # Parallel execution


class TaskType(str, Enum):
    """Task types for provider routing."""
    CODE_GENERATION = "code_generation"
    ANALYSIS = "analysis"
    FAST_ANALYSIS = "fast_analysis"
    NOVELTY_SCORING = "novelty_scoring"
    ARCHITECTURE_PARSING = "architecture_parsing"
    CODE_REVIEW = "code_review"
    DOCUMENTATION = "documentation"
    SUPERVISOR = "supervisor"
    EMBEDDING = "embedding"


class ExecutionMode(str, Enum):
    """Execution modes for dual-LLM operation."""
    LOCAL = "local"           # Only Ollama
    CLOUD = "cloud"           # Only cloud APIs
    PARALLEL = "parallel"     # Run both, merge results
    FALLBACK = "fallback"     # Try cloud, fallback to local


class ProviderConfig(BaseModel):
    """Base configuration for any LLM provider."""
    provider_type: ProviderType
    model: str
    api_key: Optional[str] = None
    base_url: Optional[str] = None
    temperature: float = 0.7
    max_tokens: int = 2000
    max_context_length: int = 4096
    supports_streaming: bool = False
    timeout_seconds: int = 120
    max_retries: int = 3
    retry_delay_seconds: int = 1

    # Rate limiting
    rate_limit_rpm: Optional[int] = None  # Requests per minute
    rate_limit_tpm: Optional[int] = None  # Tokens per minute

    # Cost tracking
    cost_per_1k_input_tokens: float = 0.0
    cost_per_1k_output_tokens: float = 0.0


class OllamaConfig(ProviderConfig):
    """Ollama-specific configuration."""
    provider_type: ProviderType = ProviderType.OLLAMA
    base_url: str = "http://localhost:11434"
    supports_streaming: bool = True
    cost_per_1k_input_tokens: float = 0.0  # Free
    cost_per_1k_output_tokens: float = 0.0


class GLMConfig(ProviderConfig):
    """
    GLM-4.5 configuration (Z.ai or ZhipuAI).

    Supports multiple GLM API providers:
    - Z.ai: https://z.ai (OpenAI-compatible API)
    - ZhipuAI: https://open.bigmodel.cn (official SDK)

    Set GLM_API_PROVIDER to 'z.ai' or 'zhipuai' in environment.
    """
    provider_type: ProviderType = ProviderType.GLM
    api_key: str
    api_provider: str = "z.ai"  # 'z.ai' or 'zhipuai'
    base_url: Optional[str] = None  # Will be set by validator

    model: str = "glm-4.7"  # Z.ai models: glm-4.7, glm-4.6, glm-4.5, glm-4.5-air
    supports_streaming: bool = True
    max_context_length: int = 128000
    cost_per_1k_input_tokens: float = 0.005  # ~¥0.04
    cost_per_1k_output_tokens: float = 0.005
    rate_limit_rpm: int = 60

    @model_validator(mode="after")
    def set_base_url(self):
        """Set base_url based on api_provider setting."""
        if self.base_url is None:
            if self.api_provider == "z.ai":
                self.base_url = "https://api.z.ai/api/paas/v4/"
            else:  # zhipuai
                self.base_url = "https://open.bigmodel.cn/api/paas/v4/"
        return self


class ClaudeConfig(ProviderConfig):
    """Anthropic Claude configuration."""
    provider_type: ProviderType = ProviderType.CLAUDE
    api_key: str
    base_url: str = "https://api.anthropic.com"
    model: str = "claude-3-5-sonnet-20241022"
    supports_streaming: bool = True
    max_context_length: int = 200000
    cost_per_1k_input_tokens: float = 0.003
    cost_per_1k_output_tokens: float = 0.015
    rate_limit_rpm: int = 50


class OpenAIConfig(ProviderConfig):
    """OpenAI GPT-4 configuration."""
    provider_type: ProviderType = ProviderType.OPENAI
    api_key: str
    base_url: str = "https://api.openai.com/v1"
    model: str = "gpt-4o"
    supports_streaming: bool = True
    max_context_length: int = 128000
    cost_per_1k_input_tokens: float = 0.005
    cost_per_1k_output_tokens: float = 0.015
    rate_limit_rpm: int = 10000


class DualProviderConfig(BaseModel):
    """Configuration for parallel/fallback execution mode."""
    primary_provider: ProviderType
    secondary_provider: ProviderType
    execution_mode: ExecutionMode
    merge_strategy: str = "prefer_primary"  # prefer_primary | prefer_cloud | vote | ensemble
    timeout_primary: int = 30  # Seconds before triggering fallback


class TaskMapping(BaseModel):
    """Maps task types to providers."""
    task_type: TaskType
    primary: ProviderType
    fallback: Optional[ProviderType] = None
    use_parallel: bool = False


class LLMProvidersConfig(BaseModel):
    """Top-level configuration for LLM providers system."""
    execution_mode: ExecutionMode = ExecutionMode.FALLBACK
    daily_cost_limit: float = 10.0

    # Task mappings
    task_mappings: List[TaskMapping] = Field(default_factory=list)

    # Provider configurations
    ollama: Optional[OllamaConfig] = None
    glm: Optional[GLMConfig] = None
    claude: Optional[ClaudeConfig] = None
    openai: Optional[OpenAIConfig] = None

    class Config:
        use_enum_values = True
