"""
Setup script for Auto-GIT CLI
Installs the 'auto-git' command in the conda environment
"""

from setuptools import setup, find_packages

setup(
    name="auto-git",
    version="1.0.0",
    description="Autonomous Research-to-GitHub Pipeline powered by LangGraph",
    author="Auto-GIT Team",
    packages=find_packages(),
    py_modules=["cli_entry", "auto_git_interactive", "auto_git_cli"],
    install_requires=[
        "typer>=0.9.0",
        "rich>=13.0.0",
        "pyyaml>=6.0",
        "python-dotenv>=1.0.0",
        "httpx>=0.24.0",
        "langchain>=0.1.0",
        "langchain-ollama>=0.1.0",
        "langgraph>=0.1.0",
        "PyGithub>=2.0.0",
        "gitpython>=3.1.0",
        "arxiv>=2.0.0",
        "duckduckgo-search>=4.0.0",
    ],
    entry_points={
        "console_scripts": [
            "auto-git=cli_entry:main",
        ],
    },
    python_requires=">=3.10",
)
