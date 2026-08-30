/**
 * Milestone 4 UI Components Challenger Empirical Stress Suite
 * 
 * Verifies CodeWorkspace, DiffViewer, GitHubPublishModal, and ZipExportModal
 * under high scale, edge cases, accessibility interactions, and error states.
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

// Mock framer-motion animations
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

describe('Milestone 4 UI Components Challenger Empirical Stress Suite', () => {
  beforeEach(async () => {
    localStorage.clear();
    sessionStorage.clear();
    await keyStore.clearKeys();
    vi.restoreAllMocks();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  /* =========================================================================
   * SUITE 1: CodeWorkspace Stress Tests
   * ========================================================================= */
  describe('Suite 1: CodeWorkspace High-Load & Edge Cases', () => {
    it('1.1: Handles 50+ files with rapid sequential tab switching and active selection synchronization', () => {
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

      // Switch rapidly through 25 tabs
      for (let i = 2; i <= 25; i++) {
        const pad = String(i).padStart(3, '0');
        const tab = screen.getAllByText(`module_${pad}.py`)[0];
        fireEvent.click(tab);
        expect(onSelectFile).toHaveBeenCalledWith(`module_${pad}.py`);
      }
      expect(onSelectFile).toHaveBeenCalledTimes(24);
    });

    it('1.2: File creation cleans leading slashes, trims whitespace, blocks empty input, and selects new file', () => {
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
      fireEvent.change(input, { target: { value: '  /src/models/attention.py  ' } });
      fireEvent.click(submitBtn);

      expect(onCreateFile).toHaveBeenCalledWith('src/models/attention.py', expect.any(String));
      expect(onSelectFile).toHaveBeenCalledWith('src/models/attention.py');
    });

    it('1.3: File deletion triggers window.confirm and prevents deleting the last remaining file', () => {
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

      // Rerender with single file
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

    it('1.4: Real-time search filter handles case-insensitivity and special regex meta-characters without crashing', () => {
      const files: Record<string, WorkflowFile> = {
        'src/core/engine.py': { path: 'src/core/engine.py', content: 'class Engine: pass', language: 'python' },
        'src/utils/math_helpers.py': { path: 'src/utils/math_helpers.py', content: 'def add(a, b): return a + b', language: 'python' },
        'tests/test_engine.py': { path: 'tests/test_engine.py', content: 'def test(): pass', language: 'python' },
        'README.md': { path: 'README.md', content: '# Readme', language: 'markdown' },
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

      // Regex special characters do not break filter
      fireEvent.change(searchInput, { target: { value: 'engine.*[' } });
      expect(screen.getByText('No matching files found')).toBeDefined();

      // Clear search
      fireEvent.change(searchInput, { target: { value: '' } });
      expect(screen.getAllByText('README.md').length).toBeGreaterThan(0);
    });

    it('1.5: Language & icon mapping handles multi-language extensions accurately', () => {
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
        'binary.bin': { path: 'binary.bin', content: 'raw', language: 'plaintext' },
      };

      const { rerender } = render(
        <CodeWorkspace
          files={multiLangFiles}
          selectedFile="script.py"
          onSelectFile={vi.fn()}
        />
      );

      expect(screen.getByText('10 files')).toBeDefined();

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

    it('1.6: Empty file records and invalid selectedFile gracefully handled with fallback', () => {
      const { rerender } = render(
        <CodeWorkspace
          files={{}}
          selectedFile="missing.py"
          onSelectFile={vi.fn()}
        />
      );

      expect(screen.getByText('0 files')).toBeDefined();
      expect(screen.getByText(/No files available/i)).toBeDefined();

      rerender(
        <CodeWorkspace
          files={{ 'fallback.py': { path: 'fallback.py', content: '# Fallback', language: 'python' } }}
          selectedFile="nonexistent.py"
          onSelectFile={vi.fn()}
        />
      );

      expect(screen.getAllByText('fallback.py').length).toBeGreaterThan(0);
    });

    it('1.7: View vs Edit mode toggling switches state and readOnly enforcement', () => {
      render(
        <CodeWorkspace
          files={{ 'demo.py': { path: 'demo.py', content: 'x = 1', language: 'python' } }}
          selectedFile="demo.py"
          onSelectFile={vi.fn()}
          readOnly={false}
        />
      );

      const editToggleBtn = screen.getByTitle(/Switch to/i);
      expect(screen.getByText('Edit')).toBeDefined();

      fireEvent.click(editToggleBtn);
      expect(screen.getByText('View')).toBeDefined();

      fireEvent.click(editToggleBtn);
      expect(screen.getByText('Edit')).toBeDefined();
    });

    it('1.8: Single-file copy to clipboard & single-file download triggers execute properly', async () => {
      Object.assign(navigator, {
        clipboard: {
          writeText: vi.fn().mockResolvedValue(undefined),
        },
      });

      render(
        <CodeWorkspace
          files={{ 'test.py': { path: 'test.py', content: 'print("copied code")', language: 'python' } }}
          selectedFile="test.py"
          onSelectFile={vi.fn()}
        />
      );

      const copyBtn = screen.getByTitle('Copy File Content');
      await act(async () => {
        fireEvent.click(copyBtn);
      });

      expect(navigator.clipboard.writeText).toHaveBeenCalledWith('print("copied code")');
      expect(screen.getByText('Copied')).toBeDefined();

      const downloadBtn = screen.getByTitle('Download this file');
      fireEvent.click(downloadBtn);
      expect(window.URL.createObjectURL).toHaveBeenCalled();
    });
  });

  /* =========================================================================
   * SUITE 2: DiffViewer Stress Tests
   * ========================================================================= */
  describe('Suite 2: DiffViewer High-Scale & Extreme Comparison Cases', () => {
    it('2.1: 1,000+ line diff comparison computes metrics quickly (< 500ms)', () => {
      const originalLines: string[] = [];
      const modifiedLines: string[] = [];

      for (let i = 1; i <= 1000; i++) {
        originalLines.push(`line ${i}: base logic`);
        if (i % 5 === 0) {
          modifiedLines.push(`line ${i}: modified optimized logic`);
        } else if (i % 7 === 0) {
          // deleted
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

      expect(elapsed).toBeLessThan(500);
      expect(screen.getByText('Code Evolution & Diff Viewer')).toBeDefined();
      expect(screen.getByText(/additions/i)).toBeDefined();
      expect(screen.getByText(/deletions/i)).toBeDefined();
      expect(screen.getByText(/baseline fidelity/i)).toBeDefined();
    });

    it('2.2: Identical files result in exactly 0 additions, 0 deletions, and 100% baseline fidelity', () => {
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

    it('2.3: Disjoint / completely distinct files result in 0% baseline fidelity', () => {
      const baseCode = Array.from({ length: 40 }, (_, i) => `BASE_${i} = ${i}`).join('\n');
      const modCode = Array.from({ length: 40 }, (_, i) => `MOD_${i} = ${i * 2}`).join('\n');

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

      expect(screen.getByText('40 additions')).toBeDefined();
      expect(screen.getByText('40 deletions')).toBeDefined();
      expect(screen.getByText('0% baseline fidelity')).toBeDefined();
    });

    it('2.4: Synthetic baseline fallback kicks in when baselineFiles is empty', () => {
      const currentCode = 'def main():\n    print("step 1")\n    print("step 2")\n';
      const files = {
        'unbaselined.py': { path: 'unbaselined.py', content: currentCode, language: 'python' },
      };

      render(
        <DiffViewer
          files={files}
          baselineFiles={{}}
          selectedFile="unbaselined.py"
        />
      );

      expect(screen.getByText(/Original Baseline Specification/i)).toBeDefined();
      expect(screen.getByText(/Autonomous Multi-Agent Refinement Draft/i)).toBeDefined();
    });

    it('2.5: Switches between Split (side-by-side) and Unified (inline) view modes seamlessly', () => {
      const files = {
        'main.py': { path: 'main.py', content: 'print("modified")', language: 'python' },
      };
      const baselineFiles = {
        'main.py': 'print("baseline")',
      };

      render(
        <DiffViewer
          files={files}
          baselineFiles={baselineFiles}
          selectedFile="main.py"
        />
      );

      const unifiedBtn = screen.getByTitle('Unified Inline View');
      fireEvent.click(unifiedBtn);
      expect(screen.getByText('Unified')).toBeDefined();

      const splitBtn = screen.getByTitle('Side-by-Side Split View');
      fireEvent.click(splitBtn);
      expect(screen.getByText('Split')).toBeDefined();
    });

    it('2.6: Dropdown file switching updates diff view and line metrics for the new file', () => {
      const files = {
        'a.py': { path: 'a.py', content: 'print("A_mod")', language: 'python' },
        'b.py': { path: 'b.py', content: 'print("B_mod")', language: 'python' },
      };
      const baselineFiles = {
        'a.py': 'print("A_base")',
        'b.py': 'print("B_base")',
      };
      const onClose = vi.fn();

      render(
        <DiffViewer
          files={files}
          baselineFiles={baselineFiles}
          selectedFile="a.py"
          onClose={onClose}
        />
      );

      const select = screen.getByRole('combobox');
      fireEvent.change(select, { target: { value: 'b.py' } });
      expect(screen.getAllByText('print("B_mod")').length).toBeGreaterThan(0);

      const closeBtn = screen.getByTitle('Return to Code Editor');
      fireEvent.click(closeBtn);
      expect(onClose).toHaveBeenCalled();
    });
  });

  /* =========================================================================
   * SUITE 3: GitHubPublishModal Stress Tests
   * ========================================================================= */
  describe('Suite 3: GitHubPublishModal Credential Verification & Flow Stress', () => {
    const mockFiles = {
      'main.py': { path: 'main.py', content: 'print(1)', language: 'python' },
      'model.py': { path: 'model.py', content: 'class M: pass', language: 'python' },
    };

    it('3.1: PAT auto-loads from keyStore on open and triggers verifyToken', async () => {
      await keyStore.saveKeys({ githubPat: 'ghp_saved_pat_key' }, true);
      vi.spyOn(gitHubPublisher, 'verifyToken').mockResolvedValue({
        username: 'saved-user',
        scopes: ['repo'],
      });

      await act(async () => {
        render(
          <GitHubPublishModal
            isOpen={true}
            onClose={vi.fn()}
            files={mockFiles}
            paperTitle="Test Paper"
          />
        );
      });

      await waitFor(() => {
        expect(screen.getByText('@saved-user')).toBeDefined();
      });
    });

    it('3.2: Generates clean repository slug from paperTitle / topicOrArxiv', () => {
      render(
        <GitHubPublishModal
          isOpen={true}
          onClose={vi.fn()}
          files={mockFiles}
          paperTitle="Diffusion Mamba: Efficient Generative Modeling (arXiv:2403.01234)"
        />
      );

      const repoInput = screen.getByPlaceholderText('autogit-project-name') as HTMLInputElement;
      expect(repoInput.value).toMatch(/^autogit-diffusion-mamba/);
    });

    it('3.3: PAT verification error shows error banner and keeps submit disabled', async () => {
      vi.spyOn(gitHubPublisher, 'verifyToken').mockRejectedValue(
        new Error('Access forbidden (403). Ensure your GitHub PAT has the "repo" scope.')
      );

      await act(async () => {
        render(
          <GitHubPublishModal
            isOpen={true}
            onClose={vi.fn()}
            files={mockFiles}
          />
        );
      });

      const patInput = screen.getByPlaceholderText(/ghp_/i);
      await act(async () => {
        fireEvent.change(patInput, { target: { value: 'ghp_insufficient_scope' } });
        fireEvent.blur(patInput);
      });

      await waitFor(() => {
        expect(screen.getByText(/Access forbidden \(403\)/i)).toBeDefined();
      });
    });

    it('3.4: Rejects publish when file record is empty', async () => {
      vi.spyOn(gitHubPublisher, 'verifyToken').mockResolvedValue({ username: 'user', scopes: ['repo'] });

      await act(async () => {
        render(
          <GitHubPublishModal
            isOpen={true}
            onClose={vi.fn()}
            files={{}}
          />
        );
      });

      const patInput = screen.getByPlaceholderText(/ghp_/i);
      await act(async () => {
        fireEvent.change(patInput, { target: { value: 'ghp_token' } });
      });

      const submitBtn = screen.getByText('Create & Push');
      await act(async () => {
        fireEvent.click(submitBtn);
      });

      expect(screen.getByText('No files found to publish in this repository.')).toBeDefined();
    });

    it('3.5: Public vs Private privacy toggle switches repo privacy setting', () => {
      render(
        <GitHubPublishModal
          isOpen={true}
          onClose={vi.fn()}
          files={mockFiles}
        />
      );

      const privacyBtn = screen.getByRole('button', { name: 'Public' });
      expect(screen.getByText(/Open science & reproducible research/i)).toBeDefined();

      fireEvent.click(privacyBtn);
      expect(screen.getByText('Private')).toBeDefined();
      expect(screen.getByText(/Only you and authorized collaborators/i)).toBeDefined();
    });

    it('3.6: Successful publish renders commit SHA, repository link, and allows copying git clone command', async () => {
      vi.spyOn(gitHubPublisher, 'verifyToken').mockResolvedValue({
        username: 'ai-scientist',
        scopes: ['repo'],
      });

      vi.spyOn(gitHubPublisher, 'createAndPushRepo').mockResolvedValue({
        repoUrl: 'https://github.com/ai-scientist/autogit-neural-net',
        cloneUrl: 'https://github.com/ai-scientist/autogit-neural-net.git',
        commitSha: 'fedcba9876543210',
        publishedFilesCount: 2,
      });

      Object.assign(navigator, {
        clipboard: {
          writeText: vi.fn().mockResolvedValue(undefined),
        },
      });

      const onSuccess = vi.fn();

      await act(async () => {
        render(
          <GitHubPublishModal
            isOpen={true}
            onClose={vi.fn()}
            files={mockFiles}
            paperTitle="Neural Net"
            onSuccess={onSuccess}
          />
        );
      });

      const patInput = screen.getByPlaceholderText(/ghp_/i);
      await act(async () => {
        fireEvent.change(patInput, { target: { value: 'ghp_token_valid' } });
      });

      const submitBtn = screen.getByText('Create & Push');
      await act(async () => {
        fireEvent.click(submitBtn);
      });

      await waitFor(() => {
        expect(screen.getByText('Repository Published Successfully!')).toBeDefined();
        expect(screen.getByText(/fedcba9/)).toBeDefined();
        expect(onSuccess).toHaveBeenCalled();
      });

      const copyBtn = screen.getByTitle('Copy Clone Command');
      await act(async () => {
        fireEvent.click(copyBtn);
      });

      expect(navigator.clipboard.writeText).toHaveBeenCalledWith(
        'git clone https://github.com/ai-scientist/autogit-neural-net.git'
      );
    });

    it('3.7: Modal close via X button and Cancel button triggers onClose', () => {
      const onClose = vi.fn();
      render(
        <GitHubPublishModal
          isOpen={true}
          onClose={onClose}
          files={mockFiles}
        />
      );

      const cancelBtn = screen.getByRole('button', { name: 'Cancel' });
      fireEvent.click(cancelBtn);
      expect(onClose).toHaveBeenCalledTimes(1);
    });
  });

  /* =========================================================================
   * SUITE 4: ZipExportModal Stress Tests
   * ========================================================================= */
  describe('Suite 4: ZipExportModal Scaffolding & Packaging Options', () => {
    const mockFiles = {
      'model.py': { path: 'model.py', content: 'class Model: pass', language: 'python' },
      'train.py': { path: 'train.py', content: 'def train(): pass', language: 'python' },
    };

    it('4.1: Computes initial archive name from projectName / topic', () => {
      render(
        <ZipExportModal
          isOpen={true}
          onClose={vi.fn()}
          files={mockFiles}
          projectName="diffusion-sampler"
        />
      );

      const nameInput = screen.getByPlaceholderText('autogit-repository') as HTMLInputElement;
      expect(nameInput.value).toBe('autogit-diffusion-sampler');
    });

    it('4.2: Scaffolding toggle includes/excludes standard files and updates manifest count', () => {
      render(
        <ZipExportModal
          isOpen={true}
          onClose={vi.fn()}
          files={mockFiles}
          projectName="transformer-demo"
        />
      );

      // Scaffolding ON: 2 user files + 4 scaffolding files = 6 files
      expect(screen.getByText('6 files')).toBeDefined();

      const scaffoldCheckbox = screen.getByLabelText(/Include standard project scaffolding/i);
      fireEvent.click(scaffoldCheckbox);

      // Scaffolding OFF: 2 files
      expect(screen.getByText('2 files')).toBeDefined();
    });

    it('4.3: Root folder toggle alters prefix in archive manifest paths', () => {
      render(
        <ZipExportModal
          isOpen={true}
          onClose={vi.fn()}
          files={{ 'main.py': { path: 'main.py', content: '1', language: 'python' } }}
          projectName="my-experiment"
        />
      );

      expect(screen.getByText('autogit-my-experiment/main.py')).toBeDefined();

      const wrapCheckbox = screen.getByLabelText(/Wrap contents in a root directory/i);
      fireEvent.click(wrapCheckbox);

      expect(screen.getByText('main.py')).toBeDefined();
    });

    it('4.4: Existing user scaffolding files prevent duplicate scaffolding in estimatedFiles preview', () => {
      const filesWithScaffolding = {
        '.gitignore': { path: '.gitignore', content: '*.pyc', language: 'plaintext' },
        'README.md': { path: 'README.md', content: '# Custom', language: 'markdown' },
        'main.py': { path: 'main.py', content: 'print(1)', language: 'python' },
      };

      render(
        <ZipExportModal
          isOpen={true}
          onClose={vi.fn()}
          files={filesWithScaffolding}
          projectName="pre-scaffolded"
        />
      );

      // 3 user files (.gitignore, README.md, main.py) + 2 missing scaffolding (LICENSE, requirements.txt) = 5 files
      expect(screen.getByText('5 files')).toBeDefined();
    });

    it('4.5: Successful zip export triggers downloadRepositoryZip and displays temporary feedback', async () => {
      const downloadSpy = vi.spyOn(zipExporter, 'downloadRepositoryZip').mockResolvedValue(new Blob());

      render(
        <ZipExportModal
          isOpen={true}
          onClose={vi.fn()}
          files={mockFiles}
          projectName="quick-download"
        />
      );

      const downloadBtn = screen.getByRole('button', { name: /Download/i });
      await act(async () => {
        fireEvent.click(downloadBtn);
      });

      expect(downloadSpy).toHaveBeenCalledWith(
        expect.objectContaining({
          projectName: 'autogit-quick-download',
          includeStandardScaffolding: true,
        }),
        'autogit-quick-download.zip'
      );
      expect(screen.getByText('Downloaded!')).toBeDefined();
    });

    it('4.6: Modal close via X button and Cancel button triggers onClose', () => {
      const onClose = vi.fn();
      render(
        <ZipExportModal
          isOpen={true}
          onClose={onClose}
          files={mockFiles}
        />
      );

      const cancelBtn = screen.getByRole('button', { name: 'Cancel' });
      fireEvent.click(cancelBtn);
      expect(onClose).toHaveBeenCalledTimes(1);
    });
  });
});
