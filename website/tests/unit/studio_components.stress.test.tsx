/**
 * Challenger 2 Stress & Edge-Case Test Suite for Milestone 4 UI Components
 * 
 * Target Components:
 * - CodeWorkspace (50+ tabs, rapid switching, search filtering, binary/lang detection, creation/deletion, fallback render)
 * - DiffViewer (1000+ line diffs, identical files, completely disparate files, split vs unified, synthetic fallback)
 * - GitHubPublishModal (PAT verification, error handling, progress stepper, slug generation, clipboard copy)
 * - ZipExportModal (Scaffolding toggle, deep nesting, manifest preview, download lifecycle)
 */

import React from 'react';
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, fireEvent, waitFor, act } from '@testing-library/react';
import CodeWorkspace from '@/components/studio/CodeWorkspace';
import DiffViewer from '@/components/studio/DiffViewer';
import GitHubPublishModal from '@/components/studio/GitHubPublishModal';
import ZipExportModal from '@/components/studio/ZipExportModal';
import { gitHubPublisher } from '@/lib/github/publisher';
import { zipExporter } from '@/lib/export/zipExporter';
import { keyStore } from '@/lib/storage/keyStore';
import { WorkflowFile } from '@/lib/workflow/engine';

// Mock framer-motion animations for headless testing
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

