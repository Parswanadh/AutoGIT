"""
Tool Registry for Multi-Agent System.

Provides agents with access to external tools:
- arxiv_search: Search 2M+ research papers
- papers_with_code: Check existing implementations
- dataset_checker: Verify data availability
- github_search: Find related repositories

Research Background:
- Tool-augmented LLMs show +30-50% improvement on factuality (ToolFormer, 2023)
- External knowledge access reduces hallucinations and improves grounding
- Parallel tool execution maintains performance despite sequential model execution
"""

import asyncio
import re
from typing import Dict, Any, List, Optional
from dataclasses import dataclass
from abc import ABC, abstractmethod

try:
    import arxiv
    HAS_ARXIV = True
except ImportError:
    HAS_ARXIV = False

try:
    import aiohttp
    HAS_AIOHTTP = True
except ImportError:
    HAS_AIOHTTP = False

from src.utils.logger import get_logger

logger = get_logger("tool_registry")


# ============================================
# BASE TOOL
# ============================================

@dataclass
class ToolResult:
    """Result from tool execution."""
    tool_name: str
    success: bool
    data: Any
    error: Optional[str] = None
    execution_time: float = 0.0


class BaseTool(ABC):
    """Base class for all tools."""

    def __init__(self):
        self.name = self.__class__.__name__
        self.logger = get_logger(f"tool_{self.name.lower()}")

    @abstractmethod
    async def execute(self, **kwargs) -> ToolResult:
        """Execute the tool."""
        pass

    @abstractmethod
    def get_description(self) -> str:
        """Get tool description for agents."""
        pass

    def get_schema(self) -> Dict[str, Any]:
        """Get input schema for the tool."""
        return {}


# ============================================
# ARXIV SEARCH TOOL
# ============================================

class ArxivSearchTool(BaseTool):
    """
    Search arXiv for research papers.

    Provides access to 2M+ papers across CS, math, physics, and more.
    """

    def __init__(self, max_results: int = 10):
        super().__init__()
        self.max_results = max_results

        if not HAS_ARXIV:
            self.logger.warning("arxiv package not installed, tool will be limited")

    async def execute(
        self,
        query: str,
        categories: Optional[List[str]] = None,
        max_results: Optional[int] = None
    ) -> ToolResult:
        """
        Search arXiv for papers matching query.

        Args:
            query: Search query
            categories: arXiv categories (e.g., ["cs.AI", "cs.LG"])
            max_results: Maximum results to return

        Returns:
            ToolResult with list of papers
        """
        import time
        start_time = time.time()

        if not HAS_ARXIV:
            return ToolResult(
                tool_name=self.name,
                success=False,
                data=[],
                error="arxiv package not installed"
            )

        try:
            # Build search query
            if categories:
                cat_query = " OR ".join([f"cat:{cat}" for cat in categories])
                full_query = f"({query}) AND ({cat_query})"
            else:
                full_query = query

            # Execute search
            search = arxiv.Search(
                query=full_query,
                max_results=max_results or self.max_results
            )

            papers = []
            async for result in self._async_results(search):
                papers.append({
                    "arxiv_id": result.entry_id.split("/")[-1],
                    "title": result.title,
                    "authors": [a.name for a in result.authors],
                    "summary": result.summary.replace("\n", " "),
                    "published": result.published.strftime("%Y-%m-%d"),
                    "categories": result.categories,
                    "url": result.entry_id
                })

            execution_time = time.time() - start_time

            self.logger.info(f"Found {len(papers)} papers for query: {query[:50]}")

            return ToolResult(
                tool_name=self.name,
                success=True,
                data=papers,
                execution_time=execution_time
            )

        except Exception as e:
            execution_time = time.time() - start_time
            self.logger.error(f"arXiv search failed: {e}")
            return ToolResult(
                tool_name=self.name,
                success=False,
                data=[],
                error=str(e),
                execution_time=execution_time
            )

    async def _async_results(self, search):
        """Async generator for arXiv results."""
        loop = asyncio.get_event_loop()
        results = await loop.run_in_executor(None, list, search.results())
        for result in results:
            yield result

    def get_description(self) -> str:
        return """Search arXiv research papers (2M+ papers).
Use this to find related work, check for novelty, and understand state-of-the-art.
Args: query (str), categories (list of str like ["cs.AI", "cs.LG"]), max_results (int)"""

    def get_schema(self) -> Dict[str, Any]:
        return {
            "type": "object",
            "properties": {
                "query": {"type": "string", "description": "Search query"},
                "categories": {"type": "array", "items": {"type": "string"}, "description": "arXiv categories like cs.AI, cs.LG"},
                "max_results": {"type": "integer", "description": "Maximum results"}
            },
            "required": ["query"]
        }


