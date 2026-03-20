#!/usr/bin/env python
"""
Entry point for auto-git command.
Routes to the unified CLI (src/cli/app.py).
"""

import sys
from pathlib import Path

# Add project root to path
project_root = Path(__file__).parent
sys.path.insert(0, str(project_root))

from src.cli.app import main

if __name__ == "__main__":
    main()
