"""
Token Counter Utility

Counts tokens for various LLM models to track usage and costs.
Supports OpenAI-compatible tokenizers and falls back to character-based estimation.
"""

import tiktoken
from typing import Optional


class TokenCounter:
    """
    Counts tokens for different LLM models.

    Uses tiktoken for accurate tokenization when possible,
    falls back to character-based estimation otherwise.
    """

    # Token encodings cache
    _encodings = {}

    @classmethod
    def count_tokens(cls, text: str, model: str = "gpt-4") -> int:
        """
        Count tokens in text for a specific model.

        Args:
            text: Input text to count tokens for
            model: Model name to determine encoding

        Returns:
            Number of tokens
        """
        if not text:
            return 0

        try:
            encoding = cls._get_encoding(model)
            return len(encoding.encode(text))
        except Exception:
            # Fallback: ~4 chars per token (rough estimate)
            return len(text) // 4

    @classmethod
    def _get_encoding(cls, model: str):
        """Get tiktoken encoding for model, with caching."""
        if model not in cls._encodings:
            # Map models to encodings
            if model.startswith("gpt-4") or model.startswith("glm"):
                encoding_name = "cl100k_base"
            elif model.startswith("gpt-3.5"):
                encoding_name = "cl100k_base"
            elif model.startswith("claude"):
                # Claude uses similar encoding to GPT-4
                encoding_name = "cl100k_base"
            else:
                # Default encoding
                encoding_name = "cl100k_base"

            cls._encodings[model] = tiktoken.get_encoding(encoding_name)

        return cls._encodings[model]

    @classmethod
    def count_messages_tokens(
        cls,
        messages: list,
        model: str = "gpt-4"
    ) -> int:
        """
        Count tokens in a list of messages.

        Args:
            messages: List of message dicts with 'role' and 'content'
            model: Model name for encoding

        Returns:
            Total token count
        """
        total = 0
        encoding = cls._get_encoding(model)

        # Add tokens for each message
        for message in messages:
            # Every message follows <im_start>{role/name}\n{content}<im_end>\n
            role = message.get("role", "user")
            content = message.get("content", "")

            total += len(encoding.encode(role))
            total += len(encoding.encode(content))
            total += 4  # For <im_start>, <im_end>, newlines

        # Add tokens for overall prompt
        total += 3  # For reply start

        return total

    @classmethod
    def estimate_max_completion_tokens(
        cls,
        prompt_tokens: int,
        model: str,
        max_context: int = 128000
    ) -> int:
        """
        Estimate maximum tokens available for completion.

        Args:
            prompt_tokens: Tokens used in prompt
            model: Model name
            max_context: Model's maximum context window

        Returns:
            Maximum tokens available for completion
        """
        # Reserve some tokens for response
        reserved = 100
        available = max_context - prompt_tokens - reserved
        return max(0, available)
