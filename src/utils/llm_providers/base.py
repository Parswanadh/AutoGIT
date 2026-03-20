"""
Base LLM Provider Abstract Class

Defines the common interface that all LLM providers must implement.
Ensures consistency across local (Ollama) and cloud (GLM, Claude, GPT-4) providers.
"""

from abc import ABC, abstractmethod
from typing import Dict, Any, List, Optional
from langchain_core.language_models.chat_models import BaseChatModel
from langchain_core.messages import BaseMessage


class BaseLLMProvider(ABC):
    """
    Abstract base class for all LLM providers.

    All providers (Ollama, GLM, Claude, etc.) must implement these methods
    to ensure a consistent interface for the LLMFactory.

    Example:
        provider = OllamaProvider(config)
        result = await provider.generate("Hello, world!")
        print(result["content"])  # "Hello! How can I help you?"
    """

    def __init__(self, config: Any):
        """
        Initialize provider with configuration.

        Args:
            config: Provider-specific config (OllamaConfig, GLMConfig, etc.)
        """
        self.config = config
        self.model = config.model

    @abstractmethod
    async def generate(
        self,
        prompt: str,
        temperature: Optional[float] = None,
        max_tokens: Optional[int] = None,
        **kwargs
    ) -> Dict[str, Any]:
        """
        Generate completion from a text prompt.

        Args:
            prompt: The input prompt text
            temperature: Sampling temperature (0.0 to 1.0)
            max_tokens: Maximum tokens to generate
            **kwargs: Additional provider-specific parameters

        Returns:
            Dict with keys:
                - content: str - Generated text
                - model: str - Model name used
                - tokens_used: int - Total tokens consumed
                - finish_reason: str - Why generation stopped
                - cost_usd: float - API cost (0.0 for local)
                - provider: str - Provider name (e.g., "ollama", "glm")
                - latency_seconds: float - Request duration
        """
        pass

    @abstractmethod
    async def chat(
        self,
        messages: List[BaseMessage],
        temperature: Optional[float] = None,
        max_tokens: Optional[int] = None,
        **kwargs
    ) -> Dict[str, Any]:
        """
        Chat completion with message history.

        Args:
            messages: List of LangChain BaseMessage objects
            temperature: Sampling temperature
            max_tokens: Maximum tokens to generate
            **kwargs: Additional provider-specific parameters

        Returns:
            Same format as generate(), with response content
        """
        pass

    @abstractmethod
    async def embed(self, text: str) -> List[float]:
        """
        Generate embedding vector for text.

        Args:
            text: Input text to embed

        Returns:
            List of floats representing the embedding vector
        """
        pass

    @abstractmethod
    async def health_check(self) -> bool:
        """
        Check if the provider is available and healthy.

        Returns:
            True if provider is accessible, False otherwise
        """
        pass

    @abstractmethod
    def get_langchain_model(self) -> BaseChatModel:
        """
        Get a LangChain-compatible chat model instance.

        This enables seamless integration with LangGraph and other
        LangChain components.

        Returns:
            LangChain BaseChatModel instance configured for this provider
        """
        pass

    def supports_streaming(self) -> bool:
        """Check if provider supports streaming responses."""
        return getattr(self.config, 'supports_streaming', False)

    def get_max_context(self) -> int:
        """Get maximum context window size in tokens."""
        return getattr(self.config, 'max_context_length', 4096)

    def get_provider_name(self) -> str:
        """Get the provider name (e.g., 'ollama', 'glm', 'claude')."""
        return getattr(self.config, 'provider_type', 'unknown')

    async def __aenter__(self):
        """Async context manager entry."""
        await self.health_check()
        return self

    async def __aexit__(self, exc_type, exc_val, exc_tb):
        """Async context manager exit - cleanup resources."""
        pass