# ============================================
# PAPERS WITH CODE TOOL
# ============================================

class PapersWithCodeTool(BaseTool):
    """
    Search PapersWithCode for implementations.

    PapersWithCode links papers to GitHub repositories with implementations.
    """

    BASE_URL = "https://paperswithcode.com/api/v1"

    async def execute(
        self,
        query: str,
        max_results: int = 5
    ) -> ToolResult:
        """
        Search PapersWithCode for implementations.

        Args:
            query: Search query
            max_results: Maximum results

        Returns:
            ToolResult with papers and their GitHub repos
        """
        import time
        start_time = time.time()

        if not HAS_AIOHTTP:
            return ToolResult(
                tool_name=self.name,
                success=False,
                data=[],
                error="aiohttp package not installed"
            )

        try:
            async with aiohttp.ClientSession() as session:
                # Search papers
                url = f"{self.BASE_URL}/papers/search"
                params = {"q": query, "items_per_page": max_results}

                async with session.get(url, params=params, timeout=aiohttp.ClientTimeout(total=10)) as response:
                    if response.status != 200:
                        return ToolResult(
                            tool_name=self.name,
                            success=False,
                            data=[],
                            error=f"HTTP {response.status}"
                        )

                    data = await response.json()
                    results = data.get("results", [])

                    papers = []
                    for item in results:
                        paper = {
                            "id": item.get("id"),
                            "title": item.get("title"),
                            "summary": item.get("abstract", "")[:500],
                            "url": f"https://paperswithcode.com/paper/{item.get('id')}",
                            "repositories": []
                        }

                        # Get repositories for this paper
                        repo_url = f"{self.BASE_URL}/papers/{item.get('id')}/repositories"
                        async with session.get(repo_url, timeout=aiohttp.ClientTimeout(total=5)) as repo_response:
                            if repo_response.status == 200:
                                repo_data = await repo_response.json()
                                for repo in repo_data.get("results", [])[:3]:  # Top 3 repos
                                    paper["repositories"].append({
                                        "name": repo.get("repo", {}).get("name", ""),
                                        "url": repo.get("repo", {}).get("url", ""),
                                        "stars": repo.get("repo", {}).get("stars", 0),
                                        "framework": repo.get("framework", "")
                                    })

                        papers.append(paper)

            execution_time = time.time() - start_time
            self.logger.info(f"Found {len(papers)} papers on PapersWithCode")

            return ToolResult(
                tool_name=self.name,
                success=True,
                data=papers,
                execution_time=execution_time
            )

        except Exception as e:
            execution_time = time.time() - start_time
            self.logger.error(f"PapersWithCode search failed: {e}")
            return ToolResult(
                tool_name=self.name,
                success=False,
                data=[],
                error=str(e),
                execution_time=execution_time
            )

    def get_description(self) -> str:
        return """Search PapersWithCode for paper implementations.
Use this to find existing implementations and GitHub repositories.
Args: query (str), max_results (int)"""

    def get_schema(self) -> Dict[str, Any]:
        return {
            "type": "object",
            "properties": {
                "query": {"type": "string", "description": "Search query"},
                "max_results": {"type": "integer"}
            },
            "required": ["query"]
        }


# ============================================
# DATASET CHECKER TOOL
# ============================================

