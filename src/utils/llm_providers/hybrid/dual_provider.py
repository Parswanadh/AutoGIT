"""
Dual Provider - Parallel/Fallback Execution

Orchestrates execution across multiple LLM providers.
Supports parallel execution with result merging and fallback strategies.
"""

import asyncio
import time
from typing import Dict, Any, List, Literal, Optional
from langchain_core.messages import BaseMessage
from langchain_core.language_models.chat_models import BaseChatModel

from ..base import BaseLLMProvider
from .response_merger import ResponseMerger
from ...logger import get_logger


logger = get_logger("dual_provider")


class DualProvider(BaseLLMProvider):
    """
    Orchestrates parallel or fallback execution across multiple providers.

    Modes:
    - parallel: Execute both, merge results
    - fallback: Try primary, use secondary on failure
    - race: Execute both, use first to complete

    Example:
        dual = DualProvider(primary=glm_provider, secondary=ollama_provider, mode="fallback")
        result = await dual.generate("Write hello world")
    """

    def __init__(
        self,
        primary: BaseLLMProvider,
        secondary: BaseLLMProvider,
        merge_strategy: Literal["prefer_primary", "prefer_cloud", "vote", "ensemble", "fallback"] = "prefer_cloud"
    ):
        """
        Initialize dual provider.

        Args:
            primary: Primary provider to try first
            secondary: Secondary provider for fallback/parallel
            merge_strategy: How to merge results from both providers
        """
        # Use primary's config for base class
        super().__init__(primary.config)

        self.primary = primary
        self.secondary = secondary
        self.merge_strategy = merge_strategy
        self.merger = ResponseMerger(strategy=merge_strategy)

        logger.info(
            f"DualProvider initialized: primary={primary.get_provider_name()}, "
            f"secondary={secondary.get_provider_name()}, strategy={merge_strategy}"
        )

    @property
    def mode(self) -> str:
        """Get execution mode from merge strategy."""
        return self.merge_strategy

    async def generate(
        self,
        prompt: str,
        temperature: Optional[float] = None,
        max_tokens: Optional[int] = None,
        **kwargs
    ) -> Dict[str, Any]:
        """
        Generate with dual-provider strategy.

        Args:
            prompt: Input prompt
            temperature: Sampling temperature
            max_tokens: Max tokens to generate
            **kwargs: Additional parameters

        Returns:
            Result dict with merged/appropriate response
        """
        if self.merge_strategy == "fallback":
            return await self._generate_with_fallback(prompt, temperature, max_tokens, **kwargs)
        elif self.merge_strategy in ["parallel", "prefer_cloud", "ensemble", "vote"]:
            return await self._generate_parallel(prompt, temperature, max_tokens, **kwargs)
        else:
            return await self._generate_preferred(prompt, temperature, max_tokens, **kwargs)

    async def _generate_with_fallback(
        self,
        prompt: str,
        temperature: Optional[float],
        max_tokens: Optional[int],
        **kwargs
    ) -> Dict[str, Any]:
        """
        Try primary, fallback to secondary on failure.

        Args:
            prompt: Input prompt
            temperature: Sampling temperature
            max_tokens: Max tokens
            **kwargs: Additional parameters

        Returns:
            Result from primary or secondary
        """
        try:
            logger.debug(f"Trying primary provider: {self.primary.get_provider_name()}")
            result = await self.primary.generate(prompt, temperature, max_tokens, **kwargs)
            result["fallback_used"] = False
            return result

        except Exception as primary_error:
            logger.warning(
                f"Primary provider failed: {primary_error}, "
                f"falling back to {self.secondary.get_provider_name()}"
            )

            try:
                result = await self.secondary.generate(prompt, temperature, max_tokens, **kwargs)
                result["fallback_used"] = True
                result["fallback_from"] = self.primary.get_provider_name()
                result["provider"] = f"{self.secondary.get_provider_name()}_fallback"
                return result

            except Exception as secondary_error:
                logger.error(f"Secondary provider also failed: {secondary_error}")
                raise RuntimeError(
                    f"Both providers failed. Primary: {primary_error}, Secondary: {secondary_error}"
                ) from secondary_error

    async def _generate_parallel(
        self,
        prompt: str,
        temperature: Optional[float],
        max_tokens: Optional[int],
        **kwargs
    ) -> Dict[str, Any]:
        """
        Execute both providers in parallel and merge results.

        Args:
            prompt: Input prompt
            temperature: Sampling temperature
            max_tokens: Max tokens
            **kwargs: Additional parameters

        Returns:
            Merged result from both providers
        """
        start_time = time.time()

        tasks = [
            self.primary.generate(prompt, temperature, max_tokens, **kwargs),
            self.secondary.generate(prompt, temperature, max_tokens, **kwargs)
        ]

        # Execute in parallel, handle exceptions
        results = await asyncio.gather(*tasks, return_exceptions=True)

        # Filter out failures, keep successful results
        valid_results = []
        for i, result in enumerate(results):
            if isinstance(result, Exception):
                logger.warning(f"Provider {i} failed in parallel execution: {result}")
            else:
                valid_results.append(result)

        if not valid_results:
            raise RuntimeError(f"Both providers failed in parallel execution")

        # Merge results
        merged = self.merger.merge_generate_results(valid_results)
        merged["parallel_execution"] = True
        merged["providers_used"] = [r["provider"] for r in valid_results]
        merged["total_latency_seconds"] = time.time() - start_time

        logger.info(
            f"Parallel execution completed: {len(valid_results)} providers, "
            f"strategy={self.merge_strategy}"
        )

        return merged

    async def _generate_preferred(
        self,
        prompt: str,
        temperature: Optional[float],
        max_tokens: Optional[int],
        **kwargs
    ) -> Dict[str, Any]:
        """
        Use preferred provider, fallback on failure.

        Args:
            prompt: Input prompt
            temperature: Sampling temperature
            max_tokens: Max tokens
            **kwargs: Additional parameters

        Returns:
            Result from preferred or fallback provider
        """
        # Determine preferred provider
        if self.merge_strategy == "prefer_cloud":
            preferred = self.primary if self.primary.get_provider_name() != "ollama" else self.secondary
        else:
            preferred = self.primary

        try:
            result = await preferred.generate(prompt, temperature, max_tokens, **kwargs)
            result["fallback_used"] = False
            return result

        except Exception as e:
            logger.warning(f"Preferred provider failed: {e}, trying other provider")

            # Try the other provider
            fallback = self.secondary if preferred == self.primary else self.primary
            result = await fallback.generate(prompt, temperature, max_tokens, **kwargs)
            result["fallback_used"] = True
            result["fallback_from"] = preferred.get_provider_name()
            return result

    async def chat(self, messages: List[BaseMessage], temperature: Optional[float] = None, max_tokens: Optional[int] = None, **kwargs) -> Dict[str, Any]:
        """Chat completion with dual-provider strategy."""
        # Similar to generate() but uses messages
        if self.merge_strategy == "fallback":
            try:
                return await self.primary.chat(messages, temperature, max_tokens, **kwargs)
            except Exception:
                return await self.secondary.chat(messages, temperature, max_tokens, **kwargs)
        else:
            # Parallel execution
            tasks = [
                self.primary.chat(messages, temperature, max_tokens, **kwargs),
                self.secondary.chat(messages, temperature, max_tokens, **kwargs)
            ]
            results = await asyncio.gather(*tasks, return_exceptions=True)
            valid_results = [r for r in results if not isinstance(r, Exception)]

            if not valid_results:
                raise RuntimeError("Both providers failed")

            return self.merger.merge_generate_results(valid_results)

    async def embed(self, text: str) -> List[float]:
        """
        Embeddings use local provider (Ollama) for speed and cost.

        Args:
            text: Input text

        Returns:
            Embedding vector
        """
        # Prefer Ollama for embeddings
        ollama = self.primary if self.primary.get_provider_name() == "ollama" else self.secondary
        return await ollama.embed(text)

    async def health_check(self) -> bool:
        """
        Check if at least one provider is healthy.

        Returns:
            True if at least one provider is healthy
        """
        primary_ok = await self.primary.health_check()
        secondary_ok = await self.secondary.health_check()

        is_healthy = primary_ok or secondary_ok

        if is_healthy:
            logger.info(f"DualProvider health check: primary={primary_ok}, secondary={secondary_ok}")
        else:
            logger.error("DualProvider health check failed: both providers unhealthy")

        return is_healthy

    def get_langchain_model(self) -> BaseChatModel:
        """
        Get LangChain-compatible model (returns preferred provider).

        Returns:
            LangChain model from preferred provider
        """
        if self.merge_strategy == "prefer_cloud":
            return self.primary.get_langchain_model() if self.primary.get_provider_name() != "ollama" else self.secondary.get_langchain_model()
        return self.primary.get_langchain_model()

    def get_provider_name(self) -> str:
        """Get provider name."""
        return f"dual({self.primary.get_provider_name()}+{self.secondary.get_provider_name()})"
