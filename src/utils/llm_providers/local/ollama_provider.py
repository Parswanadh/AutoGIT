"""
Ollama Provider - Local LLM Provider

Wraps the existing OllamaClient to implement the BaseLLMProvider interface.
Provides free local inference with models like deepseek-coder, qwen3, etc.
"""

import time
from typing import Dict, Any, List, Optional
from langchain_core.messages import BaseMessage
from langchain_ollama import ChatOllama
from langchain_core.language_models.chat_models import BaseChatModel

from ..base import BaseLLMProvider
from ..config import OllamaConfig
from ...ollama_client import get_ollama_client
from ...logger import get_logger


logger = get_logger("ollama_provider")


class OllamaProvider(BaseLLMProvider):
    """
    Ollama provider wrapper for local model inference.

    Wraps the existing OllamaClient to implement the BaseLLMProvider interface.
    Provides free local inference with models like deepseek-coder, qwen3, etc.
    """

    def __init__(self, config: OllamaConfig):
        """
        Initialize Ollama provider.

        Args:
            config: Ollama configuration
        """
        super().__init__(config)
        self._client = None  # Lazy initialization
        self._langchain_model = None
        logger.info(f"OllamaProvider initialized with model: {config.model}")

    def _get_client(self):
        """Get Ollama client singleton."""
        if self._client is None:
            self._client = get_ollama_client()
        return self._client

    async def generate(
        self,
        prompt: str,
        temperature: Optional[float] = None,
        max_tokens: Optional[int] = None,
        **kwargs
    ) -> Dict[str, Any]:
        """
        Generate completion using Ollama.

        Args:
            prompt: Input prompt text
            temperature: Sampling temperature
            max_tokens: Maximum tokens to generate
            **kwargs: Additional parameters

        Returns:
            Response dict with content, tokens, cost (always 0.0 for local)
        """
        start_time = time.time()
        client = self._get_client()

        try:
            response = await client.generate(
                model=self.model,
                prompt=prompt,
                temperature=temperature or self.config.temperature,
                max_tokens=max_tokens or self.config.max_tokens,
                **kwargs
            )

            latency = time.time() - start_time

            return {
                "content": response.get("response", ""),
                "model": response.get("model", self.model),
                "tokens_used": response.get("eval_count", 0) + response.get("prompt_eval_count", 0),
                "finish_reason": "done" if response.get("done") else "length",
                "cost_usd": 0.0,  # Free
                "provider": "ollama",
                "latency_seconds": latency
            }

        except Exception as e:
            logger.error(f"Ollama generation failed: {str(e)}")
            raise

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
            **kwargs: Additional parameters

        Returns:
            Response dict
        """
        start_time = time.time()
        client = self._get_client()

        try:
            # Convert LangChain messages to Ollama format
            ollama_messages = []
            for msg in messages:
                role = msg.type if hasattr(msg, 'type') else 'user'
                content = msg.content if hasattr(msg, 'content') else str(msg)
                ollama_messages.append({"role": role, "content": content})

            response = await client.chat(
                model=self.model,
                messages=ollama_messages,
                temperature=temperature or self.config.temperature,
                max_tokens=max_tokens or self.config.max_tokens
            )

            latency = time.time() - start_time

            return {
                "content": response.get("content", ""),
                "model": response.get("model", self.model),
                "tokens_used": response.get("eval_count", 0),
                "finish_reason": "done" if response.get("done") else "length",
                "cost_usd": 0.0,
                "provider": "ollama",
                "latency_seconds": latency
            }

        except Exception as e:
            logger.error(f"Ollama chat failed: {str(e)}")
            raise

    async def embed(self, text: str) -> List[float]:
        """
        Generate embedding for text.

        Args:
            text: Input text

        Returns:
            Embedding vector
        """
        client = self._get_client()

        try:
            # Use embedding model from config or default
            embedding_model = getattr(self.config, 'embedding_model', 'all-minilm')
            return await client.embed(model=embedding_model, text=text)
        except Exception as e:
            logger.error(f"Ollama embedding failed: {str(e)}")
            raise

    async def health_check(self) -> bool:
        """
        Check if Ollama is running and accessible.

        Returns:
            True if healthy, False otherwise
        """
        try:
            client = self._get_client()
            return await client.health_check()
        except Exception as e:
            logger.error(f"Ollama health check failed: {str(e)}")
            return False

    def get_langchain_model(self) -> BaseChatModel:
        """
        Get LangChain-compatible ChatOllama instance.

        Returns:
            LangChain ChatOllama model
        """
        if self._langchain_model is None:
            self._langchain_model = ChatOllama(
                model=self.model,
                base_url=self.config.base_url,
                temperature=self.config.temperature,
                num_predict=self.config.max_tokens
            )

        return self._langchain_model

    def get_provider_name(self) -> str:
        """Get provider name."""
        return "ollama"
