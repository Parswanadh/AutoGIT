"""
Response Merger

Merges responses from multiple LLM providers running in parallel.
Implements various strategies for combining results.
"""

from typing import List, Dict, Any, Literal


class ResponseMerger:
    """
    Merge responses from multiple providers.

    Strategies:
    - prefer_cloud: Use cloud response if available
    - prefer_primary: Use primary provider's response
    - ensemble: Combine best parts of both responses
    - vote: Choose response with higher confidence/metrics
    - race: Use first response to complete
    """

    def __init__(
        self,
        strategy: Literal["prefer_cloud", "prefer_primary", "ensemble", "vote", "race", "fallback"] = "prefer_cloud"
    ):
        """
        Initialize response merger.

        Args:
            strategy: Merge strategy to use
        """
        self.strategy = strategy

    def merge_generate_results(self, results: List[Dict[str, Any]]) -> Dict[str, Any]:
        """
        Merge generation results from multiple providers.

        Args:
            results: List of result dicts from providers

        Returns:
            Merged result dict
        """
        if not results:
            raise ValueError("No results to merge")

        if len(results) == 1:
            return results[0]

        if self.strategy == "fallback":
            return self._prefer_primary(results)
        elif self.strategy in ["parallel", "prefer_cloud"]:
            return self._prefer_cloud(results)
        elif self.strategy == "prefer_primary":
            return results[0]  # Primary is always first
        elif self.strategy == "ensemble":
            return self._ensemble(results)
        elif self.strategy == "vote":
            return self._vote(results)
        elif self.strategy == "race":
            return results[0]  # First to complete
        else:
            return results[0]

    def _prefer_cloud(self, results: List[Dict[str, Any]]) -> Dict[str, Any]:
        """Prefer cloud provider response."""
        # Find cloud provider result
        for result in results:
            if result["provider"] in ["glm", "claude", "openai"]:
                merged = result.copy()
                merged["fallback_available"] = any(r["provider"] == "ollama" for r in results)
                return merged

        # Fallback to local if no cloud
        return results[0]

    def _prefer_primary(self, results: List[Dict[str, Any]]) -> Dict[str, Any]:
        """Use primary provider's response."""
        return results[0]

    def _ensemble(self, results: List[Dict[str, Any]]) -> Dict[str, Any]:
        """
        Combine best parts of both responses.

        Uses cloud for reasoning, local for code if applicable.
        """
        cloud_result = next((r for r in results if r["provider"] in ["glm", "claude", "openai"]), None)
        local_result = next((r for r in results if r["provider"] == "ollama"), None)

        if not cloud_result or not local_result:
            return results[0]

        # Simple ensemble: prefer cloud for most content
        # If cloud has code blocks, use cloud
        content_cloud = cloud_result["content"]
        content_local = local_result["content"]

        # If cloud has well-structured content, use it
        if "```" in content_cloud or len(content_cloud) > len(content_local) * 0.8:
            merged_content = content_cloud
            source_provider = cloud_result["provider"]
        else:
            # Use cloud reasoning
            merged_content = content_cloud
            source_provider = cloud_result["provider"]

        # Merge metadata
        return {
            "content": merged_content,
            "model": f"ensemble({cloud_result['model']}+{local_result['model']})",
            "tokens_used": cloud_result["tokens_used"] + local_result["tokens_used"],
            "finish_reason": cloud_result["finish_reason"],
            "cost_usd": cloud_result["cost_usd"],  # Only count cloud cost
            "provider": "ensemble",
            "providers_used": [r["provider"] for r in results],
            "latency_seconds": max(r["latency_seconds"] for r in results),
            "ensemble_method": "cloud_preferred",
            "source_provider": source_provider
        }

    def _vote(self, results: List[Dict[str, Any]]) -> Dict[str, Any]:
        """
        Vote based on quality metrics.

        Prefer cloud, faster, lower cost.
        """
        scored = []
        for result in results:
            score = 0

            # Prefer cloud
            if result["provider"] in ["glm", "claude", "openai"]:
                score += 10

            # Prefer faster (but not too fast - might indicate low quality)
            latency = result.get("latency_seconds", 0)
            if 1 < latency < 10:
                score += 5

            # Prefer lower cost
            if result["cost_usd"] < 0.01:
                score += 3

            # Prefer longer responses (usually higher quality)
            content_len = len(result.get("content", ""))
            if content_len > 500:
                score += 2

            scored.append((score, result))

        # Return highest scored
        scored.sort(key=lambda x: x[0], reverse=True)
        best = scored[0][1]
        best["vote_score"] = scored[0][0]
        return best
