# 🚀 AUTO-GIT PUBLISHER

[![Python 3.8+](https://img.shields.io/badge/python-3.8+-blue.svg)](https://www.python.org/downloads/)
[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](https://opensource.org/licenses/MIT)
[![Status: In Development](https://img.shields.io/badge/status-in%20development-orange.svg)]()

> **Autonomous Research-to-GitHub Pipeline**: Automatically discover arXiv papers, generate PyTorch implementations, and publish to GitHub.

## 🎯 Overview

AUTO-GIT Publisher is a fully autonomous system that:
1. 🔍 Monitors arXiv for cutting-edge AI/ML research papers
2. 🧠 Evaluates novelty and implementation feasibility
3. ⚡ Generates production-ready PyTorch implementations using Groq (500 tok/sec)
4. ✅ Validates code quality with multi-stage testing
5. 📦 Publishes working repositories to GitHub with full documentation

## 🏗️ Architecture

```
4-TIER PIPELINE (12 Agents)

TIER 1: DISCOVERY
├─ Paper Scout: arXiv monitoring
├─ Novelty Classifier: SBERT + GPT scoring  
└─ Priority Router: Complexity estimation

TIER 2: ANALYSIS
├─ PDF Extractor: Content extraction
├─ Architecture Parser: Design understanding
└─ Dependency Analyzer: Requirements extraction

TIER 3: GENERATION
├─ Code Generator: GPT-OSS 120B implementation
├─ Validator: Syntax, type, lint, test checks
└─ Optimizer: Performance improvements

TIER 4: PUBLISHING
├─ Repo Scaffolder: GitHub structure
├─ Doc Generator: README, docs, notebooks
└─ Publisher: Automated GitHub release
```

## 🚦 Current Status

**Phase 0: Setup** ✅ COMPLETE

- [x] Project structure
- [x] Configuration files
- [x] Environment setup
- [x] Documentation

**Phase 1: Discovery** 🔄 NEXT (Days 2-3)

See [`plan.md`](plan.md) for full implementation roadmap.

## 📋 Prerequisites

- Python 3.8+
- Groq API key ([Get it here](https://console.groq.com/keys))
- GitHub Personal Access Token ([Create here](https://github.com/settings/tokens))
- Ollama (optional, for local fallback models)

## 🚀 Quick Start

### 1. Clone & Install

```bash
git clone <your-repo-url>
cd auto-git
pip install -r requirements.txt
```

### 2. Configure Environment

```bash
# Copy environment template
cp .env.example .env

# Edit .env and add your keys
notepad .env  # Windows
# or
nano .env     # Linux/Mac
```

Required keys:
```bash
GROQ_API_KEY=your_groq_api_key_here
GITHUB_TOKEN=your_github_token_here
GITHUB_USERNAME=your_github_username
```

### 3. Initialize

```bash
# Initialize databases and directories
python run.py init

# Test configuration
python run.py test
```

### 4. Run (Dry Run)

```bash
# Process papers without publishing
python run.py run --dry-run --papers 5
```

## 📁 Project Structure

```
auto-git/
├── src/
│   ├── agents/
│   │   ├── tier1_discovery/      # Paper Scout, Novelty, Priority
│   │   ├── tier2_analysis/       # PDF Extract, Architecture, Dependencies
│   │   ├── tier3_generation/     # Code Gen, Validator, Optimizer
│   │   └── tier4_publishing/     # Scaffolder, Docs, Publisher
│   ├── pipeline/                 # Orchestration
│   ├── models/                   # Data schemas
│   └── utils/                    # Helpers, config, logging
├── tests/                        # Unit & integration tests
├── prompts/                      # Prompt templates
├── logs/                         # Pipeline logs
├── data/                         # Databases, cache
├── config.yaml                   # Main configuration
├── .env                          # API keys (DO NOT COMMIT)
├── plan.md                       # Implementation roadmap
└── run.py                        # CLI entry point
```

## 🛠️ Configuration

Edit [`config.yaml`](config.yaml) to customize:

- **arXiv Queries**: Topics to monitor
- **Thresholds**: Novelty (7.0) and Priority (0.5) cutoffs
- **Models**: Groq cloud vs local Ollama fallback
- **Validation**: Quality standards
- **Publishing**: GitHub repo settings

## 📊 Usage

### Run Full Pipeline

```bash
# Process 5 papers (dry run)
python run.py run --papers 5 --dry-run

# Live run (creates real GitHub repos)
python run.py run --papers 3
```

### Process Single Paper

```bash
# By arXiv ID
python run.py process 1706.03762
```

### Test Specific Tier

```bash
# Test only discovery (Tier 1)
python run.py run --tier 1 --dry-run

# Test only generation (Tier 3)
python run.py run --tier 3 --dry-run
```

### Check Status

```bash
python run.py status
```

## 🧪 Testing

```bash
# Run all tests
pytest tests/ -v

# Test with coverage
pytest tests/ --cov=src --cov-report=html

# Test specific tier
pytest tests/agents/tier1_discovery/ -v
```

## 🤖 Available Models

### Groq Cloud (Primary)
- `openai/gpt-oss-120b` - Code generation (500 tok/sec, 30 req/min)
- `openai/gpt-oss-20b` - Analysis tasks (30 req/min)

### Local Ollama (Fallback)
- `deepseek-coder-v2:16b` - Code generation
- `deepcoder:14b` - Analysis tasks
- `all-minilm:latest` - Embeddings (SBERT)

## 💰 Cost Estimates

- **Average per paper**: $1-2 (with Groq)
- **Daily limit**: $10 (configurable)
- **Local fallback**: $0 (uses Ollama)

## ⚠️ Important Notes

### Security
- **Never commit `.env`** - it contains sensitive API keys
- Use repo-scoped GitHub tokens (not full access)
- Enable dry-run mode for testing

### Rate Limits
- Groq: 30 requests/min for both models
- Automatic fallback to local Ollama on limit
- Exponential backoff for retries

### Quality Controls
- All code passes syntax, type, and lint checks
- Minimum 50% test coverage
- Human review for complexity > 8/10

## 🗺️ Roadmap

See [`plan.md`](plan.md) for the complete 21-day implementation plan:

- **Week 1**: Foundation (Tiers 1-2, start Tier 3)
- **Week 2**: Core generation & publishing (Tiers 3-4)
- **Week 3**: Production hardening & launch

## 🤝 Contributing

This project is currently in active development. Contributions welcome after Phase 5 completion.

## 📄 License

MIT License - see [LICENSE](LICENSE) for details.

## 🙏 Acknowledgments

- [arXiv](https://arxiv.org/) for open research access
- [Groq](https://groq.com/) for ultra-fast inference
- [Sentence Transformers](https://www.sbert.net/) for embeddings
- [PyTorch](https://pytorch.org/) as target framework

## 📞 Support

- 📖 [Documentation](plan.md)
- 🐛 [Issue Tracker](https://github.com/yourusername/auto-git/issues)
- 💬 [Discussions](https://github.com/yourusername/auto-git/discussions)

---

**Status**: Phase 0 Complete | **Next**: Phase 1 (Discovery Agents)  
**Last Updated**: December 26, 2025
