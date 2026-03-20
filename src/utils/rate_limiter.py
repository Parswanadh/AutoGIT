"""
Rate limiter implementation using token bucket algorithm.
"""

import time
import asyncio
from typing import Optional
from collections import deque


class RateLimiter:
    """
    Token bucket rate limiter for API calls.
    
    Example:
        async with RateLimiter(30) as limiter:
            await limiter.acquire()
            # Make API call
    """
    
    def __init__(
        self,
        rate: int,
        per: float = 60.0,
        burst: Optional[int] = None
    ):
        """
        Initialize rate limiter.
        
        Args:
            rate: Number of requests allowed
            per: Time window in seconds (default: 60s = 1 minute)
            burst: Max burst size (default: same as rate)
        """
        self.rate = rate
        self.per = per
        self.burst = burst or rate
        self.tokens = self.burst
        self.last_update = time.time()
        self.requests = deque()
        self._lock = asyncio.Lock()
    
    async def acquire(self):
        """Wait until a token is available."""
        async with self._lock:
            now = time.time()
            
            # Refill tokens based on time passed
            time_passed = now - self.last_update
            self.tokens = min(
                self.burst,
                self.tokens + (time_passed * self.rate / self.per)
            )
            self.last_update = now
            
            # Wait if no tokens available
            if self.tokens < 1:
                sleep_time = (1 - self.tokens) * self.per / self.rate
                await asyncio.sleep(sleep_time)
                self.tokens = 0
            else:
                self.tokens -= 1
            
            # Track request time
            self.requests.append(now)
            
            # Clean old requests
            cutoff = now - self.per
            while self.requests and self.requests[0] < cutoff:
                self.requests.popleft()
    
    def get_stats(self) -> dict:
        """Get current rate limiter statistics."""
        now = time.time()
        cutoff = now - self.per
        recent_requests = sum(1 for t in self.requests if t > cutoff)
        
        return {
            "available_tokens": int(self.tokens),
            "recent_requests": recent_requests,
            "rate_limit": self.rate,
            "window_seconds": self.per,
        }
    
    async def __aenter__(self):
        """Context manager entry."""
        return self
    
    async def __aexit__(self, exc_type, exc_val, exc_tb):
        """Context manager exit."""
        pass
