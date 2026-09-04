/**
 * Tier 6: Full 19-Node LangGraph Pipeline End-to-End Test Suite
 * Validates sequential traversal of all 19 canonical nodes, deep checkpoint creation,
 * event streaming, time-travel rollback, AST validation, and packaging.
 */

import { describe, it, expect, beforeEach } from 'vitest';
import { WorkflowEngine, WorkflowStage, WorkflowCheckpoint } from '@/lib/workflow/engine';
import { IOpenRouterClient, ChatMessage, StreamCallbacks } from '@/lib/openrouter/client';
import { PythonAstValidator } from '@/lib/workflow/astValidator';
import { ZipExporter } from '@/lib/export/zipExporter';

class MockE2EWorkflowClient implements IOpenRouterClient {
  public calls: Array<{ messages: ChatMessage[]; model?: string }> = [];

  async getAvailableFreeModels() {
    return [
      { id: 'inclusionai/ling-3.0-flash-fin:free', name: 'Ling 3.0 Flash Fin', contextLength: 262144, isFree: true },
      { id: 'openrouter/free', name: 'Free Models Router', contextLength: 200000, isFree: true },
    ];
  }

  async chatStream(messages: ChatMessage[], preferredModel?: string, callbacks?: StreamCallbacks): Promise<string> {
    this.calls.push({ messages, model: preferredModel });
    const userPrompt = messages[messages.length - 1]?.content || '';

    let text = '{"status": "ok"}';

    if (userPrompt.includes('Lead Research Ingestion Specialist')) {
      text = JSON.stringify({
        title: 'FlashAttention-2: High Performance Attention',
        domain: 'Deep Learning / Kernel Optimization',
        core_algorithms: ['Online Softmax', 'Tiled SRAM Matrix Multiply'],
        technical_requirements: [
          'Linear memory scaling with sequence length',
          'Pytest verification suite included',
          'Pure Python reference implementation with zero external dependencies',
        ],
        constraints: ['Zero-dependency fallbacks', 'Valid Python AST'],
        success_metrics: ['100% test pass rate', 'O(N) memory scaling'],
      });
    } else if (userPrompt.includes('perspectives and critical technical questions')) {
      text = JSON.stringify({
        perspectives: [
          { persona: 'Lead Researcher', core_question: 'How to preserve exact mathematical softmax fidelity?' },
          { persona: 'System Architect', core_question: 'How to design modular tiled execution blocks?' },
          { persona: 'Systems Engineer', core_question: 'How to achieve minimal SRAM memory allocations?' },
        ],
      });
    } else if (userPrompt.includes('Senior Research Director. Deconstruct this research idea')) {
      text = JSON.stringify({
        domain: 'Kernel Optimization',
        challenge: 'Memory-bound attention bottleneck',
        requirements: ['Tiled matrix compute', 'Modular architecture', 'Pytest suite'],
        limitations: ['HBM memory read-write overhead'],
      });
    } else if (userPrompt.includes('Generate 3 DISTINCT, NOVEL technical solutions')) {
      text = JSON.stringify([
        {
          approach_name: 'Tiled Block-Parallel Attention',
          key_innovation: 'Fusing online softmax with tiled matrix blocks',
          architecture_design: 'model.py for kernel, pipeline.py for batching, test_pipeline.py for pytest',
          implementation_plan: ['Implement block scan', 'Add unit tests'],
        },
      ]);
    } else if (userPrompt.includes('Current Debate Round:')) {
      text = JSON.stringify({
        agent: 'Lead Researcher',
        verdict: 'accept',
        feasibility_score: 9.5,
        debate_statement: 'Tiled block-parallel attention avoids quadratic memory bounds while preserving exact numerical output.',
      });
    } else if (userPrompt.includes('Supervisor of the Multi-Agent Research Panel')) {
      text = JSON.stringify({
        selected_approach_name: 'Tiled Block-Parallel Attention',
        selection_rationale: 'Consensus achieved across all expert personas with 9.5 feasibility score.',
        synthesized_architecture: 'Modular architecture with main.py, model.py, pipeline.py, and test_pipeline.py',
        final_module_list: ['main.py', 'model.py', 'pipeline.py', 'test_pipeline.py', 'requirements.txt'],
      });
    } else if (userPrompt.includes('Principal Software Architect. Create a DETAILED')) {
      text = JSON.stringify({
        project_name: 'flash-attention-tiled',
        one_line_description: 'Fast memory-efficient tiled attention mechanism in Python',
        files: [
          { name: 'main.py', purpose: 'Interactive entrypoint demo' },
          { name: 'model.py', purpose: 'Core attention implementation' },
          { name: 'pipeline.py', purpose: 'Batch processing pipeline' },
          { name: 'test_pipeline.py', purpose: 'Comprehensive pytest verification suite' },
        ],
        requirements: ['pytest>=7.0.0'],
      });
    } else if (userPrompt.includes("generating the complete, production-ready file 'main.py'")) {
      text = 'from model import AttentionBlock\n\ndef main():\n    model = AttentionBlock(dim=64)\n    out = model.forward([1.0, 2.0])\n    print("Attention output:", out)\n\nif __name__ == "__main__":\n    main()\n';
    } else if (userPrompt.includes("generating the complete, production-ready file 'model.py'")) {
      text = 'import math\n\nclass AttentionBlock:\n    def __init__(self, dim=64):\n        self.dim = dim\n\n    def forward(self, x):\n        return [v * 0.5 for v in x]\n';
    } else if (userPrompt.includes("generating the complete, production-ready file 'pipeline.py'")) {
      text = 'from model import AttentionBlock\n\nclass ProcessingPipeline:\n    def __init__(self):\n        self.block = AttentionBlock()\n\n    def process_batch(self, batch):\n        return [self.block.forward(x) for x in batch]\n';
    } else if (userPrompt.includes("generating the complete, production-ready file 'test_pipeline.py'")) {
      text = 'from model import AttentionBlock\nfrom pipeline import ProcessingPipeline\n\ndef test_forward():\n    block = AttentionBlock(32)\n    res = block.forward([1.0, 2.0])\n    assert len(res) == 2\n\ndef test_pipeline():\n    pipeline = ProcessingPipeline()\n    batch_out = pipeline.process_batch([[1.0], [2.0]])\n    assert len(batch_out) == 2\n';
    } else if (userPrompt.includes('Scaffold production-grade repository documentation')) {
      text = JSON.stringify({
        readme_content: '# FlashAttention Tiled\n\nMemory-efficient tiled attention in standalone Python.\n\n## Quickstart\n```bash\npython main.py\npytest test_pipeline.py\n```\n',
        requirements_content: 'pytest>=7.0.0\n',
        license_content: 'MIT License\n\nCopyright (c) 2026 AutoGIT Researcher\n',
      });
    }

    if (callbacks?.onToken) {
      callbacks.onToken(text.slice(0, 10));
    }
    return text;
  }

