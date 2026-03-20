"""
Cost Tracker Utility

Tracks LLM API usage and costs across all providers.
Provides daily limits, spending alerts, and usage analytics.
"""

import os
import json
import time
from datetime import datetime, date
from typing import Dict, Optional, List
from pathlib import Path


class CostTracker:
    """
    Tracks LLM API usage and costs.

    Stores usage data in ~/.llm_usage.json for persistence.
    Enforces daily spending limits and provides usage analytics.
    """

    def __init__(self, storage_path: Optional[Path] = None):
        """
        Initialize cost tracker.

        Args:
            storage_path: Path to store usage data (default: ~/.llm_usage.json)
        """
        if storage_path is None:
            home = Path.home()
            storage_path = home / ".llm_usage.json"

        self.storage_path = storage_path
        self.daily_limit = float(os.getenv("LLM_DAILY_COST_LIMIT", "10.0"))
        self.data = self._load_usage_data()

    def _load_usage_data(self) -> dict:
        """Load usage data from storage file."""
        if self.storage_path.exists():
            try:
                with open(self.storage_path, 'r') as f:
                    return json.load(f)
            except Exception:
                pass

        return {
            "daily_usage": {},
            "total_usage": {},
            "requests": []
        }

    def _save_usage_data(self):
        """Save usage data to storage file."""
        try:
            self.storage_path.parent.mkdir(parents=True, exist_ok=True)
            with open(self.storage_path, 'w') as f:
                json.dump(self.data, f, indent=2)
        except Exception as e:
            print(f"Warning: Could not save usage data: {e}")

    def _get_today_key(self) -> str:
        """Get today's date as a string key."""
        return date.today().isoformat()

    async def record_usage(
        self,
        provider: str,
        model: str,
        input_tokens: int,
        output_tokens: int,
        cost_usd: float
    ):
        """
        Record LLM API usage.

        Args:
            provider: Provider name (e.g., "glm", "claude")
            model: Model name (e.g., "glm-4-plus")
            input_tokens: Number of input tokens
            output_tokens: Number of output tokens
            cost_usd: Cost in USD

        Returns:
            True if within daily limit, False otherwise
        """
        today = self._get_today_key()
        now = datetime.now().isoformat()

        # Initialize today's usage if needed
        if today not in self.data["daily_usage"]:
            self.data["daily_usage"][today] = {
                "total_cost": 0.0,
                "total_tokens": 0,
                "by_provider": {},
                "by_model": {}
            }

        # Update today's usage
        daily = self.data["daily_usage"][today]
        daily["total_cost"] += cost_usd
        daily["total_tokens"] += input_tokens + output_tokens

        # Track by provider
        if provider not in daily["by_provider"]:
            daily["by_provider"][provider] = {"cost": 0.0, "tokens": 0}
        daily["by_provider"][provider]["cost"] += cost_usd
        daily["by_provider"][provider]["tokens"] += input_tokens + output_tokens

        # Track by model
        if model not in daily["by_model"]:
            daily["by_model"][model] = {"cost": 0.0, "tokens": 0}
        daily["by_model"][model]["cost"] += cost_usd
        daily["by_model"][model]["tokens"] += input_tokens + output_tokens

        # Record request
        self.data["requests"].append({
            "timestamp": now,
            "provider": provider,
            "model": model,
            "input_tokens": input_tokens,
            "output_tokens": output_tokens,
            "cost_usd": cost_usd
        })

        # Save data
        self._save_usage_data()

        # Check daily limit
        return daily["total_cost"] <= self.daily_limit

    async def get_daily_total(self) -> float:
        """Get total cost for today."""
        today = self._get_today_key()
        if today in self.data["daily_usage"]:
            return self.data["daily_usage"][today]["total_cost"]
        return 0.0

    async def is_within_limit(self) -> bool:
        """Check if today's usage is within daily limit."""
        return await self.get_daily_total() <= self.daily_limit

    async def get_daily_summary(self) -> dict:
        """Get summary of today's usage."""
        today = self._get_today_key()
        if today in self.data["daily_usage"]:
            return self.data["daily_usage"][today]
        return {
            "total_cost": 0.0,
            "total_tokens": 0,
            "by_provider": {},
            "by_model": {}
        }

    async def get_recent_requests(self, limit: int = 10) -> List[dict]:
        """Get recent API requests."""
        return self.data["requests"][-limit:]

    async def get_provider_summary(self, provider: str) -> dict:
        """Get usage summary for a specific provider."""
        today = self._get_today_key()
        if today in self.data["daily_usage"]:
            return self.data["daily_usage"][today].get("by_provider", {}).get(provider, {})
        return {}

    def check_alert_threshold(self) -> bool:
        """
        Check if usage has exceeded alert threshold.

        Returns True if usage is at 80% of daily limit.
        """
        today = self._get_today_key()
        if today in self.data["daily_usage"]:
            current = self.data["daily_usage"][today]["total_cost"]
            threshold = self.daily_limit * 0.8
            return current >= threshold
        return False
