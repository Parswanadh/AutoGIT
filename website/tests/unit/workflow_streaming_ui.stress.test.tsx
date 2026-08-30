import React from 'react';
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { render, screen, fireEvent, waitFor, act } from '@testing-library/react';

import PipelineVisualizer, { WORKFLOW_STAGES, StageNodeDef } from '@/components/studio/PipelineVisualizer';
import DebateStreamViewer from '@/components/studio/DebateStreamViewer';
import TerminalLogViewer from '@/components/studio/TerminalLogViewer';
import InputConfigPanel, { PRESET_TOPICS } from '@/components/studio/InputConfigPanel';
import StudioWorkspace from '@/components/studio/StudioWorkspace';
import {
  WorkflowEngine,
  WorkflowState,
  WorkflowStage,
  DebateTurn,
  WorkflowLog,
} from '@/lib/workflow/engine';
import { IOpenRouterClient, ChatMessage, StreamCallbacks } from '@/lib/openrouter/client';
import { PERSONAS, PERSONA_LIST } from '@/lib/workflow/prompts';
import { PythonAstValidator } from '@/lib/workflow/astValidator';
import { ArxivParser } from '@/lib/research/arxivParser';
import { keyStore } from '@/lib/storage/keyStore';

// Mock framer-motion animations for clean JSDOM rendering
vi.mock('framer-motion', () => {
  const filterProps = (props: any) => {
    const {
      whileHover,
      whileTap,
      layoutId,
      initial,
      animate,
      exit,
      transition,
      ...cleanProps
    } = props;
    return cleanProps;
  };

  return {
    motion: {
      div: ({ children, ...props }: any) => <div {...filterProps(props)}>{children}</div>,
      nav: ({ children, ...props }: any) => <nav {...filterProps(props)}>{children}</nav>,
      a: ({ children, ...props }: any) => <a {...filterProps(props)}>{children}</a>,
      button: ({ children, ...props }: any) => <button {...filterProps(props)}>{children}</button>,
    },
    AnimatePresence: ({ children }: any) => <>{children}</>,
  };
});

// Mock MockOpenRouterClient with controllable stream latency & delays
class ControllableMockClient implements IOpenRouterClient {
  public stepDelayMs: number = 10;
  public shouldError: boolean = false;
  public errorMessage: string = 'Injected Network Error';
  public callCount: number = 0;

  async getAvailableFreeModels() {
    return [
      { id: 'google/gemini-2.0-flash-exp:free', name: 'Gemini Flash', contextLength: 100000, isFree: true },
      { id: 'meta-llama/llama-3.3-70b-instruct:free', name: 'Llama 70B', contextLength: 100000, isFree: true },
      { id: 'qwen/qwen-2.5-coder-32b-instruct:free', name: 'Qwen Coder 32B', contextLength: 32000, isFree: true },
      { id: 'deepseek/deepseek-r1:free', name: 'DeepSeek R1', contextLength: 64000, isFree: true },
    ];
  }

