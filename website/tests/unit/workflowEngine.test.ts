import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import React from 'react';

import { ArxivParser } from '../../lib/research/arxivParser';
import {
  PERSONAS,
  PERSONA_LIST,
  formatPerspectivesPrompt,
  formatProblemExtractionPrompt,
  formatSolutionGenerationPrompt,
  formatCritiquePrompt,
  formatSolutionSelectionPrompt,
  formatArchitectSpecPrompt,
  formatCodeGenerationPrompt,
  formatCodeReviewPrompt,
  formatStrategyReasonerPrompt,
  formatSelfHealingFixPrompt,
  formatScaffoldingPrompt,
} from '../../lib/workflow/prompts';
import { PythonAstValidator } from '../../lib/workflow/astValidator';
import {
  WorkflowEngine,
  WorkflowState,
  WorkflowStage,
  DebateTurn,
} from '../../lib/workflow/engine';
import { IOpenRouterClient, ChatMessage, StreamCallbacks } from '../../lib/openrouter/client';

import InputConfigPanel, { PRESET_TOPICS } from '../../components/studio/InputConfigPanel';
import PipelineVisualizer, { WORKFLOW_STAGES } from '../../components/studio/PipelineVisualizer';
import DebateStreamViewer from '../../components/studio/DebateStreamViewer';
import TerminalLogViewer from '../../components/studio/TerminalLogViewer';

// Mock MockOpenRouterClient for WorkflowEngine tests
class MockWorkflowClient implements IOpenRouterClient {
  public chatResponses: Record<string, string> = {};
  public streamDelayMs: number = 0;
  public calls: Array<{ messages: ChatMessage[]; model?: string }> = [];

  constructor(public defaultResponse: string = '{"status": "ok"}') {}

  async getAvailableFreeModels() {
    return [
      { id: 'google/gemini-2.0-flash-exp:free', name: 'Gemini Flash', contextLength: 100000, isFree: true },
      { id: 'meta-llama/llama-3.3-70b-instruct:free', name: 'Llama 70B', contextLength: 100000, isFree: true },
      { id: 'qwen/qwen-2.5-coder-32b-instruct:free', name: 'Qwen Coder 32B', contextLength: 32000, isFree: true },
      { id: 'deepseek/deepseek-r1:free', name: 'DeepSeek R1', contextLength: 64000, isFree: true },
    ];
  }

