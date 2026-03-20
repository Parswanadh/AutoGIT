"""
LLM Factory - Central Provider Orchestrator

Singleton factory that manages LLM provider selection and instantiation.
Handles provider routing based on task type and execution mode.
"""

import os
import asyncio
from typing import Optional, Dict, Any
from .config import (
    ProviderType, TaskType, ExecutionMode,
    OllamaConfig, GLMConfig, ClaudeConfig, OpenAIConfig,
    DualProviderConfig
)
from .base import BaseLLMProvider


class LLMFactory:
    """
    Central factory for creating and managing LLM providers.

    Implements singleton pattern to ensure consistent configuration
    across the application. Handles provider selection, fallback,
    and parallel execution routing.

    Usage:
        factory = LLMFactory()
        provider = await factory.get_provider(TaskType.CODE_GENERATION)
        result = await provider.generate("Write hello world in Python")
    """

    _instance: Optional["LLMFactory"] = None

    def __new__(cls):
        if cls._instance is None:
            cls._instance = super().__new__(cls)
        return cls._instance

    def __init__(self):
        """Initialize factory and load configuration."""
        if not hasattr(self, '_initialized'):
            self._initialized = True
            self._providers: Dict[ProviderType, BaseLLMProvider] = {}
            self._execution_mode: Optional[ExecutionMode] = None
            self._task_mappings: Dict[TaskType, ProviderType] = {}
            self._configs: Dict[ProviderType, Any] = {}
            self._load_configuration()

    def _load_configuration(self):
        """
        Load provider configurations from environment variables.

        Reads from .env file and environment variables.
        """
        # Load execution mode
        mode_str = os.getenv("LLM_EXECUTION_MODE", "")
        if mode_str:
            try:
                self._execution_mode = ExecutionMode(mode_str)
            except ValueError:
                self._execution_mode = ExecutionMode.FALLBACK
        else:
            # Will prompt user later
            self._execution_mode = None

        # Load Ollama config
        self._configs[ProviderType.OLLAMA] = OllamaConfig(
            model=os.getenv("LOCAL_ANALYSIS_MODEL", "qwen3:4b"),
            base_url=os.getenv("OLLAMA_BASE_URL", "http://localhost:11434")
        )

        # Load GLM config (primary cloud provider)
        glm_key = os.getenv("GLM_API_KEY")
        if glm_key:
            api_provider = os.getenv("GLM_API_PROVIDER", "z.ai")  # 'z.ai' or 'zhipuai'
            self._configs[ProviderType.GLM] = GLMConfig(
                api_key=glm_key,
                api_provider=api_provider,
                model=os.getenv("GLM_MODEL", "glm-4.7" if api_provider == "z.ai" else "glm-4-plus")
            )

        # Load Claude config (optional)
        claude_key = os.getenv("ANTHROPIC_API_KEY")
        if claude_key:
            self._configs[ProviderType.CLAUDE] = ClaudeConfig(
                api_key=claude_key,
                model=os.getenv("CLAUDE_MODEL", "claude-3-5-sonnet-20241022")
            )

        # Load OpenAI config (optional)
        openai_key = os.getenv("OPENAI_API_KEY")
        if openai_key:
            self._configs[ProviderType.OPENAI] = OpenAIConfig(
                api_key=openai_key,
                model=os.getenv("OPENAI_MODEL", "gpt-4o")
            )

        # Set default task mappings (can be overridden by config.yaml)
        self._task_mappings = {
            TaskType.CODE_GENERATION: ProviderType.GLM,
            TaskType.ANALYSIS: ProviderType.GLM,
            TaskType.FAST_ANALYSIS: ProviderType.OLLAMA,
            TaskType.NOVELTY_SCORING: ProviderType.GLM,
            TaskType.ARCHITECTURE_PARSING: ProviderType.GLM,
            TaskType.CODE_REVIEW: ProviderType.CLAUDE if claude_key else ProviderType.GLM,
            TaskType.DOCUMENTATION: ProviderType.OLLAMA,
            TaskType.SUPERVISOR: ProviderType.OLLAMA,
            TaskType.EMBEDDING: ProviderType.OLLAMA,
        }

    def set_execution_mode(self, mode: ExecutionMode):
        """
        Set the execution mode for provider selection.

        Args:
            mode: Execution mode (local, cloud, parallel, fallback)
        """
        self._execution_mode = mode

    async def get_provider(
        self,
        task_type: TaskType,
        mode: Optional[ExecutionMode] = None
    ) -> BaseLLMProvider:
        """
        Get appropriate provider for task type and execution mode.

        Args:
            task_type: Type of task (code_generation, analysis, etc.)
            mode: Execution mode (overrides default if provided)

        Returns:
            Initialized provider instance

        Raises:
            ValueError: If no suitable provider is available
            RuntimeError: If provider health check fails
        """
        mode = mode or self._execution_mode or ExecutionMode.FALLBACK

        # Get primary provider for task
        primary_provider_type = self._task_mappings.get(task_type, ProviderType.OLLAMA)

        if mode == ExecutionMode.LOCAL:
            return await self._create_provider(ProviderType.OLLAMA)

        elif mode == ExecutionMode.CLOUD:
            # Use cloud provider, fall back to local if unavailable
            if primary_provider_type == ProviderType.OLLAMA:
                primary_provider_type = ProviderType.GLM

            if primary_provider_type in self._configs:
                return await self._create_provider(primary_provider_type)
            else:
                # No cloud provider configured, use local
                return await self._create_provider(ProviderType.OLLAMA)

        elif mode == ExecutionMode.PARALLEL:
            # Return DualProvider for parallel execution
            from .hybrid.dual_provider import DualProvider

            secondary = ProviderType.OLLAMA if primary_provider_type != ProviderType.OLLAMA else ProviderType.GLM

            # Only use parallel if we have both providers
            if primary_provider_type in self._configs and secondary in self._configs:
                return DualProvider(
                    primary=await self._create_provider(primary_provider_type),
                    secondary=await self._create_provider(secondary),
                    merge_strategy="prefer_cloud"
                )
            else:
                # Fall back to single provider
                return await self._create_provider(primary_provider_type)

        elif mode == ExecutionMode.FALLBACK:
            # Try cloud first, fallback to local
            from .hybrid.dual_provider import DualProvider

            if primary_provider_type == ProviderType.OLLAMA:
                # Task is configured for local, just use it
                return await self._create_provider(ProviderType.OLLAMA)

            # Try cloud with local fallback
            if primary_provider_type in self._configs:
                return DualProvider(
                    primary=await self._create_provider(primary_provider_type),
                    secondary=await self._create_provider(ProviderType.OLLAMA),
                    merge_strategy="fallback"
                )
            else:
                # No cloud provider configured
                return await self._create_provider(ProviderType.OLLAMA)

        raise RuntimeError(f"No provider available for task type: {task_type}")

    async def _create_provider(self, provider_type: ProviderType) -> BaseLLMProvider:
        """
        Create provider instance (with caching).

        Args:
            provider_type: Type of provider to create

        Returns:
            Initialized provider instance

        Raises:
            ValueError: If provider configuration is missing
            RuntimeError: If provider health check fails
        """
        # Check cache first
        if provider_type in self._providers:
            cached_provider = self._providers[provider_type]
            # Verify health
            if await cached_provider.health_check():
                return cached_provider
            else:
                # Remove unhealthy provider from cache
                del self._providers[provider_type]

        # Get configuration
        config = self._configs.get(provider_type)
        if not config:
            raise ValueError(f"No configuration for provider: {provider_type}")

        # Import and instantiate provider
        if provider_type == ProviderType.OLLAMA:
            from .local.ollama_provider import OllamaProvider
            provider = OllamaProvider(config)
        elif provider_type == ProviderType.GLM:
            from .cloud.glm_provider import GLMProvider
            provider = GLMProvider(config)
        elif provider_type == ProviderType.CLAUDE:
            from .cloud.claude_provider import ClaudeProvider
            provider = ClaudeProvider(config)
        elif provider_type == ProviderType.OPENAI:
            from .cloud.openai_provider import OpenAIProvider
            provider = OpenAIProvider(config)
        else:
            raise ValueError(f"Unknown provider type: {provider_type}")

        # Health check
        if not await provider.health_check():
            raise RuntimeError(f"Provider {provider_type} failed health check")

        # Cache provider
        self._providers[provider_type] = provider
        return provider

    def get_available_providers(self) -> list[ProviderType]:
        """Get list of configured and available providers."""
        return list(self._configs.keys())

    async def get_total_cost_today(self) -> float:
        """Get total API cost for today across all providers."""
        from .utils.cost_tracker import CostTracker
        tracker = CostTracker()
        return await tracker.get_daily_total()

    def reset(self):
        """Reset all cached providers (useful for testing)."""
        self._providers.clear()
        self._initialized = False
        self._load_configuration()

    @classmethod
    def get_instance(cls) -> "LLMFactory":
        """Get the singleton instance."""
        if cls._instance is None:
            cls._instance = cls()
        return cls._instance