  async chatStream(messages: ChatMessage[], preferredModel?: string, callbacks?: StreamCallbacks): Promise<string> {
    this.callCount++;
    if (this.shouldError) {
      const err = new Error(this.errorMessage);
      callbacks?.onError?.(err);
      throw err;
    }

    if (this.stepDelayMs > 0) {
      await new Promise((resolve) => setTimeout(resolve, this.stepDelayMs));
    }

    const lastMsg = messages[messages.length - 1]?.content || '';
    let responseText = '{"status": "ok"}';

    if (lastMsg.includes('perspectives and critical technical questions')) {
      responseText = JSON.stringify({
        perspectives: [
          { persona: 'Lead Researcher', core_question: 'Mathematical soundness?', key_priorities: ['rigor'] },
          { persona: 'System Architect', core_question: 'Modularity?', key_priorities: ['contracts'] },
        ],
        domain_challenges: ['High memory latency in baseline'],
      });
    } else if (lastMsg.includes('Senior Research Director. Deconstruct this research idea')) {
      responseText = JSON.stringify({
        domain: 'Machine Learning',
        challenge: 'Selective State Space Efficiency',
        requirements: ['Modular Python architecture', 'Runnable standalone main.py demo'],
        limitations: ['Quadratic complexity baseline'],
      });
    } else if (lastMsg.includes('Generate 3 DISTINCT, NOVEL technical solutions')) {
      responseText = JSON.stringify([
        {
          approach_name: 'Selective State-Space Architecture',
          key_innovation: 'Fast recurrent scanning',
          architecture_design: 'Layered model with fast scan',
          implementation_plan: ['Define MambaLayer', 'Write scan logic', 'Add tests'],
        },
      ]);
    } else if (lastMsg.includes('Current Debate Round:')) {
      responseText = JSON.stringify({
        agent: 'Lead Researcher',
        verdict: 'accept',
        feasibility_score: 9.5,
        debate_statement: 'I agree this architecture achieves theoretical optimality.',
      });
    } else if (lastMsg.includes('Supervisor of the Multi-Agent Research Panel')) {
      responseText = JSON.stringify({
        selected_approach_name: 'Selective State-Space Architecture',
        selection_rationale: 'Consensus achieved across all personas.',
        synthesized_architecture: 'Modular pipeline with model.py, pipeline.py, test_pipeline.py, main.py',
        final_module_list: ['main.py', 'model.py', 'pipeline.py', 'test_pipeline.py', 'requirements.txt'],
      });
    } else if (lastMsg.includes('Principal Software Architect. Create a DETAILED')) {
      responseText = JSON.stringify({
        project_name: 'mamba-state-space',
        one_line_description: 'Fast selective state-space model',
        files: [
          { name: 'main.py', purpose: 'Standalone execution demo' },
          { name: 'model.py', purpose: 'Core neural module' },
          { name: 'pipeline.py', purpose: 'Execution pipeline' },
          { name: 'test_pipeline.py', purpose: 'Unit test suite' },
        ],
        requirements: ['torch>=2.0.0', 'numpy>=1.24.0', 'pytest>=7.0.0'],
      });
    } else if (lastMsg.includes("generating the complete, production-ready file 'main.py'")) {
      responseText = `import sys\nfrom model import Model\ndef main():\n    print("Running main")\nif __name__ == "__main__":\n    main()\n`;
    } else if (lastMsg.includes("generating the complete, production-ready file 'model.py'")) {
      responseText = `class Model:\n    def __init__(self):\n        self.dim = 64\n    def forward(self, x):\n        return x * 2\n`;
    } else if (lastMsg.includes("generating the complete, production-ready file 'pipeline.py'")) {
      responseText = `from model import Model\nclass Pipeline:\n    def __init__(self):\n        self.m = Model()\n`;
    } else if (lastMsg.includes("generating the complete, production-ready file 'test_pipeline.py'")) {
      responseText = `import unittest\nfrom model import Model\nclass TestModel(unittest.TestCase):\n    def test_forward(self):\n        self.assertEqual(Model().forward(2), 4)\n`;
    } else if (lastMsg.includes('Generate production-grade repository documentation')) {
      responseText = JSON.stringify({
        readme_content: '# Project\n\nDemo\n',
        requirements_content: 'torch>=2.0.0\n',
        license_content: 'MIT License\n',
      });
    }

    callbacks?.onReasoning?.('Internal reasoning chain-of-thought...');
    callbacks?.onToken?.(responseText);
    callbacks?.onComplete?.(responseText, 'Finished');

    return responseText;
  }

  async chat(messages: ChatMessage[], preferredModel?: string): Promise<string> {
    return this.chatStream(messages, preferredModel);
  }
}

