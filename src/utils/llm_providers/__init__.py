"""
LLM Providers Package

Dual-mode LLM system supporting local Ollama and cloud APIs (GLM-4.5, Claude, GPT-4).

This package provides a unified interface for multiple LLM providers with:
- Automatic fallback (cloud → local)
- Parallel execution with result merging
- Cost tracking and rate limiting
- Health monitoring and circuit breakers
"""

from .base import BaseLLMProvider
from .factory import LLMFactory

__all__ = [
    "BaseLLMProvider",
    "LLMFactory",
]