class DatasetCheckerTool(BaseTool):
    """
    Check dataset availability.

    Helps verify if required datasets exist and are accessible.
    """

    DATASET_HUBS = {
        "huggingface": "https://huggingface.co/api/datasets",
        "kaggle": "https://www.kaggle.com/api/v1/datasets"
    }

    async def execute(
        self,
        dataset_name: str,
        hub: str = "huggingface"
    ) -> ToolResult:
        """
        Check if dataset exists and is accessible.

        Args:
            dataset_name: Name of the dataset
            hub: Which hub to check (huggingface, kaggle)

        Returns:
            ToolResult with dataset info
        """
        import time
        start_time = time.time()

        if not HAS_AIOHTTP:
            return ToolResult(
                tool_name=self.name,
                success=False,
                data=None,
                error="aiohttp package not installed"
            )

        try:
            if hub == "huggingface":
                result = await self._check_huggingface(dataset_name)
            else:
                result = await self._check_generic(dataset_name)

            result.execution_time = time.time() - start_time
            return result

        except Exception as e:
            execution_time = time.time() - start_time
            self.logger.error(f"Dataset check failed: {e}")
            return ToolResult(
                tool_name=self.name,
                success=False,
                data=None,
                error=str(e),
                execution_time=execution_time
            )

    async def _check_huggingface(self, dataset_name: str) -> ToolResult:
        """Check HuggingFace dataset hub."""
        async with aiohttp.ClientSession() as session:
            url = f"{self.DATASET_HUBS['huggingface']}/{dataset_name}"
            async with session.get(url, timeout=aiohttp.ClientTimeout(total=10)) as response:
                if response.status == 200:
                    data = await response.json()
                    return ToolResult(
                        tool_name=self.name,
                        success=True,
                        data={
                            "exists": True,
                            "name": dataset_name,
                            "hub": "huggingface",
                            "url": f"https://huggingface.co/datasets/{dataset_name}",
                            "info": {
                                "author": data.get("author"),
                                "downloads": data.get("downloads", 0),
                                "likes": data.get("likes", 0),
                                "tags": data.get("tags", [])[:5]
                            }
                        }
                    )
                else:
                    return ToolResult(
                        tool_name=self.name,
                        success=True,
                        data={
                            "exists": False,
                            "name": dataset_name,
                            "hub": "huggingface"
                        }
                    )

    async def _check_generic(self, dataset_name: str) -> ToolResult:
        """Generic dataset check (returns suggestions)."""
        # Provide suggestions for common datasets
        suggestions = []
        name_lower = dataset_name.lower()

        if "image" in name_lower or "vision" in name_lower:
            suggestions.extend(["ImageNet", "COCO", "CIFAR-10/100"])
        if "text" in name_lower or "language" in name_lower:
            suggestions.extend(["Common Crawl", "The Pile", "WikiText"])
        if "audio" in name_lower:
            suggestions.extend(["LibriSpeech", "VoxCeleb"])
        if "3d" in name_lower or "point" in name_lower:
            suggestions.extend(["ModelNet", "ShapeNet"])

        return ToolResult(
            tool_name=self.name,
            success=True,
            data={
                "exists": "unknown",
                "name": dataset_name,
                "suggestions": suggestions
            }
        )

    def get_description(self) -> str:
        return """Check dataset availability on HuggingFace or Kaggle.
Use this to verify if required datasets exist.
Args: dataset_name (str), hub (str): 'huggingface' or 'kaggle'"""

    def get_schema(self) -> Dict[str, Any]:
        return {
            "type": "object",
            "properties": {
                "dataset_name": {"type": "string", "description": "Dataset name"},
                "hub": {"type": "string", "enum": ["huggingface", "kaggle"], "description": "Which hub to check"}
            },
            "required": ["dataset_name"]
        }


# ============================================
# GITHUB SEARCH TOOL
# ============================================

class GitHubSearchTool(BaseTool):
    """
    Search GitHub for related repositories.

    Helps find existing implementations, similar projects, and code references.
    """

    async def execute(
        self,
        query: str,
        language: Optional[str] = None,
        max_results: int = 5
    ) -> ToolResult:
        """
        Search GitHub for repositories.

        Args:
            query: Search query
            language: Programming language filter
            max_results: Maximum results

        Returns:
            ToolResult with repository list
        """
        import time
        start_time = time.time()

        if not HAS_AIOHTTP:
            return ToolResult(
                tool_name=self.name,
                success=False,
                data=[],
                error="aiohttp package not installed"
            )

        try:
            # Note: GitHub API requires authentication for higher rate limits
            # This is a basic search without auth (limited results)
            async with aiohttp.ClientSession() as session:
                url = "https://api.github.com/search/repositories"
                params = {
                    "q": f"{query} language:{language}" if language else query,
                    "sort": "stars",
                    "order": "desc",
                    "per_page": max_results
                }

                async with session.get(url, params=params, timeout=aiohttp.ClientTimeout(total=10)) as response:
                    if response.status != 200:
                        return ToolResult(
                            tool_name=self.name,
                            success=False,
                            data=[],
                            error=f"GitHub API error: {response.status}"
                        )

                    data = await response.json()
                    items = data.get("items", [])

                    repos = []
                    for item in items:
                        repos.append({
                            "name": item.get("name"),
                            "full_name": item.get("full_name"),
                            "url": item.get("html_url"),
                            "description": item.get("description", ""),
                            "stars": item.get("stargazers_count", 0),
                            "language": item.get("language"),
                            "updated_at": item.get("updated_at")
                        })

            execution_time = time.time() - start_time
            self.logger.info(f"Found {len(repos)} GitHub repos")

            return ToolResult(
                tool_name=self.name,
                success=True,
                data=repos,
                execution_time=execution_time
            )

        except Exception as e:
            execution_time = time.time() - start_time
            self.logger.error(f"GitHub search failed: {e}")
            return ToolResult(
                tool_name=self.name,
                success=False,
                data=[],
                error=str(e),
                execution_time=execution_time
            )

    def get_description(self) -> str:
        return """Search GitHub for repositories.
Use this to find existing implementations and similar projects.
Args: query (str), language (str e.g., 'python'), max_results (int)"""

    def get_schema(self) -> Dict[str, Any]:
        return {
            "type": "object",
            "properties": {
                "query": {"type": "string", "description": "Search query"},
                "language": {"type": "string", "description": "Programming language"},
                "max_results": {"type": "integer"}
            },
            "required": ["query"]
        }