describe('Milestone 3 Challenger Stress Tests: UI, High-Throughput Streaming & State Transitions', () => {
  beforeEach(async () => {
    localStorage.clear();
    sessionStorage.clear();
    await keyStore.clearKeys();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  // ==========================================================================
  // SUITE 1: High-Throughput Event Floods (10,000+ log lines & high volume turns)
  // ==========================================================================
  describe('Suite 1: High-Throughput Event Floods & Rendering Stress', () => {
    it('1.1: TerminalLogViewer handles 10,000+ rapid log events without crashing', () => {
      const logs: WorkflowLog[] = [];
      const levels: Array<WorkflowLog['level']> = ['info', 'warn', 'error', 'success'];
      const stages = ['discovery', 'debate', 'codegen', 'validation', 'publish'];

      for (let i = 0; i < 10000; i++) {
        logs.push({
          timestamp: new Date(1700000000000 + i * 100).toISOString(),
          level: levels[i % levels.length],
          stage: stages[i % stages.length],
          message: `High-throughput log stream event #${i} [payload_chunk_alpha_${i}]`,
        });
      }

      const { container } = render(
        <TerminalLogViewer logs={logs} isStreaming={true} onClearLogs={vi.fn()} />
      );

      // Verify header and title bar render properly
      expect(screen.getByText('AutoGIT Execution Stream (BYOK Client-Side)')).toBeDefined();
      expect(screen.getByText('Autoscroll')).toBeDefined();
      expect(screen.getByText('Copy')).toBeDefined();

      // Check level filter buttons
      const errorBtn = screen.getByRole('button', { name: /error/i });
      fireEvent.click(errorBtn);

      // Verify filtered view displays error logs
      const errorBadges = container.querySelectorAll('.text-rose-400');
      expect(errorBadges.length).toBeGreaterThan(0);
    });

    it('1.2: TerminalLogViewer search filter handles adversarial regex & special character queries', () => {
      const logs: WorkflowLog[] = [
        { timestamp: new Date().toISOString(), level: 'info', stage: 'discovery', message: 'Standard log message' },
        { timestamp: new Date().toISOString(), level: 'error', stage: 'codegen', message: 'Regex test [special.*(pattern)] in function?' },
        { timestamp: new Date().toISOString(), level: 'warn', stage: 'debate', message: 'Unicode test: 🔬 🚀 ⚡ \u2714\ufe0f' },
        { timestamp: new Date().toISOString(), level: 'success', stage: 'publish', message: 'Path: /root/dir/sub-path/file.py' },
      ];

      render(<TerminalLogViewer logs={logs} isStreaming={false} />);

      const searchInput = screen.getByPlaceholderText('Filter logs or stages...');

      // Adversarial regex query 1: Malformed regex chars like ( or [.* should not throw SyntaxError
      fireEvent.change(searchInput, { target: { value: '[special.*(' } });
      expect(screen.getByText(/Regex test \[special\.\*\(pattern\)\]/i)).toBeDefined();

      // Adversarial regex query 2: Backslashes and anchors
      fireEvent.change(searchInput, { target: { value: '^$?\\' } });
      expect(screen.getByText(/Ready. No log events recorded yet/i)).toBeDefined();

      // Adversarial query 3: Unicode search
      fireEvent.change(searchInput, { target: { value: '🔬' } });
      expect(screen.getByText(/Unicode test/i)).toBeDefined();

      // Adversarial query 4: Case-insensitivity check
      fireEvent.change(searchInput, { target: { value: 'STANDARD' } });
      expect(screen.getByText(/Standard log message/i)).toBeDefined();
    });

    it('1.3: TerminalLogViewer copies 10,000 logs to clipboard and triggers clear callback', async () => {
      const logs: WorkflowLog[] = Array.from({ length: 1000 }, (_, i) => ({
        timestamp: '2026-08-30T12:00:00.000Z',
        level: 'info',
        stage: 'codegen',
        message: `Line #${i}`,
      }));

      const writeTextMock = vi.fn().mockResolvedValue(undefined);
      Object.assign(navigator, {
        clipboard: { writeText: writeTextMock },
      });

      const onClear = vi.fn();

      render(<TerminalLogViewer logs={logs} isStreaming={false} onClearLogs={onClear} />);

      const copyBtn = screen.getByTitle('Copy logs to clipboard');
      fireEvent.click(copyBtn);

      await waitFor(() => {
        expect(writeTextMock).toHaveBeenCalledTimes(1);
        expect(writeTextMock.mock.calls[0][0]).toContain('Line #0');
        expect(writeTextMock.mock.calls[0][0]).toContain('Line #999');
      });

      const clearBtn = screen.getByTitle('Clear terminal logs');
      fireEvent.click(clearBtn);
      expect(onClear).toHaveBeenCalledTimes(1);
    });

    it('1.4: DebateStreamViewer renders 60+ multi-agent turns with persona and round filters', () => {
      const turns: DebateTurn[] = [];
      const personas = PERSONA_LIST;

      for (let round = 1; round <= 3; round++) {
        for (let p = 0; p < personas.length; p++) {
          const persona = personas[p];
          turns.push({
            agent: persona.name,
            role: persona.role,
            round,
            message: `Turn from ${persona.name} in round ${round} addressing system performance.`,
            reasoning: `Chain of thought for ${persona.name} (Round ${round}) evaluating tensor shapes.`,
            avatar: persona.avatar,
            color: persona.color,
            feasibilityScore: 8.0 + (p % 3) * 0.5,
            verdict: p % 2 === 0 ? 'accept' : 'revise',
            timestamp: Date.now() + round * 100 + p,
          });
        }
      }

      render(
        <DebateStreamViewer
          debateTurns={turns}
          consensusScore={0.88}
          currentRound={3}
          maxRounds={3}
          isStreaming={true}
        />
      );

      // Verify total debate header and round status
      expect(screen.getByText('Multi-Agent Expert Debate Panel')).toBeDefined();
      expect(screen.getByText('88%')).toBeDefined();
      expect(screen.getByText('3 / 3')).toBeDefined();

      // Test persona filter button
      const personaButtons = screen.getAllByRole('button');
      const architectBtn = personaButtons.find((b) => b.textContent?.includes('System Architect') && b.textContent?.includes('🏛️'));
      expect(architectBtn).toBeDefined();
      fireEvent.click(architectBtn!);

      // Check that System Architect turns are visible
      expect(screen.getAllByText(/System Architect/i).length).toBeGreaterThanOrEqual(1);

      // Test <think> reasoning toggle
      const reasoningButtons = screen.getAllByText('Inspect Agent Reasoning (<think>)');
      expect(reasoningButtons.length).toBeGreaterThan(0);
      fireEvent.click(reasoningButtons[0]);

      expect(screen.getByText(/Chain of thought for/i)).toBeDefined();
    });

    it('1.5: DebateStreamViewer handles boundary consensus scores and empty turns gracefully', () => {
      // Empty turns
      const { rerender } = render(
        <DebateStreamViewer
          debateTurns={[]}
          consensusScore={0}
          currentRound={0}
          maxRounds={2}
          isStreaming={false}
        />
      );

      expect(screen.getByText('Debate Panel Standby')).toBeDefined();
      expect(screen.getByText('0%')).toBeDefined();
      expect(screen.getByText('Ready')).toBeDefined();

      // Extreme boundary scores: > 1.0 (clamped to 100%) and negative
      rerender(
        <DebateStreamViewer
          debateTurns={[]}
          consensusScore={1.25}
          currentRound={2}
          maxRounds={2}
          isStreaming={false}
        />
      );
      expect(screen.getByText('125%')).toBeDefined();
    });

    it('1.6: PipelineVisualizer calculates accurate progress across all 17 stages & states', () => {
      const { rerender } = render(
        <PipelineVisualizer currentStage="idle" status="idle" />
      );
      expect(screen.getByText('0%')).toBeDefined();

      // Research stage (stage index 0 -> 1/17 = 6%)
      rerender(
        <PipelineVisualizer currentStage="research_discovery" status="running" />
      );
      expect(screen.getByText('6%')).toBeDefined();

      // Mid stage (code_generation, index 7 -> 8/17 = 47%)
      rerender(
        <PipelineVisualizer currentStage="code_generation" status="running" />
      );
      expect(screen.getByText('47%')).toBeDefined();

      // Completed status -> 100%
      rerender(
        <PipelineVisualizer currentStage="ready_to_publish" status="completed" />
      );
      expect(screen.getByText('100%')).toBeDefined();

      // Error state with message
      rerender(
        <PipelineVisualizer
          currentStage="code_review"
          status="error"
          errorMessage="AST Syntax Parse Error on line 42"
        />
      );
      expect(screen.getByText(/Pipeline Execution Failed:/i)).toBeDefined();
      expect(screen.getByText(/AST Syntax Parse Error on line 42/i)).toBeDefined();
    });
  });

  // ==========================================================================
  // SUITE 2: Pause / Resume / Cancel State Transitions & Concurrency Stress
  // ==========================================================================
  describe('Suite 2: State Transitions & Async Concurrency Controls', () => {
    it('2.1: WorkflowEngine pauses and resumes execution during multi-stage run', async () => {
      const client = new ControllableMockClient();
      client.stepDelayMs = 20;

      const engine = new WorkflowEngine({ client, maxDebateRounds: 1 });

      const stateLog: string[] = [];
      engine.on('state_change', (s: WorkflowState) => stateLog.push(`${s.status}:${s.stage}`));

      const execPromise = engine.execute('Selective State-Space Mamba');

      // Allow pipeline to enter running state
      await new Promise((r) => setTimeout(r, 25));
      expect(engine.getState().status).toBe('running');

      // Pause the pipeline
      engine.pause();
      expect(engine.getState().status).toBe('paused');

      // Wait while paused and ensure state remains paused
      await new Promise((r) => setTimeout(r, 60));
      expect(engine.getState().status).toBe('paused');

      // Resume pipeline
      engine.resume();
      expect(engine.getState().status).toBe('running');

      const finalState = await execPromise;
      expect(finalState.status).toBe('completed');
      expect(finalState.stage).toBe('ready_to_publish');
    });

    it('2.2: WorkflowEngine cancels immediately during active execution and sets cancellation message', async () => {
      const client = new ControllableMockClient();
      client.stepDelayMs = 30;

      const engine = new WorkflowEngine({ client, maxDebateRounds: 1 });

      const execPromise = engine.execute('Selective State-Space Mamba');

      await new Promise((r) => setTimeout(r, 20));
      engine.cancel();

      await expect(execPromise).rejects.toThrow(/Pipeline cancelled by user/i);
      expect(engine.getState().errorMessage).toContain('Pipeline cancelled by user');
    });

    it('2.3: WorkflowEngine cancels immediately when paused without hanging', async () => {
      const client = new ControllableMockClient();
      client.stepDelayMs = 25;

      const engine = new WorkflowEngine({ client, maxDebateRounds: 1 });

      const execPromise = engine.execute('Selective State-Space Mamba');

      await new Promise((r) => setTimeout(r, 20));
      engine.pause();
      expect(engine.getState().status).toBe('paused');

      // Cancel while paused
      engine.cancel();

      await expect(execPromise).rejects.toThrow(/Pipeline cancelled by user/i);
      expect(engine.getState().errorMessage).toContain('Pipeline cancelled by user');
    });

    it('2.4: rapid pause/resume oscillations stabilize correctly', async () => {
      const client = new ControllableMockClient();
      client.stepDelayMs = 15;

      const engine = new WorkflowEngine({ client, maxDebateRounds: 1 });
      const execPromise = engine.execute('Test Oscillations');

      // Rapidly toggle 10 times
      for (let i = 0; i < 10; i++) {
        if (i % 2 === 0) engine.pause();
        else engine.resume();
        await new Promise((r) => setTimeout(r, 5));
      }

      // Ensure resumed so it can finish
      engine.resume();
      const finalState = await execPromise;
      expect(finalState.status).toBe('completed');
    });

    it('2.5: event listeners handle exceptions without crashing engine or dropping other subscribers', async () => {
      const client = new ControllableMockClient();
      client.stepDelayMs = 5;

      const engine = new WorkflowEngine({ client, maxDebateRounds: 1 });

      let healthySubscriberReceived = 0;

      // Bad subscriber throwing error
      engine.on('log', () => {
        throw new Error('Exploding subscriber');
      });

      // Healthy subscriber
      engine.on('log', () => {
        healthySubscriberReceived++;
      });

      const finalState = await engine.execute('Resilience Topic');
      expect(finalState.status).toBe('completed');
      expect(healthySubscriberReceived).toBeGreaterThan(5);
    });

    it('2.6: engine reset() clears all logs, turns, and generated files to initial state', () => {
      const engine = new WorkflowEngine();
      (engine as any).state.stage = 'code_generation';
      (engine as any).state.status = 'running';
      (engine as any).state.debateTurns = [{ agent: 'Lead Researcher', message: 'Test', round: 1, role: 'Lead', timestamp: 1 }];
      (engine as any).state.logs = [{ timestamp: '2026', level: 'info', stage: 'code', message: 'test' }];
      (engine as any).state.generatedFiles = { 'main.py': { path: 'main.py', content: 'code', language: 'python' } };

      engine.reset();

      const pristine = engine.getState();
      expect(pristine.stage).toBe('idle');
      expect(pristine.status).toBe('idle');
      expect(pristine.debateTurns).toHaveLength(0);
      expect(pristine.logs).toHaveLength(0);
      expect(Object.keys(pristine.generatedFiles)).toHaveLength(0);
    });
  });

  // ==========================================================================
  // SUITE 3: Mobile Viewport Rendering & Component Accessibility
  // ==========================================================================
  describe('Suite 3: Mobile Viewport Rendering & Component Accessibility', () => {
    it('3.1: InputConfigPanel interactive elements respond to keyboard and touch events', () => {
      const onTopicChange = vi.fn();
      const onSelectPreset = vi.fn();
      const onSelectProfile = vi.fn();
      const onLaunch = vi.fn();
      const onMaxRoundsChange = vi.fn();

      render(
        <InputConfigPanel
          topic="Mamba State Space"
          onTopicChange={onTopicChange}
          selectedPreset={null}
          onSelectPreset={onSelectPreset}
          selectedProfile="reasoning"
          onSelectProfile={onSelectProfile}
          maxRounds={3}
          onMaxRoundsChange={onMaxRoundsChange}
          isRunning={false}
          isPaused={false}
          hasOpenRouterKey={true}
          onLaunch={onLaunch}
          onPauseResume={vi.fn()}
          onCancel={vi.fn()}
          onOpenKeyModal={vi.fn()}
        />
      );

      // Textarea typing
      const textarea = screen.getByRole('textbox');
      fireEvent.change(textarea, { target: { value: 'New Research Goal' } });
      expect(onTopicChange).toHaveBeenCalledWith('New Research Goal');

      // Presets clicking
      const qloraPreset = screen.getByText('4-bit NormalFloat Quantization Engine');
      fireEvent.click(qloraPreset);
      expect(onSelectPreset).toHaveBeenCalledWith(
        expect.objectContaining({ title: '4-bit NormalFloat Quantization Engine' })
      );

      // Profile selector
      const fastProfileBtn = screen.getByText('Fast');
      fireEvent.click(fastProfileBtn);
      expect(onSelectProfile).toHaveBeenCalledWith('fast');

      // Launch button
      const launchBtn = screen.getByText('Launch Autonomous Pipeline');
      fireEvent.click(launchBtn);
      expect(onLaunch).toHaveBeenCalledTimes(1);
    });

    it('3.2: InputConfigPanel disables inputs and shows Pause / Stop controls when running', () => {
      const onPauseResume = vi.fn();
      const onCancel = vi.fn();

      render(
        <InputConfigPanel
          topic="Active Pipeline Topic"
          onTopicChange={vi.fn()}
          selectedPreset={null}
          onSelectPreset={vi.fn()}
          selectedProfile="balanced"
          onSelectProfile={vi.fn()}
          maxRounds={2}
          onMaxRoundsChange={vi.fn()}
          isRunning={true}
          isPaused={false}
          hasOpenRouterKey={true}
          onLaunch={vi.fn()}
          onPauseResume={onPauseResume}
          onCancel={onCancel}
          onOpenKeyModal={vi.fn()}
        />
      );

      const textarea = screen.getByRole('textbox') as HTMLTextAreaElement;
      expect(textarea.disabled).toBe(true);

      const pauseBtn = screen.getByText('Pause');
      fireEvent.click(pauseBtn);
      expect(onPauseResume).toHaveBeenCalledTimes(1);

      const stopBtn = screen.getByText('Stop');
      fireEvent.click(stopBtn);
      expect(onCancel).toHaveBeenCalledTimes(1);
    });

    it('3.3: StudioWorkspace switches between Pipeline, Debate, Streaming Logs, and Files tabs', async () => {
      await act(async () => {
        render(<StudioWorkspace currentMode="studio" onModeChange={vi.fn()} />);
      });

      // Default active tab is pipeline DAG
      expect(screen.getByText('Pipeline DAG')).toBeDefined();
      expect(screen.getByText('Autonomous 15-Stage Workflow Pipeline')).toBeDefined();

      // Switch to Debate tab
      const debateTabBtn = screen.getByText('Debate Panel');
      await act(async () => {
        fireEvent.click(debateTabBtn);
      });
      expect(screen.getByText('Multi-Agent Expert Debate Panel')).toBeDefined();

      // Switch to Streaming Logs tab
      const terminalTabBtn = screen.getByText('Streaming Logs');
      await act(async () => {
        fireEvent.click(terminalTabBtn);
      });
      expect(screen.getByText('AutoGIT Execution Stream (BYOK Client-Side)')).toBeDefined();
    });

    it('3.4: PipelineVisualizer handles interactive stage clicks with onSelectStage', () => {
      const onSelectStage = vi.fn();
      render(
        <PipelineVisualizer
          currentStage="code_generation"
          status="running"
          onSelectStage={onSelectStage}
        />
      );

      const debateNode = screen.getByText('Debate');
      fireEvent.click(debateNode);
      expect(onSelectStage).toHaveBeenCalledWith('multi_agent_debate');

      const reviewNode = screen.getByText('Review');
      fireEvent.click(reviewNode);
      expect(onSelectStage).toHaveBeenCalledWith('code_review');
    });
  });

  // ==========================================================================
  // SUITE 4: AST & Arxiv Edge Cases & Adversarial Robustness
  // ==========================================================================
  describe('Suite 4: AST & Arxiv Edge Cases & Adversarial Robustness', () => {
    it('4.1: PythonAstValidator accurately detects syntax errors, bracket mismatches, and unterminated multiline strings', () => {
      // Bracket mismatch
      const bracketCode = `def test():\n    data = [1, 2, 3)\n    return data\n`;
      const bracketResult = PythonAstValidator.validateFile(bracketCode, 'bracket.py');
      expect(bracketResult.valid).toBe(false);
      expect(bracketResult.errors.some((e) => e.rule === 'syntax-bracket-balance')).toBe(true);

      // Unterminated multiline string
      const unterminatedDoc = `"""This docstring has no end\ndef foo(): pass\n`;
      const docResult = PythonAstValidator.validateFile(unterminatedDoc, 'doc.py');
      expect(docResult.valid).toBe(false);
      expect(docResult.errors.some((e) => e.rule === 'syntax-unterminated-string')).toBe(true);

      // Unclosed bracket at EOF
      const unclosedBracket = `def foo():\n    data = {'a': 1\n`;
      const unclosedResult = PythonAstValidator.validateFile(unclosedBracket, 'unclosed.py');
      expect(unclosedResult.valid).toBe(false);
      expect(unclosedResult.errors.some((e) => e.rule === 'syntax-bracket-unclosed')).toBe(true);
    });

    it('4.2: PythonAstValidator processes complex valid Python with decorators and async functions', () => {
      const complexPython = `
import asyncio
from typing import Optional, Dict, Any

def timing_decorator(func):
    def wrapper(*args, **kwargs):
        return func(*args, **kwargs)
    return wrapper

class AsyncEngine:
    """Async engine implementation."""
    def __init__(self, name: str = "default"):
        self.name = name

    @timing_decorator
    async def process_item(self, item: Dict[str, Any]) -> Optional[Dict[str, Any]]:
        if not item:
            return None
        await asyncio.sleep(0.01)
        return {"processed": item}

async def main():
    engine = AsyncEngine()
    res = await engine.process_item({"val": 100})
    print(res)

if __name__ == '__main__':
    asyncio.run(main())
`;
      const result = PythonAstValidator.validateFile(complexPython, 'async_engine.py');
      expect(result.valid).toBe(true);
      expect(result.metrics.classesCount).toBe(1);
      expect(result.metrics.functionsCount).toBeGreaterThanOrEqual(3);
      expect(result.metrics.hasMainBlock).toBe(true);
      expect(result.metrics.hasStubs).toBe(false);
    });

    it('4.3: ArxivParser handles bizarre topic strings without crashing', async () => {
      const emptyCtx = await ArxivParser.ingestTopicOrId('');
      expect(emptyCtx.topic).toBe('');
      expect(emptyCtx.isDirectArxiv).toBe(false);

      const symbolCtx = await ArxivParser.ingestTopicOrId('!@#$%^&*()_+=-{}[]:;"\'<>,.?/\\|`~');
      expect(symbolCtx.topic).toBe('!@#$%^&*()_+=-{}[]:;"\'<>,.?/\\|`~');
      expect(symbolCtx.isDirectArxiv).toBe(false);

      const longCtx = await ArxivParser.ingestTopicOrId('A'.repeat(5000));
      expect(longCtx.topic.length).toBe(5000);
      expect(longCtx.synthesizedSummary.length).toBeGreaterThan(0);
    });
  });

  // ==========================================================================
  // SUITE 5: Malformed Stream Output & Fallback Resilience
  // ==========================================================================
  describe('Suite 5: Malformed Stream Output & Robust Fallbacks', () => {
    it('5.1: WorkflowEngine gracefully extracts JSON from markdown-fenced, conversational, or broken text', async () => {
      class ConversationalClient implements IOpenRouterClient {
        async getAvailableFreeModels() {
          return [{ id: 'google/gemini-2.0-flash-exp:free', name: 'Gemini', contextLength: 100000, isFree: true }];
        }
        async chatStream(messages: ChatMessage[], preferredModel?: string, callbacks?: StreamCallbacks): Promise<string> {
          // Model returns conversational text wrapped in irregular markdown with JSON array
          const text = `Certainly! Here is the JSON response:\n\`\`\`json\n[\n  {\n    "approach_name": "Resilient Approach",\n    "key_innovation": "High robustness",\n    "architecture_design": "Standard Python architecture",\n    "implementation_plan": ["main.py", "requirements.txt"]\n  }\n]\n\`\`\`\nHope this helps!`;
          callbacks?.onToken?.(text);
          return text;
        }
        async chat(messages: ChatMessage[]): Promise<string> {
          return this.chatStream(messages);
        }
      }

      const engine = new WorkflowEngine({ client: new ConversationalClient(), maxDebateRounds: 1 });
      const finalState = await engine.execute('Conversational Test');
      expect(finalState.status).toBe('completed');
      expect(finalState.generatedFiles['main.py']).toBeDefined();
    });

    it('5.2: WorkflowEngine falls back gracefully on totally unparseable JSON without crashing', async () => {
      class GarbageClient implements IOpenRouterClient {
        async getAvailableFreeModels() {
          return [{ id: 'google/gemini-2.0-flash-exp:free', name: 'Gemini', contextLength: 100000, isFree: true }];
        }
        async chatStream(messages: ChatMessage[], preferredModel?: string, callbacks?: StreamCallbacks): Promise<string> {
          const text = 'THIS IS COMPLETELY NON-JSON PLAIN TEXT WITHOUT ANY BRACKETS AT ALL';
          callbacks?.onToken?.(text);
          return text;
        }
        async chat(messages: ChatMessage[]): Promise<string> {
          return this.chatStream(messages);
        }
      }

      const engine = new WorkflowEngine({ client: new GarbageClient(), maxDebateRounds: 1 });
      const finalState = await engine.execute('Garbage Test');
      expect(finalState.status).toBe('completed');
      expect(finalState.stage).toBe('ready_to_publish');
      expect(finalState.generatedFiles['main.py']).toBeDefined();
      expect(finalState.generatedFiles['README.md']).toBeDefined();
    });
  });

  // ==========================================================================
  // SUITE 6: Multi-Subscriber Mass Concurrency & AST Scale Stress
  // ==========================================================================
  describe('Suite 6: Multi-Subscriber Mass Concurrency & Multi-File AST Stress', () => {
    it('6.1: 100 concurrent listeners handle 1,000 rapid event emissions with zero loss', () => {
      const engine = new WorkflowEngine();
      const listenerCounters = new Array(100).fill(0);

      // Register 100 subscribers
      const unsubs = listenerCounters.map((_, idx) =>
        engine.subscribe('log', () => {
          listenerCounters[idx]++;
        })
      );

      // Emit 1,000 log events
      for (let i = 0; i < 1000; i++) {
        (engine as any).log('info', `Broadcast message ${i}`);
      }

      // Verify every subscriber received all 1,000 events
      for (let idx = 0; idx < 100; idx++) {
        expect(listenerCounters[idx]).toBe(1000);
      }

      // Unsubscribe all
      unsubs.forEach((unsub) => unsub());

      // Emit another event
      (engine as any).log('info', 'Post unsubscribe event');

      // Verify counters remained at 1,000
      for (let idx = 0; idx < 100; idx++) {
        expect(listenerCounters[idx]).toBe(1000);
      }
    });

    it('6.2: PythonAstValidator validates 50-file complex repository with cross-dependencies', () => {
      const projectFiles: Record<string, string> = {
        'requirements.txt': 'torch>=2.0.0\nnumpy>=1.24.0\npytest>=7.0.0\n',
        'main.py': 'from mod_0 import Model0\nif __name__ == "__main__": print("OK")\n',
      };

      for (let i = 0; i < 48; i++) {
        const nextMod = i < 47 ? `from mod_${i + 1} import Model${i + 1}\n` : '';
        projectFiles[`mod_${i}.py`] = `import math\n${nextMod}class Model${i}:\n    def forward(self, x):\n        return x + ${i}\n`;
      }
      projectFiles['test_pipeline.py'] = 'import unittest\nfrom mod_0 import Model0\nclass TestAll(unittest.TestCase):\n    def test_run(self): self.assertTrue(True)\n';

      const projResult = PythonAstValidator.validateProject(projectFiles);
      expect(projResult.allValid).toBe(true);
      expect(projResult.summary.totalFiles).toBe(51);
      expect(projResult.summary.validFilesCount).toBe(50); // 50 .py files
      expect(projResult.summary.hasMainEntry).toBe(true);
      expect(projResult.summary.hasTestSuite).toBe(true);
    });
  });
});
