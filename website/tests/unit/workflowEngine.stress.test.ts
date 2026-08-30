import { describe, it, expect, vi } from 'vitest';
import { ArxivParser, ArxivPaperMetadata, ResearchContext } from '../../lib/research/arxivParser';
import { PythonAstValidator, PYTHON_STDLIB_MODULES } from '../../lib/workflow/astValidator';
import {
  WorkflowEngine,
  WorkflowState,
  WorkflowStage,
  DebateTurn,
} from '../../lib/workflow/engine';
import { IOpenRouterClient, ChatMessage, StreamCallbacks } from '../../lib/openrouter/client';
import {
  PERSONA_LIST,
  formatPerspectivesPrompt,
  formatProblemExtractionPrompt,
  formatSolutionGenerationPrompt,
  formatCritiquePrompt,
  formatSolutionSelectionPrompt,
  formatArchitectSpecPrompt,
  formatCodeGenerationPrompt,
  formatStrategyReasonerPrompt,
  formatSelfHealingFixPrompt,
  formatScaffoldingPrompt,
} from '../../lib/workflow/prompts';

// Configurable Adversarial Mock LLM Client for Stress Testing
class AdversarialWorkflowClient implements IOpenRouterClient {
  public callHistory: Array<{ messages: ChatMessage[]; model?: string }> = [];
  public customHandler?: (prompt: string, messages: ChatMessage[]) => string | Promise<string | undefined> | undefined;

  constructor() {}

  async getAvailableFreeModels() {
    return [
      { id: 'google/gemini-2.0-flash-exp:free', name: 'Gemini Flash', contextLength: 100000, isFree: true },
      { id: 'meta-llama/llama-3.3-70b-instruct:free', name: 'Llama 70B', contextLength: 100000, isFree: true },
      { id: 'qwen/qwen-2.5-coder-32b-instruct:free', name: 'Qwen Coder 32B', contextLength: 32000, isFree: true },
      { id: 'deepseek/deepseek-r1:free', name: 'DeepSeek R1', contextLength: 64000, isFree: true },
    ];
  }

  async chatStream(
    messages: ChatMessage[],
    preferredModel?: string,
    callbacks?: StreamCallbacks
  ): Promise<string> {
    this.callHistory.push({ messages, model: preferredModel });
    const userPrompt = messages[messages.length - 1]?.content || '';

    let customHandled: string | undefined;
    if (this.customHandler) {
      customHandled = await this.customHandler(userPrompt, messages);
    }

    let responseText = customHandled;

    if (responseText === undefined) {
      if (userPrompt.includes('perspectives and critical technical questions')) {
        responseText = JSON.stringify({
          perspectives: [{ persona: 'Lead Researcher', core_question: 'Theory?', key_priorities: ['math'] }],
          domain_challenges: ['Challenge 1'],
        });
      } else if (userPrompt.includes('Senior Research Director. Deconstruct this research idea')) {
        responseText = JSON.stringify({
          domain: 'Machine Learning',
          challenge: 'Stress Test Domain',
          requirements: ['Modular architecture', 'Runnable demo'],
          limitations: [],
        });
      } else if (userPrompt.includes('Generate 3 DISTINCT, NOVEL technical solutions')) {
        responseText = JSON.stringify([
          {
            approach_name: 'Adversarial Solution',
            key_innovation: 'Novelty',
            architecture_design: 'Layered',
            implementation_plan: ['Step 1', 'Step 2'],
          },
        ]);
      } else if (userPrompt.includes('Current Debate Round:')) {
        responseText = JSON.stringify({
          agent: 'Lead Researcher',
          verdict: 'accept',
          feasibility_score: 9.0,
          debate_statement: 'Solid proposal.',
        });
      } else if (userPrompt.includes('Supervisor of the Multi-Agent Research Panel')) {
        responseText = JSON.stringify({
          selected_approach_name: 'Adversarial Solution',
          selection_rationale: 'Best fit.',
          synthesized_architecture: 'Architecture details',
          final_module_list: ['main.py', 'model.py'],
        });
      } else if (userPrompt.includes('Principal Software Architect. Create a DETAILED')) {
        responseText = JSON.stringify({
          project_name: 'stress-project',
          one_line_description: 'Stress test project',
          files: [
            { name: 'main.py', purpose: 'Entry point' },
            { name: 'model.py', purpose: 'Model definition' },
          ],
          requirements: ['torch>=2.0.0'],
        });
      } else if (userPrompt.includes("generating the complete, production-ready file 'main.py'")) {
        responseText = 'import sys\n\ndef main():\n    print("Hello AutoGIT")\n\nif __name__ == "__main__":\n    main()\n';
      } else if (userPrompt.includes("generating the complete, production-ready file 'model.py'")) {
        responseText = 'class StressModel:\n    def __init__(self):\n        pass\n';
      } else if (userPrompt.includes('Generate production-grade repository documentation')) {
        responseText = JSON.stringify({
          readme_content: '# Stress Project\n',
          requirements_content: 'torch>=2.0.0\n',
          license_content: 'MIT License\n',
        });
      } else {
        responseText = '{"status": "ok"}';
      }
    }

    if (callbacks?.onReasoning) {
      callbacks.onReasoning('Analyzing...');
    }
    if (callbacks?.onToken) {
      callbacks.onToken(responseText);
    }
    if (callbacks?.onComplete) {
      callbacks.onComplete(responseText);
    }

    return responseText;
  }