# ============================================
# TOOL REGISTRY
# ============================================

class ToolRegistry:
    """
    Registry of all available tools.

    Enables parallel tool execution (even though model execution is sequential).
    Tools are fast HTTP/API calls, so they can run in parallel.
    """

    def __init__(self):
        self.tools: Dict[str, BaseTool] = {}
        self.logger = get_logger("tool_registry")
        self._register_default_tools()

    def _register_default_tools(self):
        """Register default tools."""
        self.register("arxiv_search", ArxivSearchTool())
        self.register("papers_with_code", PapersWithCodeTool())
        self.register("dataset_checker", DatasetCheckerTool())
        self.register("github_search", GitHubSearchTool())

    def register(self, name: str, tool: BaseTool):
        """Register a new tool."""
        self.tools[name] = tool
        self.logger.info(f"Registered tool: {name}")

    async def call_tool(self, tool_name: str, **kwargs) -> ToolResult:
        """
        Execute a single tool.

        Args:
            tool_name: Name of the tool to execute
            **kwargs: Tool-specific arguments

        Returns:
            ToolResult
        """
        if tool_name not in self.tools:
            return ToolResult(
                tool_name=tool_name,
                success=False,
                data=None,
                error=f"Unknown tool: {tool_name}"
            )

        tool = self.tools[tool_name]
        self.logger.debug(f"Calling tool: {tool_name} with args: {list(kwargs.keys())}")

        return await tool.execute(**kwargs)

    async def call_tools_parallel(
        self,
        tool_calls: Dict[str, Dict[str, Any]]
    ) -> Dict[str, ToolResult]:
        """
        Execute multiple tools in parallel.

        Tools are fast HTTP/API calls, so parallel execution is efficient.
        This maintains performance even though model execution is sequential.

        Args:
            tool_calls: Dict of {tool_name: kwargs}

        Returns:
            Dict of {tool_name: ToolResult}
        """
        self.logger.info(f"Calling {len(tool_calls)} tools in parallel")

        # Create tasks for parallel execution
        tasks = []
        for tool_name, kwargs in tool_calls.items():
            tasks.append(self.call_tool(tool_name, **kwargs))

        # Execute in parallel
        results = await asyncio.gather(*tasks)

        # Map results back to tool names
        tool_names = list(tool_calls.keys())
        return {name: result for name, result in zip(tool_names, results)}

    def list_tools(self) -> List[str]:
        """Get list of available tool names."""
        return list(self.tools.keys())

    def get_tool_descriptions(self) -> Dict[str, str]:
        """Get descriptions of all tools (for agents)."""
        return {name: tool.get_description() for name, tool in self.tools.items()}

    def get_tool_schemas(self) -> Dict[str, Dict[str, Any]]:
        """Get schemas of all tools (for agents)."""
        return {name: tool.get_schema() for name, tool in self.tools.items()}


# ============================================
# SINGLETON
# ============================================

_tool_registry_instance: Optional[ToolRegistry] = None


def get_tool_registry() -> ToolRegistry:
    """Get global tool registry instance (singleton)."""
    global _tool_registry_instance
    if _tool_registry_instance is None:
        _tool_registry_instance = ToolRegistry()
    return _tool_registry_instance
