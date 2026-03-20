"""
GLM Provider - Z.ai / ZhipuAI GLM-4.5 Cloud API

Primary cloud provider for high-quality LLM inference.
Supports both Z.ai (OpenAI-compatible) and ZhipuAI (official SDK) APIs.

Providers:
- Z.ai: https://z.ai - OpenAI-compatible API, models: glm-4.7, glm-4.6, glm-4.5
- ZhipuAI: https://open.bigmodel.cn - Official SDK, models: glm-4-plus, glm-4-0520

Authentication:
- Simple Bearer token: "Authorization: Bearer YOUR_API_KEY"
- JWT Token: Generated from id.secret format API key (recommended for Z.ai)
"""

import time
import httpx
from typing import Dict, Any, List, Optional
from langchain_core.messages import BaseMessage
from langchain_core.language_models.chat_models import BaseChatModel

from ..base import BaseLLMProvider
from ..config import GLMConfig
from ..utils.token_counter import TokenCounter
from ..utils.cost_tracker import CostTracker
from ...logger import get_logger

try:
    import jwt
    HAS_JWT = True
except ImportError:
    HAS_JWT = False


logger = get_logger("glm_provider")


class GLMProvider(BaseLLMProvider):
    """
    GLM-4.5 provider for cloud LLM inference.

    Supports multiple API providers:
    - Z.ai (https://z.ai): OpenAI-compatible API, models: glm-4.7, glm-4.6, glm-4.5, glm-4.5-air
    - ZhipuAI (https://open.bigmodel.cn): Official API, models: glm-4-plus, glm-4-0520, glm-4-air

    Primary cloud provider with high-quality reasoning and coding capabilities.
    Uses OpenAI-compatible API format for both providers.
    """

    def __init__(self, config: GLMConfig):
        """
        Initialize GLM provider.

        Args:
            config: GLM configuration with API key
        """
        super().__init__(config)
        self._client = None
        self._cost_tracker = CostTracker()
        self._token_counter = TokenCounter()
        self._langchain_model = None
        self._jwt_token = None
        self._jwt_token_expiry = None
        logger.info(f"GLMProvider initialized with model: {config.model}")

    def _generate_jwt_token(self) -> str:
        """
        Generate JWT token from API key (for Z.ai).

        Based on Z.ai documentation for id.secret format API keys.

        Returns:
            JWT token string
        """
        if not HAS_JWT:
            logger.warning("PyJWT not installed, using direct API key authentication")
            return self.config.api_key

        try:
            api_key = self.config.api_key
            if "." not in api_key:
                logger.debug("API key not in id.secret format, using direct authentication")
                return api_key

            id_part, secret = api_key.split(".", 1)

            # Generate token with 1 hour expiry
            exp_seconds = 3600
            payload = {
                "api_key": id_part,
                "exp": int(round(time.time() * 1000)) + exp_seconds * 1000,
                "timestamp": int(round(time.time() * 1000)),
            }

            token = jwt.encode(
                payload,
                secret,
                algorithm="HS256",
                headers={"alg": "HS256", "sign_type": "SIGN"},
            )

            self._jwt_token_expiry = time.time() + exp_seconds - 60  # Refresh 1 min before expiry
            logger.debug("Generated JWT token for Z.ai authentication")
            return token

        except Exception as e:
            logger.warning(f"Failed to generate JWT token: {e}, using direct API key")
            return self.config.api_key

    def _get_auth_token(self) -> str:
        """
        Get authentication token (JWT or direct API key).

        Returns:
            Bearer token string
        """
        # For Z.ai with id.secret format, try JWT first
        if self.config.api_provider == "z.ai" and "." in self.config.api_key and HAS_JWT:
            # Check if we need to refresh the token
            if self._jwt_token is None or (self._jwt_token_expiry and time.time() >= self._jwt_token_expiry):
                self._jwt_token = self._generate_jwt_token()
            return self._jwt_token

        # For ZhipuAI or simple API keys, use direct authentication
        return self.config.api_key

    def _get_client(self):
        """Get HTTP client for API calls."""
        if self._client is None:
            self._client = httpx.AsyncClient(
                base_url=self.config.base_url,
                headers={
                    "Authorization": f"Bearer {self._get_auth_token()}",
                    "Content-Type": "application/json",
                    "Accept-Language": "en-US,en"
                },
                timeout=self.config.timeout_seconds
            )
        return self._client

    async def generate(
        self,
        prompt: str,
        temperature: Optional[float] = None,
        max_tokens: Optional[int] = None,
        **kwargs
    ) -> Dict[str, Any]:
        """
        Generate completion using GLM-4.5 API.

        Args:
            prompt: Input prompt text
            temperature: Sampling temperature
            max_tokens: Maximum tokens to generate
            **kwargs: Additional parameters

        Returns:
            Response dict with content, tokens, cost
        """
        start_time = time.time()
        client = self._get_client()

        # Count input tokens
        input_tokens = self._token_counter.count_tokens(prompt, self.model)

        try:
            response = await client.post(
                "/chat/completions",
                json={
                    "model": self.model,
                    "messages": [{"role": "user", "content": prompt}],
                    "temperature": temperature or self.config.temperature,
                    "max_tokens": max_tokens or self.config.max_tokens,
                    **kwargs
                }
            )
            response.raise_for_status()
            result = response.json()

            content = result["choices"][0]["message"]["content"]
            output_tokens = self._token_counter.count_tokens(content, self.model)

            # Calculate cost
            input_cost = (input_tokens / 1000) * self.config.cost_per_1k_input_tokens
            output_cost = (output_tokens / 1000) * self.config.cost_per_1k_output_tokens
            total_cost = input_cost + output_cost

            # Track cost
            await self._cost_tracker.record_usage(
                provider="glm",
                model=self.model,
                input_tokens=input_tokens,
                output_tokens=output_tokens,
                cost_usd=total_cost
            )

            latency = time.time() - start_time

            logger.info(
                f"GLM generated {output_tokens} tokens, cost: ${total_cost:.4f}, "
                f"latency: {latency:.2f}s"
            )

            return {
                "content": content,
                "model": result.get("model", self.model),
                "tokens_used": input_tokens + output_tokens,
                "finish_reason": result["choices"][0].get("finish_reason", "stop"),
                "cost_usd": total_cost,
                "provider": "glm",
                "latency_seconds": latency
            }

        except httpx.HTTPStatusError as e:
            if e.response.status_code == 429:
                # Try to get detailed error message
                try:
                    error_data = e.response.json()
                    error_code = error_data.get("error", {}).get("code", "")
                    error_msg = error_data.get("error", {}).get("message", "Rate limit exceeded")

                    if error_code == "1113":
                        msg = f"GLM API: Insufficient balance. Please recharge your Z.ai account at https://z.ai"
                        logger.error(msg)
                        raise RuntimeError(msg) from e
                    else:
                        logger.error(f"GLM API error: {error_msg} (code: {error_code})")
                        raise RuntimeError(f"GLM API error: {error_msg}") from e
                except:
                    logger.error("GLM API rate limit exceeded")
                    raise RuntimeError("GLM API rate limit exceeded") from e
            elif e.response.status_code == 401:
                logger.error("GLM API authentication failed")
                raise RuntimeError("Invalid GLM API key") from e
            else:
                logger.error(f"GLM API error: {e.response.status_code}")
                raise RuntimeError(f"GLM API call failed: {e.response.status_code}") from e
        except Exception as e:
            logger.error(f"GLM generation failed: {str(e)}")
            raise RuntimeError(f"GLM API call failed: {str(e)}") from e

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
            # Convert LangChain messages to GLM format
            glm_messages = []
            for msg in messages:
                role = msg.type if hasattr(msg, 'type') else 'user'
                content = msg.content if hasattr(msg, 'content') else str(msg)
                glm_messages.append({"role": role, "content": content})

            # Count input tokens
            prompt_text = "\n".join([m.get("content", "") for m in glm_messages])
            input_tokens = self._token_counter.count_tokens(prompt_text, self.model)

            response = await client.post(
                "/chat/completions",
                json={
                    "model": self.model,
                    "messages": glm_messages,
                    "temperature": temperature or self.config.temperature,
                    "max_tokens": max_tokens or self.config.max_tokens,
                    **kwargs
                }
            )
            response.raise_for_status()
            result = response.json()

            content = result["choices"][0]["message"]["content"]
            output_tokens = self._token_counter.count_tokens(content, self.model)

            # Calculate cost
            input_cost = (input_tokens / 1000) * self.config.cost_per_1k_input_tokens
            output_cost = (output_tokens / 1000) * self.config.cost_per_1k_output_tokens
            total_cost = input_cost + output_cost

            # Track cost
            await self._cost_tracker.record_usage(
                provider="glm",
                model=self.model,
                input_tokens=input_tokens,
                output_tokens=output_tokens,
                cost_usd=total_cost
            )

            latency = time.time() - start_time

            return {
                "content": content,
                "model": result.get("model", self.model),
                "tokens_used": input_tokens + output_tokens,
                "finish_reason": result["choices"][0].get("finish_reason", "stop"),
                "cost_usd": total_cost,
                "provider": "glm",
                "latency_seconds": latency
            }

        except Exception as e:
            logger.error(f"GLM chat failed: {str(e)}")
            raise

    async def embed(self, text: str) -> List[float]:
        """
        Generate embedding for text.

        Note: GLM doesn't natively support embeddings in the same API.
        This method raises NotImplementedError - use Ollama for embeddings.

        Args:
            text: Input text

        Raises:
            NotImplementedError: GLM doesn't support embeddings
        """
        raise NotImplementedError(
            "GLM API does not support embeddings. "
            "Use Ollama provider for embeddings instead."
        )

    async def health_check(self) -> bool:
        """
        Check if GLM API is accessible.

        Returns:
            True if API is accessible, False otherwise
        """
        try:
            client = self._get_client()
            response = await client.post(
                "/chat/completions",
                json={
                    "model": self.model,
                    "messages": [{"role": "user", "content": "ping"}],
                    "max_tokens": 5
                },
                timeout=5
            )
            is_healthy = response.status_code == 200

            if is_healthy:
                logger.info("GLM API health check passed")
            else:
                # Check for specific error codes
                if response.status_code == 429:
                    try:
                        error_data = response.json()
                        error_code = error_data.get("error", {}).get("code", "")
                        if error_code == "1113":
                            logger.warning("GLM API: Insufficient balance. Please recharge at https://z.ai")
                        else:
                            logger.warning(f"GLM API health check failed: {response.status_code}")
                    except:
                        logger.warning(f"GLM API health check failed: {response.status_code}")
                else:
                    logger.warning(f"GLM API health check failed: {response.status_code}")

            return is_healthy

        except Exception as e:
            logger.error(f"GLM health check failed: {str(e)}")
            return False

    def get_langchain_model(self) -> BaseChatModel:
        """
        Get LangChain-compatible GLM instance.

        Returns:
            LangChain ChatZhipuAI model (if available)
        """
        if self._langchain_model is None:
            try:
                from langchain_community.chat_models import ChatZhipuAI
                self._langchain_model = ChatZhipuAI(
                    model=self.model,
                    zhipuai_api_key=self.config.api_key,
                    temperature=self.config.temperature,
                    max_tokens=self.config.max_tokens
                )
            except ImportError:
                logger.warning("langchain_community not available, using custom wrapper")
                # Return a basic wrapper
                from langchain_core.language_models.chat_models import BaseChatModel
                from langchain_core.messages import AIMessage
                from langchain_core.outputs import ChatResult, ChatGeneration

                class GLMWrapper(BaseChatModel):
                    def __init__(self, provider):
                        self.provider = provider

                    def _generate(self, messages, **kwargs):
                        import asyncio
                        result = asyncio.run(self.provider.chat(messages, **kwargs))
                        return ChatGeneration(message=AIMessage(content=result["content"]))

                    @property
                    def _llm_type(self):
                        return "glm"

                self._langchain_model = GLMWrapper(self)

        return self._langchain_model

    def get_provider_name(self) -> str:
        """Get provider name."""
        return "glm"