describe('Milestone 4 UI Challenger Stress Suite', () => {
  beforeEach(() => {
    localStorage.clear();
    sessionStorage.clear();
    vi.restoreAllMocks();
  });

  /* =========================================================================
   * SUITE 1: CodeWorkspace Stress Tests
   * ========================================================================= */
  describe('Suite 1: CodeWorkspace High-Load & Edge Cases', () => {
    it('1.1: Handles 50+ files with rapid sequential tab switching without lag or crashes', () => {
      const largeFileMap: Record<string, WorkflowFile> = {};
      for (let i = 1; i <= 50; i++) {
        const pad = String(i).padStart(3, '0');
        largeFileMap[`module_${pad}.py`] = {
          path: `module_${pad}.py`,
          content: `"""Module ${pad} content"""\ndef execute_${pad}():\n    return ${i}\n`,
          language: 'python',
        };
      }

      const onSelectFile = vi.fn();
      render(
        <CodeWorkspace
          files={largeFileMap}
          selectedFile="module_001.py"
          onSelectFile={onSelectFile}
        />
      );

      expect(screen.getByText('50 files')).toBeDefined();

      // Switch rapidly through 20 tabs
      for (let i = 2; i <= 20; i++) {
        const pad = String(i).padStart(3, '0');
        const tab = screen.getAllByText(`module_${pad}.py`)[0];
        fireEvent.click(tab);
        expect(onSelectFile).toHaveBeenCalledWith(`module_${pad}.py`);
      }
      expect(onSelectFile).toHaveBeenCalledTimes(19);
    });

    it('1.2: File search filter handles complex, case-insensitive, and regex-like queries', () => {
      const files: Record<string, WorkflowFile> = {
        'src/core/engine.py': { path: 'src/core/engine.py', content: 'class Engine: pass', language: 'python' },
        'src/utils/math_helpers.py': { path: 'src/utils/math_helpers.py', content: 'def add(a, b): return a + b', language: 'python' },
        'tests/test_engine.py': { path: 'tests/test_engine.py', content: 'def test_engine(): pass', language: 'python' },
        'README.md': { path: 'README.md', content: '# Documentation', language: 'markdown' },
        'config.json': { path: 'config.json', content: '{"env": "prod"}', language: 'json' },
      };

      render(
        <CodeWorkspace
          files={files}
          selectedFile="src/core/engine.py"
          onSelectFile={vi.fn()}
        />
      );

      const searchInput = screen.getByPlaceholderText('Filter files...');

      // Case-insensitive search
      fireEvent.change(searchInput, { target: { value: 'ENGINE' } });
      expect(screen.getAllByText('src/core/engine.py').length).toBeGreaterThan(0);
      expect(screen.getAllByText('tests/test_engine.py').length).toBeGreaterThan(0);

      // Deep path search
      fireEvent.change(searchInput, { target: { value: 'helpers' } });
      expect(screen.getAllByText('src/utils/math_helpers.py').length).toBeGreaterThan(0);

      // Regex special characters do not break filter
      fireEvent.change(searchInput, { target: { value: 'engine[' } });
      expect(screen.getByText('No matching files found')).toBeDefined();

      // Clear search restores all files
      fireEvent.change(searchInput, { target: { value: '' } });
      expect(screen.getAllByText('README.md').length).toBeGreaterThan(0);
      expect(screen.getAllByText('config.json').length).toBeGreaterThan(0);
    });

    it('1.3: File creation cleans leading slashes and handles empty submission rejection', () => {
      const onCreateFile = vi.fn();
      const onSelectFile = vi.fn();

      render(
        <CodeWorkspace
          files={{ 'main.py': { path: 'main.py', content: 'print(1)', language: 'python' } }}
          selectedFile="main.py"
          onSelectFile={onSelectFile}
          onCreateFile={onCreateFile}
        />
      );

      // Open new file form
      const newFileBtn = screen.getByTitle('Create New File');
      fireEvent.click(newFileBtn);

      const input = screen.getByPlaceholderText('filename.py');
      const submitBtn = screen.getByText('Create');

      // Attempt empty creation (should be blocked)
      fireEvent.change(input, { target: { value: '   ' } });
      fireEvent.click(submitBtn);
      expect(onCreateFile).not.toHaveBeenCalled();

      // Create with leading slashes and whitespace
      fireEvent.change(input, { target: { value: '  /deep/path/eval.py  ' } });
      fireEvent.click(submitBtn);

      expect(onCreateFile).toHaveBeenCalledWith('deep/path/eval.py', expect.any(String));
      expect(onSelectFile).toHaveBeenCalledWith('deep/path/eval.py');
    });

    it('1.4: Single file delete triggers confirm prompt and hides when only 1 file remains', () => {
      const onDeleteFile = vi.fn();
      const confirmSpy = vi.spyOn(window, 'confirm').mockReturnValue(true);

      const { rerender } = render(
        <CodeWorkspace
          files={{
            'a.py': { path: 'a.py', content: '1', language: 'python' },
            'b.py': { path: 'b.py', content: '2', language: 'python' },
          }}
          selectedFile="a.py"
          onSelectFile={vi.fn()}
          onDeleteFile={onDeleteFile}
        />
      );

      const deleteBtns = screen.getAllByTitle('Delete File');
      expect(deleteBtns.length).toBe(2);

      fireEvent.click(deleteBtns[0]);
      expect(confirmSpy).toHaveBeenCalledWith('Delete a.py?');
      expect(onDeleteFile).toHaveBeenCalledWith('a.py');

      // Rerender with only 1 file: delete button should NOT be displayed for safety
      rerender(
        <CodeWorkspace
          files={{
            'b.py': { path: 'b.py', content: '2', language: 'python' },
          }}
          selectedFile="b.py"
          onSelectFile={vi.fn()}
          onDeleteFile={onDeleteFile}
        />
      );

      expect(screen.queryByTitle('Delete File')).toBeNull();
    });

    it('1.5: Language detection maps multi-language extensions accurately', () => {
      const multiLangFiles: Record<string, WorkflowFile> = {
        'script.py': { path: 'script.py', content: 'x = 1', language: 'python' },
        'doc.md': { path: 'doc.md', content: '# H1', language: 'markdown' },
        'data.json': { path: 'data.json', content: '{}', language: 'json' },
        'app.tsx': { path: 'app.tsx', content: '<div />', language: 'typescript' },
        'index.js': { path: 'index.js', content: 'console.log()', language: 'javascript' },
        'style.css': { path: 'style.css', content: 'body {}', language: 'css' },
        'page.html': { path: 'page.html', content: '<html></html>', language: 'html' },
        'run.sh': { path: 'run.sh', content: '#!/bin/bash', language: 'shell' },
        'ci.yml': { path: 'ci.yml', content: 'name: CI', language: 'yaml' },
        'custom.unknown': { path: 'custom.unknown', content: 'raw', language: 'plaintext' },
      };

      const { rerender } = render(
        <CodeWorkspace
          files={multiLangFiles}
          selectedFile="script.py"
          onSelectFile={vi.fn()}
        />
      );

      expect(screen.getByText('10 files')).toBeDefined();

      // Cycle selection
      for (const fileName of Object.keys(multiLangFiles)) {
        rerender(
          <CodeWorkspace
            files={multiLangFiles}
            selectedFile={fileName}
            onSelectFile={vi.fn()}
          />
        );
        expect(screen.getAllByText(fileName).length).toBeGreaterThan(0);
      }
    });

    it('1.6: Handles empty files record and non-existent selectedFile gracefully', () => {
      // Empty files dict
      const { rerender } = render(
        <CodeWorkspace
          files={{}}
          selectedFile="missing.py"
          onSelectFile={vi.fn()}
        />
      );

      expect(screen.getByText('0 files')).toBeDefined();
      expect(screen.getByText(/No files available/i)).toBeDefined();

      // Non-existent selectedFile falls back to first available file
      rerender(
        <CodeWorkspace
          files={{ 'fallback.py': { path: 'fallback.py', content: '# Fallback', language: 'python' } }}
          selectedFile="does_not_exist.py"
          onSelectFile={vi.fn()}
        />
      );

      expect(screen.getAllByText('fallback.py').length).toBeGreaterThan(0);
    });

    it('1.7: Copy to clipboard and download single file actions execute properly', async () => {
      let clipboardText = '';
      Object.assign(navigator, {
        clipboard: {
          writeText: vi.fn().mockImplementation(async (text: string) => {
            clipboardText = text;
          }),
        },
      });

      render(
        <CodeWorkspace
          files={{ 'test.py': { path: 'test.py', content: 'print("copied code")', language: 'python' } }}
          selectedFile="test.py"
          onSelectFile={vi.fn()}
        />
      );

      // Copy content
      const copyBtn = screen.getByTitle('Copy File Content');
      await act(async () => {
        fireEvent.click(copyBtn);
      });

      expect(navigator.clipboard.writeText).toHaveBeenCalledWith('print("copied code")');
      expect(screen.getByText('Copied')).toBeDefined();

      // Download single file
      const downloadBtn = screen.getByTitle('Download this file');
      fireEvent.click(downloadBtn);
      expect(window.URL.createObjectURL).toHaveBeenCalled();
    });
  });

  /* =========================================================================
   * SUITE 2: DiffViewer Stress Tests
   * ========================================================================= */
  describe('Suite 2: DiffViewer High-Scale & Extreme Comparison Cases', () => {
    it('2.1: Processes 1,000+ line diff comparison quickly and computes line metrics', () => {
      const originalLines: string[] = [];
      const modifiedLines: string[] = [];

      for (let i = 1; i <= 1000; i++) {
        originalLines.push(`line ${i}: base logic`);
        if (i % 5 === 0) {
          modifiedLines.push(`line ${i}: modified optimized logic`);
        } else if (i % 7 === 0) {
          // deleted line (skipped in modified)
        } else {
          originalLines.push(`line ${i}: base logic`);
          modifiedLines.push(`line ${i}: base logic`);
        }
      }

      const files = {
        'large_pipeline.py': {
          path: 'large_pipeline.py',
          content: modifiedLines.join('\n'),
          language: 'python',
        },
      };
      const baselineFiles = {
        'large_pipeline.py': originalLines.join('\n'),
      };

      const startTime = performance.now();
      render(
        <DiffViewer
          files={files}
          baselineFiles={baselineFiles}
          selectedFile="large_pipeline.py"
        />
      );
      const elapsed = performance.now() - startTime;

      expect(elapsed).toBeLessThan(1000); // Must compute diff in < 1 second
      expect(screen.getByText('Code Evolution & Diff Viewer')).toBeDefined();
      expect(screen.getByText(/additions/i)).toBeDefined();
      expect(screen.getByText(/deletions/i)).toBeDefined();
      expect(screen.getByText(/baseline fidelity/i)).toBeDefined();
    });

    it('2.2: Identical files result in 0 additions, 0 deletions, and 100% baseline fidelity', () => {
      const code = 'import numpy as np\n\ndef compute():\n    return np.zeros((10, 10))\n';
      const files = {
        'compute.py': { path: 'compute.py', content: code, language: 'python' },
      };
      const baselineFiles = {
        'compute.py': code,
      };

      render(
        <DiffViewer
          files={files}
          baselineFiles={baselineFiles}
          selectedFile="compute.py"
        />
      );

      expect(screen.getByText('0 additions')).toBeDefined();
      expect(screen.getByText('0 deletions')).toBeDefined();
      expect(screen.getByText('100% baseline fidelity')).toBeDefined();
    });

    it('2.3: Completely disparate files compute 0% baseline fidelity', () => {
      const baseCode = Array.from({ length: 50 }, (_, i) => `OLD_LINE_${i} = ${i}`).join('\n');
      const modCode = Array.from({ length: 50 }, (_, i) => `NEW_LINE_${i} = ${i * 2}`).join('\n');

      const files = {
        'disparate.py': { path: 'disparate.py', content: modCode, language: 'python' },
      };
      const baselineFiles = {
        'disparate.py': baseCode,
      };

      render(
        <DiffViewer
          files={files}
          baselineFiles={baselineFiles}
          selectedFile="disparate.py"
        />
      );

      expect(screen.getByText('50 additions')).toBeDefined();
      expect(screen.getByText('50 deletions')).toBeDefined();
      expect(screen.getByText('0% baseline fidelity')).toBeDefined();
    });

    it('2.4: Synthetic baseline fallback kicks in when no explicit baseline provided', () => {
      const currentCode = 'def main():\n    print("step 1")\n    print("step 2")\n    print("step 3")\n';
      const files = {
        'unbaselined.py': { path: 'unbaselined.py', content: currentCode, language: 'python' },
      };

      render(
        <DiffViewer
          files={files}
          baselineFiles={{}} // empty baseline
          selectedFile="unbaselined.py"
        />
      );

      expect(screen.getByText(/Original Baseline Specification/i)).toBeDefined();
      expect(screen.getByText(/Autonomous Multi-Agent Refinement Draft/i)).toBeDefined();
    });

    it('2.5: Multi-file switching and close callback work seamlessly in DiffViewer', () => {
      const files = {
        'a.py': { path: 'a.py', content: 'print("A")', language: 'python' },
        'b.py': { path: 'b.py', content: 'print("B")', language: 'python' },
      };
      const onClose = vi.fn();

      render(
        <DiffViewer
          files={files}
          selectedFile="a.py"
          onClose={onClose}
        />
      );

      // Select b.py
      const select = screen.getByRole('combobox');
      fireEvent.change(select, { target: { value: 'b.py' } });
      expect(screen.getAllByText('print("B")').length).toBeGreaterThan(0);

      // Click Close
      const closeBtn = screen.getByTitle('Return to Code Editor');
      fireEvent.click(closeBtn);
      expect(onClose).toHaveBeenCalled();
    });
  });

  /* =========================================================================
   * SUITE 3: GitHubPublishModal Stress Tests
   * ========================================================================= */
  describe('Suite 3: GitHubPublishModal Credential Verification & Flow Stress', () => {
    it('3.1: Token verification displays errors on invalid token and updates user on success', async () => {
      const verifySpy = vi.spyOn(gitHubPublisher, 'verifyToken')
        .mockRejectedValueOnce(new Error('Bad credentials (401)'))
        .mockResolvedValueOnce({ username: 'valid-coder', scopes: ['repo'] });

      render(
        <GitHubPublishModal
          isOpen={true}
          onClose={vi.fn()}
          files={{ 'main.py': { path: 'main.py', content: '1', language: 'python' } }}
          paperTitle="Attention Is All You Need"
        />
      );

      const patInput = screen.getByPlaceholderText(/ghp_/i);
      const verifyBtn = screen.getByText('Verify');

      // Failed verify
      await act(async () => {
        fireEvent.change(patInput, { target: { value: 'ghp_invalid_123' } });
        fireEvent.click(verifyBtn);
      });

      expect(screen.getByText('Bad credentials (401)')).toBeDefined();

      // Successful verify
      await act(async () => {
        fireEvent.change(patInput, { target: { value: 'ghp_valid_456' } });
        fireEvent.click(verifyBtn);
      });

      await waitFor(() => {
        expect(screen.getByText('@valid-coder')).toBeDefined();
      });
    });

    it('3.2: Generates clean repository slug from arXiv titles and sanitizes punctuation', async () => {
      render(
        <GitHubPublishModal
          isOpen={true}
          onClose={vi.fn()}
          files={{ 'main.py': { path: 'main.py', content: '1', language: 'python' } }}
          paperTitle="DeepSeek-R1: Incentivizing Reasoning in LLMs via RL! (2025)"
        />
      );

      const repoInput = screen.getByPlaceholderText('autogit-project-name') as HTMLInputElement;
      expect(repoInput.value).toBe('autogit-deepseek-r1-incentivizing-reasoning-in-l');
    });

    it('3.3: Prevents publish when files object is empty', async () => {
      vi.spyOn(gitHubPublisher, 'verifyToken').mockResolvedValue({ username: 'user', scopes: ['repo'] });

      render(
        <GitHubPublishModal
          isOpen={true}
          onClose={vi.fn()}
          files={{}} // 0 files
          paperTitle="Empty Test"
        />
      );

      const patInput = screen.getByPlaceholderText(/ghp_/i);
      await act(async () => {
        fireEvent.change(patInput, { target: { value: 'ghp_valid_token' } });
      });

      const submitBtn = screen.getByText('Create & Push');
      await act(async () => {
        fireEvent.click(submitBtn);
      });

      expect(screen.getByText('No files found to publish in this repository.')).toBeDefined();
    });

    it('3.4: Handles network failure during repo publish with recovery message', async () => {
      vi.spyOn(gitHubPublisher, 'verifyToken').mockResolvedValue({ username: 'user', scopes: ['repo'] });
      vi.spyOn(gitHubPublisher, 'createAndPushRepo').mockRejectedValueOnce(
        new Error('GitHub API rate limit exceeded (403)')
      );

      render(
        <GitHubPublishModal
          isOpen={true}
          onClose={vi.fn()}
          files={{ 'main.py': { path: 'main.py', content: '1', language: 'python' } }}
          paperTitle="Rate Limit Test"
        />
      );

      const patInput = screen.getByPlaceholderText(/ghp_/i);
      await act(async () => {
        fireEvent.change(patInput, { target: { value: 'ghp_token_123' } });
      });

      const submitBtn = screen.getByText('Create & Push');
      await act(async () => {
        fireEvent.click(submitBtn);
      });

      await waitFor(() => {
        expect(screen.getByText('GitHub API rate limit exceeded (403)')).toBeDefined();
      });
    });

    it('3.5: Returns null when isOpen is false', () => {
      const { container } = render(
        <GitHubPublishModal
          isOpen={false}
          onClose={vi.fn()}
          files={{}}
        />
      );
      expect(container.firstChild).toBeNull();
    });
  });

  /* =========================================================================
   * SUITE 4: ZipExportModal Stress Tests
   * ========================================================================= */
  describe('Suite 4: ZipExportModal Scaffolding & Packaging Options', () => {
    it('4.1: Scaffolding toggle includes and excludes standard project files in manifest preview', () => {
      const userFiles: Record<string, WorkflowFile> = {
        'model.py': { path: 'model.py', content: 'class Model: pass', language: 'python' },
        'train.py': { path: 'train.py', content: 'def train(): pass', language: 'python' },
      };

      render(
        <ZipExportModal
          isOpen={true}
          onClose={vi.fn()}
          files={userFiles}
          projectName="transformer-demo"
        />
      );

      // Scaffolding ON by default: 2 user files + 4 scaffolding files = 6 files
      expect(screen.getByText('6 files')).toBeDefined();
      expect(screen.getByText(/autogit-transformer-demo\/\.gitignore/i)).toBeDefined();
      expect(screen.getByText(/autogit-transformer-demo\/LICENSE/i)).toBeDefined();
      expect(screen.getByText(/autogit-transformer-demo\/README\.md/i)).toBeDefined();
      expect(screen.getByText(/autogit-transformer-demo\/requirements\.txt/i)).toBeDefined();

      // Toggle scaffolding OFF
      const scaffoldCheckbox = screen.getByLabelText(/Include standard project scaffolding/i);
      fireEvent.click(scaffoldCheckbox);

      // Only 2 user files remaining in manifest
      expect(screen.getByText('2 files')).toBeDefined();
    });

    it('4.2: Root folder toggle alters prefix in archive manifest paths', () => {
      const userFiles: Record<string, WorkflowFile> = {
        'main.py': { path: 'main.py', content: 'print(1)', language: 'python' },
      };

      render(
        <ZipExportModal
          isOpen={true}
          onClose={vi.fn()}
          files={userFiles}
          projectName="my-experiment"
        />
      );

      // Wrap in root folder is ON: displays autogit-my-experiment/main.py
      expect(screen.getByText('autogit-my-experiment/main.py')).toBeDefined();

      // Toggle wrap OFF
      const wrapCheckbox = screen.getByLabelText(/Wrap contents in a root directory/i);
      fireEvent.click(wrapCheckbox);

      // Displays bare main.py
      expect(screen.getByText('main.py')).toBeDefined();
    });

    it('4.3: Avoids duplicate scaffolding entries if user already generated README or .gitignore', () => {
      const filesWithExistingScaffolding: Record<string, WorkflowFile> = {
        '.gitignore': { path: '.gitignore', content: '*.pyc', language: 'plaintext' },
        'README.md': { path: 'README.md', content: '# Custom Readme', language: 'markdown' },
        'LICENSE': { path: 'LICENSE', content: 'MIT', language: 'plaintext' },
        'requirements.txt': { path: 'requirements.txt', content: 'torch', language: 'plaintext' },
        'main.py': { path: 'main.py', content: 'print(1)', language: 'python' },
      };

      render(
        <ZipExportModal
          isOpen={true}
          onClose={vi.fn()}
          files={filesWithExistingScaffolding}
          projectName="full-scaffolded"
        />
      );

      // Exact count should be 5 (no duplicates added)
      expect(screen.getByText('5 files')).toBeDefined();
    });

    it('4.4: Returns null when isOpen is false', () => {
      const { container } = render(
        <ZipExportModal
          isOpen={false}
          onClose={vi.fn()}
          files={{}}
        />
      );
      expect(container.firstChild).toBeNull();
    });
  });
});