  async chatStream(messages: ChatMessage[], preferredModel?: string, callbacks?: StreamCallbacks): Promise<string> {
    this.calls.push({ messages, model: preferredModel });
    const userPrompt = messages[messages.length - 1]?.content || '';

    let text = this.defaultResponse;

    if (userPrompt.includes('perspectives and critical technical questions')) {
      text = JSON.stringify({
        perspectives: [
          { persona: 'Lead Researcher', core_question: 'What is the theoretical fidelity?', key_priorities: ['math'] },
          { persona: 'System Architect', core_question: 'What is the component graph?', key_priorities: ['modularity'] },
        ],
        domain_challenges: ['High memory latency in baseline', 'Lack of standalone Python demo'],
      });
    } else if (userPrompt.includes('Senior Research Director. Deconstruct this research idea')) {
      text = JSON.stringify({
        domain: 'Machine Learning / NLP',
        challenge: 'Efficient Selective State Space Modeling',
        current_solutions: 'Standard self-attention with O(N^2) memory',
        limitations: ['Quadratic memory complexity', 'Slow autoregressive decoding'],
        requirements: ['Modular Python architecture', 'Runnable standalone main.py demo', 'Zero external dependencies'],
        success_metrics: ['O(N) memory scaling', 'Exact output tensor alignment', '100% unit test pass'],
      });
    } else if (userPrompt.includes('Generate 3 DISTINCT, NOVEL technical solutions')) {
      text = JSON.stringify([
        {
          approach_name: 'Selective State-Space Architecture',
          key_innovation: 'Fast recurrent scanning with hardware-aware memory caching',
          architecture_design: 'Layered model, scan kernel, execution pipeline, and test runner',
          implementation_plan: ['Define MambaLayer', 'Implement scan logic', 'Write evaluation pipeline', 'Add unit tests'],
          expected_advantages: ['O(N) linear time complexity', 'Zero external runtime dependencies'],
          potential_challenges: ['Numerical precision in recursive step'],
          expected_performance: '5x faster inference vs standard transformer',
        },
      ]);
    } else if (userPrompt.includes('Current Debate Round:')) {
      text = JSON.stringify({
        agent: 'Lead Researcher',
        verdict: 'accept',
        feasibility_score: 9.0,
        agreement_with_proposal: 'high',
        strengths: ['Strong theoretical scaling', 'Paper-aligned formulation'],
        concerns: ['Ensure numerical stability with small epsilon'],
        concrete_improvements: ['Add docstrings with tensor shapes'],
        debate_statement: 'I fully support this selective state-space architecture. The linear complexity addresses the core baseline bottleneck.',
      });
    } else if (userPrompt.includes('Supervisor of the Multi-Agent Research Panel')) {
      text = JSON.stringify({
        selected_approach_name: 'Selective State-Space Architecture',
        selection_rationale: 'Consensus achieved with 9.0+ feasibility score across all personas.',
        consensus_score: 0.94,
        synthesized_architecture: 'Modular Python package with model.py, pipeline.py, test_pipeline.py, and main.py',
        final_module_list: ['main.py', 'model.py', 'pipeline.py', 'test_pipeline.py', 'requirements.txt'],
      });
    } else if (userPrompt.includes('Principal Software Architect. Create a DETAILED')) {
      text = JSON.stringify({
        project_name: 'mamba-state-space',
        one_line_description: 'Selective state-space model architecture with fast scan in PyTorch',
        files: [
          { name: 'main.py', purpose: 'Standalone execution demo with synthetic data' },
          { name: 'model.py', purpose: 'Selective state-space neural module' },
          { name: 'pipeline.py', purpose: 'Data processing and inference pipeline' },
          { name: 'test_pipeline.py', purpose: 'Unit test suite' },
        ],
        requirements: ['torch>=2.0.0', 'numpy>=1.24.0', 'pytest>=7.0.0'],
      });
    } else if (userPrompt.includes("generating the complete, production-ready file 'main.py'")) {
      text = `import sys
from model import StateSpaceModel
from pipeline import InferencePipeline

def run_demo():
    print("Initializing Selective State-Space Pipeline...")
    model = StateSpaceModel(d_model=64, d_state=16)
    pipeline = InferencePipeline(model)
    result = pipeline.run_step([1.0, 2.0, 3.0, 4.0])
    print(f"Pipeline execution result: {result}")
    return result

if __name__ == '__main__':
    run_demo()
`;
    } else if (userPrompt.includes("generating the complete, production-ready file 'model.py'")) {
      text = `import math
from typing import List

class StateSpaceModel:
    def __init__(self, d_model: int = 64, d_state: int = 16):
        self.d_model = d_model
        self.d_state = d_state
        self.weights = [0.1 * i for i in range(d_model)]

    def forward(self, x: List[float]) -> List[float]:
        """Compute selective state-space transformation."""
        return [val * 0.5 + 0.1 for val in x]
`;
    } else if (userPrompt.includes("generating the complete, production-ready file 'pipeline.py'")) {
      text = `from typing import List, Dict, Any
from model import StateSpaceModel

class InferencePipeline:
    def __init__(self, model: StateSpaceModel):
        self.model = model

    def run_step(self, data: List[float]) -> Dict[str, Any]:
        output = self.model.forward(data)
        return {"input_len": len(data), "output": output, "status": "success"}
`;
    } else if (userPrompt.includes("generating the complete, production-ready file 'test_pipeline.py'")) {
      text = `import unittest
from model import StateSpaceModel
from pipeline import InferencePipeline

class TestStateSpacePipeline(unittest.TestCase):
    def test_model_forward(self):
        model = StateSpaceModel(d_model=16, d_state=8)
        out = model.forward([1.0, 2.0, 3.0])
        self.assertEqual(len(out), 3)

    def test_pipeline_step(self):
        model = StateSpaceModel(d_model=16, d_state=8)
        pipe = InferencePipeline(model)
        res = pipe.run_step([1.0, 2.0])
        self.assertEqual(res["status"], "success")

if __name__ == '__main__':
    unittest.main()
`;
    } else if (userPrompt.includes('Generate production-grade repository documentation')) {
      text = JSON.stringify({
        readme_content: '# Mamba State Space\n\nSelective state-space architecture.\n\n## Quickstart\n```bash\npython main.py\n```\n',
        requirements_content: 'torch>=2.0.0\nnumpy>=1.24.0\npytest>=7.0.0\n',
        license_content: 'MIT License\n\nCopyright (c) 2026 AutoGIT Researcher\n',
      });
    }

    if (callbacks?.onReasoning) {
      callbacks.onReasoning('Analyzing research requirements and constraints...');
    }
    if (callbacks?.onToken) {
      callbacks.onToken(text);
    }
    if (callbacks?.onComplete) {
      callbacks.onComplete(text, 'Analyzed successfully');
    }

    return text;
  }