  async chat(messages: ChatMessage[], preferredModel?: string): Promise<string> {
    return this.chatStream(messages, preferredModel);
  }
}

describe('Tier 6: Canonical 19-Node LangGraph Pipeline End-to-End', () => {
  let client: MockE2EWorkflowClient;
  let engine: WorkflowEngine;

  beforeEach(() => {
    client = new MockE2EWorkflowClient();
    engine = new WorkflowEngine({
      client,
      maxDebateRounds: 1,
      consensusThreshold: 0.8,
    });
  });

  it('6.1: executes all 19 canonical nodes sequentially from requirements_extraction to ready_to_publish', async () => {
    const visitedStages: WorkflowStage[] = [];
    const recordedEvents: string[] = [];
    const checkpointList: WorkflowCheckpoint[] = [];

    engine.on('stage_change', (stage) => {
      visitedStages.push(stage);
      recordedEvents.push(`stage:${stage}`);
    });

    engine.on('checkpoint', (chk) => {
      checkpointList.push(chk);
    });

    const finalState = await engine.execute('FlashAttention-2: Faster Attention with Better Parallelism');

    // Verify status & final stage
    expect(finalState.status).toBe('completed');
    expect(finalState.stage).toBe('ready_to_publish');

    // 19 canonical nodes must all be visited in proper sequence
    const CANONICAL_19_NODES: WorkflowStage[] = [
      'requirements_extraction',
      'research_discovery',
      'perspectives_generation',
      'problem_extraction',
      'solution_generation',
      'multi_agent_debate',
      'consensus_check',
      'solution_selection',
      'architect_specification',
      'code_generation',
      'code_review',
      'code_testing',
      'feature_verification',
      'strategy_reasoner',
      'code_fixing',
      'smoke_test',
      'pipeline_self_eval',
      'goal_achievement_eval',
      'ready_to_publish',
    ];

    for (const node of CANONICAL_19_NODES) {
      expect(visitedStages).toContain(node);
    }

    // Checkpoint count must cover all stages (>= 19)
    expect(checkpointList.length).toBeGreaterThanOrEqual(19);
    expect(finalState.checkpoints?.length).toBeGreaterThanOrEqual(19);

    // Verify first checkpoint is requirements_extraction (step 1)
    const firstChk = checkpointList[0];
    expect(firstChk.stage).toBe('requirements_extraction');
    expect(firstChk.stepIndex).toBe(1);

    // Verify final checkpoint is ready_to_publish
    const lastChk = checkpointList[checkpointList.length - 1];
    expect(lastChk.stage).toBe('ready_to_publish');
  });

  it('6.2: generates a complete, valid Python codebase with AST validation and pytest suite', async () => {
    const finalState = await engine.execute('FlashAttention-2: Faster Attention with Better Parallelism');

    const files = finalState.generatedFiles;
    expect(files['main.py']).toBeDefined();
    expect(files['model.py']).toBeDefined();
    expect(files['pipeline.py']).toBeDefined();
    expect(files['test_pipeline.py']).toBeDefined();
    expect(files['README.md']).toBeDefined();
    expect(files['requirements.txt']).toBeDefined();
    expect(files['LICENSE']).toBeDefined();

    // AST validate each generated Python file
    const codeMap: Record<string, string> = {};
    for (const [name, f] of Object.entries(files)) {
      if (name.endsWith('.py')) {
        codeMap[name] = f.content;
        const validation = PythonAstValidator.validateFile(f.content, name);
        expect(validation.valid).toBe(true);
        expect(validation.errors.length).toBe(0);
      }
    }

    // Project-level AST validation
    const projectValidation = PythonAstValidator.validateProject(codeMap);
    expect(projectValidation.allValid).toBe(true);
    expect(projectValidation.summary.totalFiles).toBe(4);
    expect(projectValidation.summary.validFilesCount).toBe(4);
  });

  it('6.3: supports time-travel rollback to intermediate stage without corrupting history', async () => {
    await engine.execute('FlashAttention-2: Faster Attention with Better Parallelism');

    const checkpoints = engine.getCheckpoints();
    expect(checkpoints.length).toBeGreaterThanOrEqual(19);

    // Roll back to architect_specification (Node 9)
    const target = checkpoints.find((c) => c.stage === 'architect_specification');
    expect(target).toBeDefined();

    const rolledBack = engine.rollbackToCheckpoint(target!.checkpointId);
    expect(rolledBack.stage).toBe('architect_specification');
    expect(rolledBack.stepIndex).toBe(target!.stepIndex);
    expect(engine.getCheckpoints().length).toBe(target!.stepIndex);
  });

  it('6.4: packages generated project files cleanly for JSZip export and GitHub commit', async () => {
    const finalState = await engine.execute('FlashAttention-2: Faster Attention with Better Parallelism');

    const fileList = Object.values(finalState.generatedFiles);
    expect(fileList.length).toBeGreaterThanOrEqual(7);

    // Verify JSZip bundle export builds without errors
    const exporter = new ZipExporter();
    const zipBlob = await exporter.exportRepositoryZip({
      projectName: 'flash-attention-tiled',
      files: finalState.generatedFiles,
    });
    expect(zipBlob).toBeDefined();
    expect(zipBlob.size).toBeGreaterThan(100);
  });
});