  async chat(messages: ChatMessage[], preferredModel?: string): Promise<string> {
    return this.chatStream(messages, preferredModel);
  }
}

describe('Milestone 3 Empirical Stress Tests: arXiv Parser, AST Validator, and Workflow Engine', () => {
  // ==========================================================================
  // SECTION 1: arXiv Ingestion & Parser Edge Cases
  // ==========================================================================
  describe('1. arXiv Parser Extreme Edge Cases & Fault Tolerance', () => {
    it('1.1: extracts IDs across diverse legacy, modern, parameterized, and dirty formats', () => {
      const cases: Array<[string | null | undefined, string | null]> = [
        ['2310.06825', '2310.06825'],
        ['2310.06825v1', '2310.06825v1'],
        ['2310.06825v99', '2310.06825v99'],
        ['0704.0001', '0704.0001'],
        ['1501.00001', '1501.00001'], // 5 digit
        ['https://arxiv.org/abs/2310.06825', '2310.06825'],
        ['https://arxiv.org/abs/2310.06825v2?context=cs.AI', '2310.06825v2'],
        ['https://arxiv.org/pdf/2310.06825.pdf#page=1', '2310.06825'],
        ['http://arxiv.org/abs/1706.03762', '1706.03762'],
        ['arxiv.org/abs/2310.06825', '2310.06825'],
        ['arXiv:2310.06825v3 [cs.CL]', '2310.06825v3'],
        ['arXiv: 2310.06825', '2310.06825'],
        ['hep-th/9910001', 'hep-th/9910001'],
        ['math.GT/0309136', 'math.GT/0309136'],
        ['https://arxiv.org/abs/hep-th/9910001', 'hep-th/9910001'],
        ['https://arxiv.org/pdf/cs.AI/0102003.pdf', 'cs.AI/0102003'],
        ['', null],
        ['   ', null],
        [null, null],
        [undefined, null],
        ['Random string without id', null],
        ['https://github.com/someone/repo', null],
        ['123.456', null], // invalid format
        ['2023.99', null], // incomplete
      ];

      for (const [input, expected] of cases) {
        expect(ArxivParser.extractArxivId(input)).toBe(expected);
      }
    });

    it('1.2: survives massive input strings (100KB) without regex catastrophe or lag', () => {
      const hugePrefix = 'A'.repeat(50000);
      const hugeSuffix = 'B'.repeat(50000);
      const target = `${hugePrefix} arXiv:2310.06825 ${hugeSuffix}`;

      const start = performance.now();
      const extracted = ArxivParser.extractArxivId(target);
      const elapsed = performance.now() - start;

      expect(extracted).toBe('2310.06825');
      expect(elapsed).toBeLessThan(100); // Must be fast sub-100ms
    });

    it('1.3: handles malformed, truncated, XML entity, and namespace-polluted XML', () => {
      // 1. XML with non-standard namespaces and LaTeX in summary
      const complexXml = `<?xml version="1.0" encoding="UTF-8"?>
<feed xmlns="http://www.w3.org/2005/Atom" xmlns:arxiv="http://arxiv.org/schemas/atom">
  <entry>
    <id>http://arxiv.org/abs/2310.06825v1</id>
    <title> Attention Is All You Need: &lt;b&gt;Transformers&lt;/b&gt; &amp; $\\mathcal{O}(N)$ </title>
    <summary> We propose $f(x) = \\sum_{i=1}^N x_i$ with $W_Q, W_K, W_V \\in \\mathbb{R}^{d \\times d}$.
    Multi-line abstract with special characters: &amp; &lt; &gt; " ' </summary>
    <author><name>Ashish Vaswani</name></author>
    <author><name>Noam Shazeer</name></author>
    <author><name>Niki Parmar</name></author>
    <published>2017-06-12T17:58:00Z</published>
    <updated>2017-12-06T15:00:00Z</updated>
    <arxiv:doi>10.5555/3295222.3295349</arxiv:doi>
    <arxiv:comment>15 pages, 5 figures</arxiv:comment>
    <arxiv:journal_ref>NeurIPS 2017</arxiv:journal_ref>
    <category term="cs.CL" />
    <category term="cs.AI" />
    <category term="cs.LG" />
    <link rel="related" title="pdf" href="https://arxiv.org/pdf/2310.06825v1.pdf" />
  </entry>
</feed>`;

      const parsed = ArxivParser.parseAtomXml(complexXml);
      expect(parsed).not.toBeNull();
      expect(parsed?.id).toBe('2310.06825v1');
      expect(parsed?.title).toContain('Transformers');
      expect(parsed?.authors).toHaveLength(3);
      expect(parsed?.categories).toEqual(['cs.CL', 'cs.AI', 'cs.LG']);
      expect(parsed?.primaryCategory).toBe('cs.CL');
      expect(parsed?.doi).toBe('10.5555/3295222.3295349');
      expect(parsed?.comment).toBe('15 pages, 5 figures');
      expect(parsed?.journalRef).toBe('NeurIPS 2017');
      expect(parsed?.pdfUrl).toBe('https://arxiv.org/pdf/2310.06825v1.pdf');
    });

    it('1.4: gracefully handles XML missing authors, missing categories, or missing summary', () => {
      const minimalXml = `<entry>
  <id>http://arxiv.org/abs/2101.00001</id>
  <title>Bare Minimum Paper</title>
</entry>`;

      const parsed = ArxivParser.parseAtomXml(minimalXml);
      expect(parsed).not.toBeNull();
      expect(parsed?.id).toBe('2101.00001');
      expect(parsed?.title).toBe('Bare Minimum Paper');
      expect(parsed?.authors).toEqual(['Unknown Author']);
      expect(parsed?.categories).toEqual(['cs.AI']);
      expect(parsed?.pdfUrl).toBe('https://arxiv.org/pdf/2101.00001.pdf');
    });

    it('1.5: returns null on completely corrupted XML or missing entry tags', () => {
      expect(ArxivParser.parseAtomXml(null)).toBeNull();
      expect(ArxivParser.parseAtomXml(undefined)).toBeNull();
      expect(ArxivParser.parseAtomXml('')).toBeNull();
      expect(ArxivParser.parseAtomXml('<html><body>502 Bad Gateway</body></html>')).toBeNull();
      expect(ArxivParser.parseAtomXml('<?xml version="1.0"?><feed><title>Empty</title></feed>')).toBeNull();
      expect(ArxivParser.parseAtomXml('<entry><id></id><title></title></entry>')).toBeNull();
    });

    it('1.6: fetchPaperById handles HTTP 500, 404, 503, and network throw gracefully', async () => {
      // 500 error
      const mock500 = vi.fn().mockResolvedValue({ ok: false, status: 500 });
      const res500 = await ArxivParser.fetchPaperById('2310.06825', mock500 as any);
      expect(res500).toBeNull();

      // 404 error
      const mock404 = vi.fn().mockResolvedValue({ ok: false, status: 404 });
      const res404 = await ArxivParser.fetchPaperById('2310.06825', mock404 as any);
      expect(res404).toBeNull();

      // Network exception
      const mockCrash = vi.fn().mockRejectedValue(new Error('Network error: Failed to fetch'));
      const resCrash = await ArxivParser.fetchPaperById('2310.06825', mockCrash as any);
      expect(resCrash).toBeNull();
    });

    it('1.7: searchPapers parses multiple entries and handles empty feeds', async () => {
      const multiXml = `<feed>
  <entry>
    <id>http://arxiv.org/abs/2301.00001</id>
    <title>Paper 1</title>
    <summary>Abstract 1</summary>
    <author><name>Alice</name></author>
  </entry>
  <entry>
    <id>http://arxiv.org/abs/2301.00002</id>
    <title>Paper 2</title>
    <summary>Abstract 2</summary>
    <author><name>Bob</name></author>
  </entry>
</feed>`;

      const mockMulti = vi.fn().mockResolvedValue({
        ok: true,
        text: async () => multiXml,
      });

      const papers = await ArxivParser.searchPapers('transformer', 5, mockMulti as any);
      expect(papers).toHaveLength(2);
      expect(papers[0].id).toBe('2301.00001');
      expect(papers[1].id).toBe('2301.00002');

      // Empty query returns empty array immediately
      const emptyPapers = await ArxivParser.searchPapers('   ');
      expect(emptyPapers).toEqual([]);
    });

    it('1.8: ingestTopicOrId degrades seamlessly to synthesized topic context on network failure', async () => {
      const mockDown = vi.fn().mockRejectedValue(new Error('Connection timed out'));
      const context = await ArxivParser.ingestTopicOrId('2310.06825', mockDown as any);

      expect(context.isDirectArxiv).toBe(false);
      expect(context.topic).toBe('2310.06825');
      expect(context.synthesizedSummary).toContain('Research Objective: 2310.06825');
      expect(context.keyInnovations.length).toBeGreaterThan(0);
      expect(context.limitations.length).toBeGreaterThan(0);
    });
  });

  // ==========================================================================
  // SECTION 2: Python AST & Syntax Validator Stress Testing
  // ==========================================================================
  describe('2. PythonAstValidator Severely Malformed Code & Scale Stress', () => {
    it('2.1: deterministicPreFix normalizes bizarre unicode quotes, dashes, non-breaking spaces and relative imports', () => {
      const dirtyCode = [
        '```python',
        'from .submodule import SubClass',
        'from .parent import ParentClass',
        'text_1 = ‘single quotes’',
        'text_2 = “double quotes”',
        'text_3 = „low quotes”',
        'dash_1 = 10 – 5  # en-dash',
        'dash_2 = 20 — 10 # em-dash',
        'nbsp_code = 123\u00A0+\u00A0456',
        '```',
      ].join('\r\n');

      const cleaned = PythonAstValidator.deterministicPreFix(dirtyCode);

      expect(cleaned).not.toContain('```');
      expect(cleaned).toContain('from submodule import SubClass');
      expect(cleaned).toContain('from parent import ParentClass');
      expect(cleaned).toContain("text_1 = 'single quotes'");
      expect(cleaned).toContain('text_2 = "double quotes"');
      expect(cleaned).toContain('dash_1 = 10 - 5');
      expect(cleaned).toContain('dash_2 = 20 - 10');
      expect(cleaned).toContain('nbsp_code = 123 + 456');
      expect(cleaned.endsWith('\n')).toBe(true);
    });

    it('2.2: detects complex bracket mismatches in nested expressions', () => {
      const complexBroken = `
def nested_structures():
    matrix = [
        [1, 2, (3 + 4}],
        [5, 6, 7]
    ]
    return matrix
`;
      const res = PythonAstValidator.validateFile(complexBroken);
      expect(res.valid).toBe(false);
      expect(res.errors.some((e) => e.rule === 'syntax-bracket-balance')).toBe(true);
      expect(res.errors[0].message).toContain("Mismatched bracket: expected closing for '('");
    });

    it('2.3: ignores brackets and colons inside single-line strings, multiline docstrings, and comments', () => {
      const validCodeWithBracketsInStrings = `
# Comment with unmatched brackets: [ ( {
"""
Multiline docstring with unbalanced brackets: ] } )
def fake_function():
    pass
"""
'''
Another multiline with colons: and [ {
'''

class RobustClass:
    """Docstring with (brackets) and colons:"""
    def __init__(self):
        self.msg = "String with unmatched bracket: ( [ {"
        self.quote_escape = "Escaped \\" quote with (bracket)"
        self.char_quote = 'Single quote with } ]'

    def process(self, x: int) -> str:
        # Another comment with: if True:
        return f"Result: {x}"

if __name__ == '__main__':
    obj = RobustClass()
    print(obj.process(42))
`;

      const res = PythonAstValidator.validateFile(validCodeWithBracketsInStrings, 'robust.py');
      expect(res.valid).toBe(true);
      expect(res.errors).toHaveLength(0);
      expect(res.metrics.classesCount).toBe(1);
      expect(res.metrics.functionsCount).toBe(2); // __init__, process
      expect(res.metrics.hasMainBlock).toBe(true);
    });

    it('2.4: detects unterminated multiline docstring at end of file', () => {
      const unclosedDoc = `
class IncompleteDoc:
    """This docstring is never closed...
    def compute():
        return 1
`;
      const res = PythonAstValidator.validateFile(unclosedDoc);
      expect(res.valid).toBe(false);
      expect(res.errors.some((e) => e.rule === 'syntax-unterminated-string')).toBe(true);
    });

    it('2.5: detects unclosed brackets at end of file', () => {
      const unclosedBracket = `
def calc():
    data = (1, 2, 3, [4, 5
    return data
`;
      const res = PythonAstValidator.validateFile(unclosedBracket);
      expect(res.valid).toBe(false);
      expect(res.errors.some((e) => e.rule === 'syntax-bracket-unclosed')).toBe(true);
    });

    it('2.6: strictly validates indentation levels, unexpected increases, and unindent mismatches', () => {
      // 1. Missing indentation after colon block
      const missingIndent = `
def compute():
x = 10
`;
      const res1 = PythonAstValidator.validateFile(missingIndent);
      expect(res1.valid).toBe(false);
      expect(res1.errors.some((e) => e.rule === 'indentation-expected-block')).toBe(true);

      // 2. Unindent mismatch (invalid unindent to 3 spaces when outer is 0 or 4)
      const invalidUnindent = `
def outer():
    if True:
        val = 1
   val = 2
`;
      const res2 = PythonAstValidator.validateFile(invalidUnindent);
      expect(res2.valid).toBe(false);
      expect(res2.errors.some((e) => e.rule === 'indentation-unindent-mismatch')).toBe(true);

      // 3. Tab indentation
      const tabIndented = `def func():\n\treturn 1\n`;
      const res3 = PythonAstValidator.validateFile(tabIndented);
      expect(res3.valid).toBe(false);
      expect(res3.errors.some((e) => e.rule === 'indentation-no-tabs')).toBe(true);
    });

    it('2.7: identifies all canonical stub patterns and placeholder comments', () => {
      const stubCode = `
class StubbedModule:
    def method_1(self):
        # TODO: Implement algorithm
        pass

    def method_2(self):
        # FIXME: Memory leak
        pass  # stub

    def method_3(self):
        raise NotImplementedError

    def method_4(self):
        raise NotImplementedError()

    def method_5(self):
        ...
`;
      const res = PythonAstValidator.validateFile(stubCode);
      expect(res.metrics.hasStubs).toBe(true);
      expect(res.warnings.length).toBeGreaterThanOrEqual(5);
    });

    it('2.8: stress tests scale with 5,000 lines of valid generated Python code (>100KB)', () => {
      const lines: string[] = [
        'import math',
        'from typing import List, Dict',
        '',
        'class LargeEngine:',
        '    def __init__(self):',
        '        self.data = []',
      ];

      for (let i = 0; i < 1000; i++) {
        lines.push(`    def step_${i}(self, x: int) -> int:`);
        lines.push(`        \"\"\"Docstring for step ${i}\"\"\"`);
        lines.push(`        val = (x * ${i}) + math.isqrt(x + 1)`);
        lines.push(`        return val`);
      }

      lines.push('if __name__ == "__main__":');
      lines.push('    engine = LargeEngine()');
      lines.push('    print(engine.step_0(10))');

      const hugeCode = lines.join('\n');
      expect(hugeCode.length).toBeGreaterThan(50000);

      const start = performance.now();
      const res = PythonAstValidator.validateFile(hugeCode, 'large_engine.py');
      const elapsed = performance.now() - start;

      expect(res.valid).toBe(true);
      expect(res.metrics.classesCount).toBe(1);
      expect(res.metrics.functionsCount).toBe(1001); // 1000 steps + __init__
      expect(res.metrics.hasMainBlock).toBe(true);
      expect(elapsed).toBeLessThan(500); // 5000 lines parsed in <500ms
    });

    it('2.9: project-wide validation flags missing requirements and stdlib redundancies', () => {
      const project = {
        'main.py': 'import torch\nimport numpy as np\nfrom custom_layer import CustomLayer\nif __name__ == "__main__": pass',
        'custom_layer.py': 'import torch.nn as nn\nimport scipy\nclass CustomLayer: pass',
        'test_custom.py': 'import unittest\nclass TestCustom(unittest.TestCase): pass',
        'requirements.txt': 'torch>=2.0.0\nnumpy>=1.24.0\nos\nsys\njson\nmath\n',
      };

      const result = PythonAstValidator.validateProject(project);

      // 'scipy' is imported in custom_layer.py but missing from requirements.txt
      expect(result.missingDependencies).toContain('scipy');

      // 'os', 'sys', 'json', 'math' are Python stdlib and should not be in requirements.txt
      expect(result.unnecessaryStdlibInRequirements).toEqual(
        expect.arrayContaining(['os', 'sys', 'json', 'math'])
      );

      expect(result.summary.hasMainEntry).toBe(true);
      expect(result.summary.hasTestSuite).toBe(true);
      expect(result.summary.validFilesCount).toBe(3);
    });
  });

  // ==========================================================================
  // SECTION 3: Workflow Engine & Self-Healing Recursion Limits
  // ==========================================================================
  describe('3. Self-Healing Recursion Limits, Convergence & Failure Recovery', () => {
    it('3.1: self-healing loop terminates gracefully at maxFixAttempts when code remains unfixable', async () => {
      let repairCallsCount = 0;

      const client = new AdversarialWorkflowClient();
      client.customHandler = (prompt: string) => {
        // Initial code gen returns broken code
        if (prompt.includes("generating the complete, production-ready file 'main.py'")) {
          return 'def run():\n    data = [1, 2, 3)\n    return data\n';
        }
        if (prompt.includes("generating the complete, production-ready file 'model.py'")) {
          return 'class BrokenModel:\n    def forward(self):\n        return (1, 2}\n';
        }
        // Diagnosis prompt
        if (prompt.includes('Principal Software Debugger & Systems Specialist')) {
          return JSON.stringify({
            per_file_instructions: {
              'main.py': 'Fix bracket error',
              'model.py': 'Fix bracket error',
            },
            files_to_modify: ['main.py', 'model.py'],
          });
        }
        // Repair prompt: stubbornly return still-broken code
        if (prompt.includes('expert Python engineer fixing defects in')) {
          repairCallsCount++;
          return 'def still_broken():\n    bad = [10, 20}\n';
        }
        return undefined; // Fall back to default valid stage responses
      };

      const engine = new WorkflowEngine({
        client,
        maxDebateRounds: 1,
        consensusThreshold: 0.8,
        maxFixAttempts: 3, // Exactly 3 attempts
      });

      const stagesVisited: WorkflowStage[] = [];
      engine.on('stage_change', (s) => stagesVisited.push(s));

      const finalState = await engine.execute('Unfixable Syntax Pipeline');

      // Crucial empirical assertions:
      expect(finalState.fixAttempts).toBe(3);
      expect(finalState.maxFixAttempts).toBe(3);
      expect(repairCallsCount).toBe(6); // 2 files * 3 fix attempts = 6 calls
      expect(stagesVisited.filter((s) => s === 'self_healing_fix').length).toBe(1);
      // Engine must proceed to scaffolding and ready_to_publish without infinite recursion
      expect(stagesVisited).toContain('code_testing');
      expect(stagesVisited).toContain('scaffolding');
      expect(stagesVisited).toContain('ready_to_publish');
      expect(finalState.status).toBe('completed');
    });

    it('3.2: self-healing loop successfully exits early if syntax is repaired on first attempt', async () => {
      let repairCallsCount = 0;

      const client = new AdversarialWorkflowClient();
      client.customHandler = (prompt: string) => {
        if (prompt.includes("generating the complete, production-ready file 'main.py'")) {
          return 'def run():\n    data = [1, 2, 3)\n    return data\n';
        }
        if (prompt.includes("generating the complete, production-ready file 'model.py'")) {
          return 'class Model:\n    def forward(self):\n        return [1, 2]\n';
        }
        if (prompt.includes('Principal Software Debugger & Systems Specialist')) {
          return JSON.stringify({
            per_file_instructions: { 'main.py': 'Fix bracket on line 2' },
            files_to_modify: ['main.py'],
          });
        }
        if (prompt.includes('expert Python engineer fixing defects in')) {
          repairCallsCount++;
          // First attempt returns clean valid code
          return 'def run():\n    data = [1, 2, 3]\n    return data\n\nif __name__ == "__main__":\n    run()\n';
        }
        return undefined; // Fall back to default responses
      };

      const engine = new WorkflowEngine({
        client,
        maxDebateRounds: 1,
        maxFixAttempts: 3,
      });

      const finalState = await engine.execute('Quick Repair Pipeline');

      expect(repairCallsCount).toBe(1);
      expect(finalState.fixAttempts).toBe(1); // Exited early on round 1
      expect(finalState.status).toBe('completed');
    });

    it('3.3: debate rounds terminate at maxDebateRounds when personas consistently reject proposal', async () => {
      let turnCount = 0;

      const client = new AdversarialWorkflowClient();
      client.customHandler = (prompt: string) => {
        if (prompt.includes('Current Debate Round:')) {
          turnCount++;
          return JSON.stringify({
            agent: 'Hostile Reviewer',
            verdict: 'reject',
            feasibility_score: 2.0,
            agreement_with_proposal: 'none',
            debate_statement: 'I completely reject this design as unfeasible.',
          });
        }
        return undefined; // Fall back to default responses
      };

      const maxDebateRounds = 2;
      const engine = new WorkflowEngine({
        client,
        maxDebateRounds,
        consensusThreshold: 0.95, // High unreachable threshold
      });

      const finalState = await engine.execute('Controversial Research Topic');

      // 6 personas * 2 rounds = 12 debate turns
      expect(turnCount).toBe(12);
      expect(finalState.currentRound).toBe(2);
      expect(finalState.debateTurns).toHaveLength(12);
      // Engine must advance despite lack of consensus once max rounds are reached
      expect(finalState.stage).toBe('ready_to_publish');
      expect(finalState.status).toBe('completed');
    });

    it('3.4: handles corrupted JSON responses across all LLM prompt formatters gracefully', async () => {
      const client = new AdversarialWorkflowClient();
      client.customHandler = (prompt: string) => {
        // Return broken JSON for everything
        if (prompt.includes('perspectives and critical technical questions')) {
          return 'Not JSON at all: Here are some questions...';
        }
        if (prompt.includes('Senior Research Director. Deconstruct this research idea')) {
          return '{ broken json "domain": "ML"';
        }
        if (prompt.includes('Generate 3 DISTINCT, NOVEL technical solutions')) {
          return '```json\n[{"incomplete": true\n```';
        }
        if (prompt.includes('Supervisor of the Multi-Agent Research Panel')) {
          return 'I select the first approach.';
        }
        if (prompt.includes('Principal Software Architect. Create a DETAILED')) {
          return 'Here is the plan:\n1. main.py\n2. model.py';
        }
        if (prompt.includes('Generate production-grade repository documentation')) {
          return 'README:\n# Test Project';
        }
        return undefined;
      };

      const engine = new WorkflowEngine({
        client,
        maxDebateRounds: 1,
      });

      // Pipeline must complete without uncaught SyntaxErrors from JSON.parse
      const finalState = await engine.execute('Corrupted JSON Stream');
      expect(finalState.status).toBe('completed');
      expect(finalState.generatedFiles['README.md']).toBeDefined();
      expect(finalState.generatedFiles['requirements.txt']).toBeDefined();
    });

    it('3.5: immediately cancels execution when cancel() is triggered mid-pipeline', async () => {
      const client = new AdversarialWorkflowClient();
      let callCount = 0;
      client.customHandler = async () => {
        callCount++;
        // Trigger cancel on the 2nd LLM call
        if (callCount === 2) {
          engine.cancel();
        }
        return undefined;
      };

      const engine = new WorkflowEngine({ client });

      await expect(engine.execute('Cancelled Pipeline')).rejects.toThrow(/Pipeline cancelled by user/i);
      expect(engine.getState().stage).toBe('error');
      expect(engine.getState().status).toBe('error');
      expect(engine.getState().errorMessage).toContain('Pipeline cancelled by user');
    });

    it('3.6: transitions to error status when OpenRouter client throws unhandled exception', async () => {
      const client = new AdversarialWorkflowClient();
      client.customHandler = () => {
        throw new Error('401 Unauthorized: Invalid OpenRouter API Key');
      };

      const engine = new WorkflowEngine({ client });

      let errorEventReceived: any = null;
      engine.on('error', (err) => { errorEventReceived = err; });

      await expect(engine.execute('Auth Fail Pipeline')).rejects.toThrow(/401 Unauthorized/i);

      expect(engine.getState().status).toBe('error');
      expect(engine.getState().stage).toBe('error');
      expect(engine.getState().errorMessage).toContain('401 Unauthorized');
      expect(errorEventReceived).toBeDefined();
      expect(errorEventReceived.message).toContain('401 Unauthorized');
    });

    it('3.7: listener error isolation: malfunctioning subscriber does not break pipeline execution', async () => {
      const client = new AdversarialWorkflowClient();
      const engine = new WorkflowEngine({ client, maxDebateRounds: 1 });

      // Bad subscriber throwing unhandled error
      engine.on('stage_change', () => {
        throw new Error('Bug in UI component listener');
      });

      engine.on('debate_turn', () => {
        throw new Error('Bug in debate listener');
      });

      // Engine must successfully complete without crashing
      const finalState = await engine.execute('Subscriber Resilience Test');
      expect(finalState.status).toBe('completed');
    });
  });
});