  async chat(messages: ChatMessage[], preferredModel?: string): Promise<string> {
    return this.chatStream(messages, preferredModel);
  }
}

describe('Milestone 3 Unit Tests: Research, Prompts, AST Validator, Engine & UI', () => {
  // ==========================================================================
  // 1. arXiv Ingestion & Parser
  // ==========================================================================
  describe('1. ArxivParser', () => {
    it('1.1: extracts arXiv ID from various formats', () => {
      expect(ArxivParser.extractArxivId('2310.06825')).toBe('2310.06825');
      expect(ArxivParser.extractArxivId('2310.06825v2')).toBe('2310.06825v2');
      expect(ArxivParser.extractArxivId('arXiv:2310.06825')).toBe('2310.06825');
      expect(ArxivParser.extractArxivId('https://arxiv.org/abs/2310.06825')).toBe('2310.06825');
      expect(ArxivParser.extractArxivId('https://arxiv.org/pdf/2310.06825.pdf')).toBe('2310.06825');
      expect(ArxivParser.extractArxivId('hep-th/9910001')).toBe('hep-th/9910001');
      expect(ArxivParser.extractArxivId('Random Prompt Without ID')).toBeNull();
      expect(ArxivParser.extractArxivId('')).toBeNull();
    });

    it('1.2: parses Atom XML into structured ArxivPaperMetadata', () => {
      const xml = `<?xml version="1.0" encoding="UTF-8"?>
<feed xmlns="http://www.w3.org/2005/Atom">
  <entry>
    <id>http://arxiv.org/abs/2310.06825v1</id>
    <title>Mistral 7B</title>
    <summary>We present Mistral 7B, an open language model.</summary>
    <author><name>Albert Q. Jiang</name></author>
    <author><name>Alexandre Sablayrolles</name></author>
    <published>2023-10-10T12:00:00Z</published>
    <category term="cs.CL" />
    <link rel="related" title="pdf" href="https://arxiv.org/pdf/2310.06825v1.pdf" />
  </entry>
</feed>`;

      const metadata = ArxivParser.parseAtomXml(xml);
      expect(metadata).not.toBeNull();
      expect(metadata?.id).toBe('2310.06825v1');
      expect(metadata?.title).toBe('Mistral 7B');
      expect(metadata?.summary).toContain('Mistral 7B');
      expect(metadata?.authors).toEqual(['Albert Q. Jiang', 'Alexandre Sablayrolles']);
      expect(metadata?.categories).toContain('cs.CL');
      expect(metadata?.pdfUrl).toContain('2310.06825v1.pdf');
    });

    it('1.3: returns null gracefully for invalid or empty XML', () => {
      expect(ArxivParser.parseAtomXml('')).toBeNull();
      expect(ArxivParser.parseAtomXml('<feed></feed>')).toBeNull();
      expect(ArxivParser.parseAtomXml('Malformed text')).toBeNull();
    });

    it('1.4: fetchPaperById queries arXiv Export API and handles mock response', async () => {
      const mockFetch = vi.fn().mockResolvedValue({
        ok: true,
        text: async () => `<feed><entry><id>2310.06825</id><title>Sample</title><summary>Abstract</summary><author><name>Author</name></author><published>2023-01-01</published></entry></feed>`,
      });

      const paper = await ArxivParser.fetchPaperById('2310.06825', mockFetch as any);
      expect(paper).not.toBeNull();
      expect(paper?.id).toBe('2310.06825');
      expect(paper?.title).toBe('Sample');
    });

    it('1.5: ingestTopicOrId handles both direct arXiv ID and topic fallback', async () => {
      const mockFetch = vi.fn().mockResolvedValue({
        ok: true,
        text: async () => `<feed><entry><id>2310.06825</id><title>Mamba</title><summary>State-space model</summary><author><name>Gu</name></author><published>2023-01-01</published></entry></feed>`,
      });

      const ctxArxiv = await ArxivParser.ingestTopicOrId('2310.06825', mockFetch as any);
      expect(ctxArxiv.isDirectArxiv).toBe(true);
      expect(ctxArxiv.topic).toBe('Mamba');

      const ctxTopic = await ArxivParser.ingestTopicOrId('Deep Reinforcement Learning for Trading');
      expect(ctxTopic.isDirectArxiv).toBe(false);
      expect(ctxTopic.topic).toBe('Deep Reinforcement Learning for Trading');
      expect(ctxTopic.keyInnovations.length).toBeGreaterThan(0);
    });
  });

  // ==========================================================================
  // 2. Multi-Agent Prompts & 6 Personas
  // ==========================================================================
  describe('2. Multi-Agent Prompts & Personas', () => {
    it('2.1: contains 6 canonical expert personas with avatars and focus areas', () => {
      expect(PERSONA_LIST).toHaveLength(6);
      const ids = PERSONA_LIST.map((p) => p.id);
      expect(ids).toContain('researcher');
      expect(ids).toContain('architect');
      expect(ids).toContain('theorist');
      expect(ids).toContain('systems_engineer');
      expect(ids).toContain('applied_scientist');
      expect(ids).toContain('code_reviewer');

      PERSONA_LIST.forEach((p) => {
        expect(p.name.length).toBeGreaterThan(0);
        expect(p.role.length).toBeGreaterThan(0);
        expect(p.avatar.length).toBeGreaterThan(0);
        expect(p.color.startsWith('#')).toBe(true);
        expect(p.focusAreas.length).toBeGreaterThanOrEqual(3);
        expect(p.systemPrompt.length).toBeGreaterThan(50);
      });
    });

    it('2.2: formats perspectives generation prompt with topic input', () => {
      const prompt = formatPerspectivesPrompt('Linear Attention Mechanisms');
      expect(prompt).toContain('Linear Attention Mechanisms');
      expect(prompt).toContain('Lead Researcher');
      expect(prompt).toContain('System Architect');
    });

    it('2.3: formats problem extraction and solution generation prompts', () => {
      const problemPrompt = formatProblemExtractionPrompt('Selective State Space');
      expect(problemPrompt).toContain('Selective State Space');

      const solPrompt = formatSolutionGenerationPrompt('Challenge text', ['Req 1', 'Req 2']);
      expect(solPrompt).toContain('Challenge text');
      expect(solPrompt).toContain('Req 1');
    });

    it('2.4: formats persona critique and consensus prompts', () => {
      const persona = PERSONAS.researcher;
      const critiquePrompt = formatCritiquePrompt(
        persona,
        { approach_name: 'Test Approach', key_innovation: 'Novelty' },
        1,
        [{ agent: 'System Architect', message: 'Design proposal' }]
      );
      expect(critiquePrompt).toContain(persona.name);
      expect(critiquePrompt).toContain('Test Approach');
      expect(critiquePrompt).toContain('Current Debate Round: 1');

      const selectPrompt = formatSolutionSelectionPrompt([{ approach_name: 'Sol 1' }], [{ agent: 'Researcher' }]);
      expect(selectPrompt).toContain('Sol 1');
    });

    it('2.5: formats per-file code gen, review, strategy reasoner, and scaffolding prompts', () => {
      const codePrompt = formatCodeGenerationPrompt('main.py', { purpose: 'Demo' }, [], 'Idea', 'Design');
      expect(codePrompt).toContain('main.py');
      expect(codePrompt).toContain('ABSOLUTELY NO PLACEHOLDERS');
      expect(codePrompt).toContain('NO RELATIVE IMPORTS');

      const reviewPrompt = formatCodeReviewPrompt({ 'main.py': 'print("hello")' }, 'Idea');
      expect(reviewPrompt).toContain('main.py');

      const fixPrompt = formatStrategyReasonerPrompt(['Error line 10'], { 'main.py': 'print(1)' }, 1);
      expect(fixPrompt).toContain('Error line 10');

      const scaffoldPrompt = formatScaffoldingPrompt('Idea', { project_name: 'demo' }, ['main.py']);
      expect(scaffoldPrompt).toContain('demo');
    });
  });

  // ==========================================================================
  // 3. Python AST & Syntax Validator
  // ==========================================================================
  describe('3. PythonAstValidator', () => {
    it('3.1: deterministicPreFix normalizes smart quotes, markdown fences, and relative imports', () => {
      const messy = '```python\nfrom .model import Model\ntext = “smart quote”\r\n```';
      const clean = PythonAstValidator.deterministicPreFix(messy);
      expect(clean).not.toContain('```');
      expect(clean).toContain('from model import Model');
      expect(clean).toContain('text = "smart quote"');
      expect(clean.endsWith('\n')).toBe(true);
    });

    it('3.2: validates clean Python code with functions and classes', () => {
      const validCode = `
import math
from typing import List

class TransformerBlock:
    def __init__(self, d_model: int):
        self.d_model = d_model

    def forward(self, x: List[float]) -> List[float]:
        return [val * 2.0 for val in x]

def main():
    block = TransformerBlock(64)
    print(block.forward([1.0, 2.0]))

if __name__ == '__main__':
    main()
`;
      const result = PythonAstValidator.validateFile(validCode, 'transformer.py');
      expect(result.valid).toBe(true);
      expect(result.errors).toHaveLength(0);
      expect(result.metrics.classesCount).toBe(1);
      expect(result.metrics.functionsCount).toBe(3); // __init__, forward, main
      expect(result.metrics.hasMainBlock).toBe(true);
      expect(result.metrics.importedModules).toContain('math');
      expect(result.metrics.importedModules).toContain('typing');
    });

    it('3.3: detects bracket mismatches with line and column numbers', () => {
      const brokenCode = `def test():
    data = [1, 2, 3)
    return data
`;
      const result = PythonAstValidator.validateFile(brokenCode, 'broken.py');
      expect(result.valid).toBe(false);
      expect(result.errors.some((e) => e.rule === 'syntax-bracket-balance')).toBe(true);
    });

    it('3.4: detects tab indentation and invalid unindents', () => {
      const tabCode = `def test():\n\treturn 1\n`;
      const result = PythonAstValidator.validateFile(tabCode, 'tab.py');
      expect(result.errors.some((e) => e.rule === 'indentation-no-tabs')).toBe(true);
    });

    it('3.5: detects incomplete stubs and placeholders', () => {
      const stubCode = `
class IncompleteModel:
    def forward(self, x):
        # TODO: Implement this method
        raise NotImplementedError
`;
      const result = PythonAstValidator.validateFile(stubCode, 'stub.py');
      expect(result.metrics.hasStubs).toBe(true);
      expect(result.warnings.some((w) => w.rule === 'no-stubs')).toBe(true);
    });

    it('3.6: validateProject checks cross-file imports and unnecessary stdlib in requirements.txt', () => {
      const projectFiles = {
        'main.py': 'from model import ModelClass\nif __name__ == "__main__": pass',
        'model.py': 'class ModelClass: pass',
        'requirements.txt': 'torch>=2.0.0\nos\nsys\njson\n',
      };
      const projResult = PythonAstValidator.validateProject(projectFiles);
      expect(projResult.unnecessaryStdlibInRequirements).toContain('os');
      expect(projResult.unnecessaryStdlibInRequirements).toContain('sys');
      expect(projResult.unnecessaryStdlibInRequirements).toContain('json');
    });
  });

  // ==========================================================================
  // 4. Autonomous 19-Stage Workflow Engine
  // ==========================================================================
  describe('4. WorkflowEngine Execution & Streaming', () => {
    let client: MockWorkflowClient;
    let engine: WorkflowEngine;

    beforeEach(() => {
      client = new MockWorkflowClient();
      engine = new WorkflowEngine({
        client,
        maxDebateRounds: 2,
        consensusThreshold: 0.8,
        maxFixAttempts: 2,
      });
    });

    it('4.1: initializes with idle state and correct default properties', () => {
      const state = engine.getState();
      expect(state.stage).toBe('idle');
      expect(state.status).toBe('idle');
      expect(state.debateTurns).toHaveLength(0);
      expect(Object.keys(state.generatedFiles)).toHaveLength(0);
    });

    it('4.2: subscribes and unsubscribes to workflow events', () => {
      const logEvents: any[] = [];
      const unsub = engine.subscribe('log', (entry) => logEvents.push(entry));

      (engine as any).log('info', 'Test log message');
      expect(logEvents).toHaveLength(1);
      expect(logEvents[0].message).toBe('Test log message');

      unsub();
      (engine as any).log('info', 'Another log');
      expect(logEvents).toHaveLength(1); // No new events after unsub
    });

    it('4.3: executes complete 19-stage pipeline from topic to ready_to_publish', async () => {
      const stageChanges: WorkflowStage[] = [];
      const debateTurns: DebateTurn[] = [];

      engine.on('stage_change', (stage) => stageChanges.push(stage));
      engine.on('debate_turn', (turn) => debateTurns.push(turn));

      const finalState = await engine.execute('Selective State-Space Mamba');

      expect(finalState.status).toBe('completed');
      expect(finalState.stage).toBe('ready_to_publish');

      // Verify essential stage sequence
      expect(stageChanges).toContain('research_discovery');
      expect(stageChanges).toContain('perspectives_generation');
      expect(stageChanges).toContain('problem_extraction');
      expect(stageChanges).toContain('multi_agent_debate');
      expect(stageChanges).toContain('consensus_check');
      expect(stageChanges).toContain('solution_selection');
      expect(stageChanges).toContain('architect_specification');
      expect(stageChanges).toContain('code_generation');
      expect(stageChanges).toContain('code_review');
      expect(stageChanges).toContain('smoke_test');
      expect(stageChanges).toContain('scaffolding');
      expect(stageChanges).toContain('ready_to_publish');

      // Verify generated files
      expect(finalState.generatedFiles['main.py']).toBeDefined();
      expect(finalState.generatedFiles['model.py']).toBeDefined();
      expect(finalState.generatedFiles['pipeline.py']).toBeDefined();
      expect(finalState.generatedFiles['test_pipeline.py']).toBeDefined();
      expect(finalState.generatedFiles['README.md']).toBeDefined();
      expect(finalState.generatedFiles['requirements.txt']).toBeDefined();
      expect(finalState.generatedFiles['LICENSE']).toBeDefined();

      // Verify debate execution
      expect(finalState.debateTurns.length).toBeGreaterThan(0);
      expect(finalState.consensusScore).toBeGreaterThanOrEqual(0.8);
    });

    it('4.4: supports pause, resume, and cancel actions', async () => {
      engine.pause();
      expect(engine.getState().status).toBe('paused');

      engine.resume();
      expect(engine.getState().status).toBe('running');

      engine.cancel();
      expect(engine.getState().status).toBe('idle');
    });
  });

  // ==========================================================================
  // 5. Studio UI Component Rendering
  // ==========================================================================
  describe('5. Studio UI Components', () => {
    it('5.1: InputConfigPanel renders presets, model profile buttons, and launch trigger', () => {
      const onTopicChange = vi.fn();
      const onSelectPreset = vi.fn();
      const onSelectProfile = vi.fn();
      const onLaunch = vi.fn();

      render(
        React.createElement(InputConfigPanel, {
          topic: 'Linear Attention',
          onTopicChange,
          selectedPreset: null,
          onSelectPreset,
          selectedProfile: 'balanced',
          onSelectProfile,
          maxRounds: 2,
          onMaxRoundsChange: vi.fn(),
          isRunning: false,
          isPaused: false,
          hasOpenRouterKey: true,
          onLaunch,
          onPauseResume: vi.fn(),
          onCancel: vi.fn(),
          onOpenKeyModal: vi.fn(),
        })
      );

      expect(screen.getByText('Research Topic / arXiv Ingestion')).toBeDefined();
      expect(screen.getByText('Curated Research Presets')).toBeDefined();
      expect(screen.getByText('Free-Tier Routing Profile')).toBeDefined();

      const launchBtn = screen.getByText('Launch Autonomous Pipeline');
      fireEvent.click(launchBtn);
      expect(onLaunch).toHaveBeenCalledTimes(1);
    });

    it('5.2: PipelineVisualizer renders 17 DAG nodes with active status styling', () => {
      render(
        React.createElement(PipelineVisualizer, {
          currentStage: 'code_generation',
          status: 'running',
        })
      );

      expect(screen.getByText('Autonomous 15-Stage Workflow Pipeline')).toBeDefined();
      expect(screen.getByText('Code Gen')).toBeDefined();
      expect(screen.getByText('Research')).toBeDefined();
    });

    it('5.3: DebateStreamViewer displays debate turns, consensus meter, and toggles reasoning accordion', () => {
      const turns: DebateTurn[] = [
        {
          agent: 'Lead Researcher',
          role: 'Academic Synthesis',
          round: 1,
          message: 'The mathematical formulation is solid.',
          reasoning: 'Checking gradient norms and tensor shapes.',
          avatar: '🔬',
          color: '#06b6d4',
          feasibilityScore: 9.2,
          timestamp: Date.now(),
        },
      ];

      render(
        React.createElement(DebateStreamViewer, {
          debateTurns: turns,
          consensusScore: 0.92,
          currentRound: 1,
          maxRounds: 2,
          isStreaming: false,
        })
      );

      expect(screen.getByText('Multi-Agent Expert Debate Panel')).toBeDefined();
      expect(screen.getAllByText('Lead Researcher').length).toBeGreaterThanOrEqual(1);
      expect(screen.getByText('The mathematical formulation is solid.')).toBeDefined();
      expect(screen.getByText('92%')).toBeDefined();

      const reasoningBtn = screen.getByText('Inspect Agent Reasoning (<think>)');
      fireEvent.click(reasoningBtn);
      expect(screen.getByText(/Checking gradient norms and tensor shapes/i)).toBeDefined();
    });

    it('5.4: TerminalLogViewer renders logs and filters by level', () => {
      const logs = [
        { timestamp: new Date().toISOString(), level: 'info' as const, stage: 'discovery', message: 'Metadata parsed' },
        { timestamp: new Date().toISOString(), level: 'error' as const, stage: 'test', message: 'Syntax defect detected' },
      ];

      render(
        React.createElement(TerminalLogViewer, {
          logs,
          isStreaming: false,
        })
      );

      expect(screen.getByText('AutoGIT Execution Stream (BYOK Client-Side)')).toBeDefined();
      expect(screen.getByText('Metadata parsed')).toBeDefined();
      expect(screen.getByText('Syntax defect detected')).toBeDefined();
    });
  });
});
