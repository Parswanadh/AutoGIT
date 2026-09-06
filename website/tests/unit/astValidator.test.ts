import { describe, it, expect } from 'vitest';
import { PythonAstValidator } from '@/lib/workflow/astValidator';

describe('PythonAstValidator Enhanced Metrics & Cross-File Verification', () => {
  describe('Single File Validation & Metrics', () => {
    it('accurately parses classes, functions, docstrings, and assertions', () => {
      const code = `
"""Module level docstring for testing."""
import math
from typing import List, Dict

class NeuralLayer:
    """Neural layer representation."""
    def __init__(self, in_features: int, out_features: int):
        assert in_features > 0, "in_features must be positive"
        assert out_features > 0, "out_features must be positive"
        self.in_features = in_features
        self.out_features = out_features

    def forward(self, x: List[float]) -> List[float]:
        """Forward pass computation."""
        return x

def calculate_loss(pred: List[float], target: List[float]) -> float:
    """Compute MSE loss."""
    assert len(pred) == len(target)
    return 0.0
`;
      const result = PythonAstValidator.validateFile(code, 'layer.py');

      expect(result.valid).toBe(true);
      expect(result.errors).toHaveLength(0);
      expect(result.metrics.classesCount).toBe(1);
      expect(result.metrics.functionsCount).toBe(3); // 2 methods (__init__, forward) + 1 standalone (calculate_loss)
      expect(result.metrics.assertionsCount).toBe(3);
      expect(result.metrics.docstringsCount).toBeGreaterThanOrEqual(3);
      expect(result.metrics.importedModules).toContain('math');
      expect(result.metrics.importedModules).toContain('typing');

      // Check importedSymbols extraction
      const typingImports = result.metrics.importedSymbols.filter((s) => s.module === 'typing');
      expect(typingImports.map((s) => s.symbol)).toContain('List');
      expect(typingImports.map((s) => s.symbol)).toContain('Dict');
    });

    it('detects incomplete stubs and flags them in metrics and warnings', () => {
      const code = `
def unfinished_worker():
    pass  # TODO: implement this
    raise NotImplementedError
`;
      const result = PythonAstValidator.validateFile(code, 'stub.py');
      expect(result.metrics.hasStubs).toBe(true);
      expect(result.warnings.some((w) => w.rule === 'no-stubs')).toBe(true);
    });
  });

  describe('Multi-File Cross-File Symbol Verification', () => {
    it('passes when imported symbols are properly defined in target module', () => {
      const files: Record<string, string> = {
        'utils.py': `
"""Utility helpers."""
def compute_norm(vec):
    """Compute vector norm."""
    return sum(x**2 for x in vec) ** 0.5

class MetricLogger:
    """Logs evaluation metrics."""
    pass
`,
        'model.py': `
from utils import compute_norm, MetricLogger

class Classifier:
    """Classifier model."""
    def __init__(self):
        self.logger = MetricLogger()

    def evaluate(self, x):
        return compute_norm(x)
`,
        'requirements.txt': 'numpy>=1.24.0\n',
      };

      const projectRes = PythonAstValidator.validateProject(files);
      expect(projectRes.crossFileErrors).toHaveLength(0);
      expect(projectRes.summary.totalClasses).toBe(2);
      expect(projectRes.summary.totalFunctions).toBe(3);
      expect(projectRes.summary.docstringCoverage).toBeGreaterThan(0);
    });

    it('emits cross-file errors when an imported symbol does not exist in target module', () => {
      const files: Record<string, string> = {
        'math_ops.py': `
def add(a, b):
    return a + b
`,
        'main.py': `
from math_ops import add, non_existent_function

def main():
    return add(1, 2)
`,
      };

      const projectRes = PythonAstValidator.validateProject(files);
      expect(projectRes.crossFileErrors.length).toBeGreaterThan(0);
      expect(projectRes.crossFileErrors[0]).toContain("Symbol 'non_existent_function' imported from 'math_ops' is not defined");
      expect(projectRes.allValid).toBe(false);
    });

    it('flags unnecessary stdlib packages in requirements.txt', () => {
      const files: Record<string, string> = {
        'main.py': `
import sys
import os

def run():
    print("running")
`,
        'requirements.txt': `
numpy>=1.20
os
sys
`,
      };

      const projectRes = PythonAstValidator.validateProject(files);
      expect(projectRes.unnecessaryStdlibInRequirements).toContain('os');
      expect(projectRes.unnecessaryStdlibInRequirements).toContain('sys');
      expect(projectRes.allValid).toBe(false);
    });
  });
});
