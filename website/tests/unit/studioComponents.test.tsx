import React from 'react';
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, fireEvent, waitFor, act } from '@testing-library/react';
import CodeWorkspace from '@/components/studio/CodeWorkspace';
import DiffViewer from '@/components/studio/DiffViewer';
import GitHubPublishModal from '@/components/studio/GitHubPublishModal';
import ZipExportModal from '@/components/studio/ZipExportModal';
import { gitHubPublisher } from '@/lib/github/publisher';
import { zipExporter } from '@/lib/export/zipExporter';

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

describe('CodeWorkspace Component', () => {
  const mockFiles = {
    'main.py': { path: 'main.py', content: 'import sys\nprint("Hello World")', language: 'python' },
    'model.py': { path: 'model.py', content: 'class Model: pass', language: 'python' },
    'README.md': { path: 'README.md', content: '# AutoGIT Demo', language: 'markdown' },
  };

  it('renders file tree and editor tabs correctly', () => {
    render(
      <CodeWorkspace
        files={mockFiles}
        selectedFile="main.py"
        onSelectFile={vi.fn()}
      />
    );

    expect(screen.getByText('Synthesized Code Studio')).toBeDefined();
    expect(screen.getByText('3 files')).toBeDefined();
    expect(screen.getAllByText('main.py').length).toBeGreaterThan(0);
    expect(screen.getAllByText('model.py').length).toBeGreaterThan(0);
    expect(screen.getAllByText('README.md').length).toBeGreaterThan(0);
  });

  it('invokes onSelectFile when file is clicked', () => {
    const onSelectFile = vi.fn();
    render(
      <CodeWorkspace
        files={mockFiles}
        selectedFile="main.py"
        onSelectFile={onSelectFile}
      />
    );

    const modelTab = screen.getAllByText('model.py')[0];
    fireEvent.click(modelTab);
    expect(onSelectFile).toHaveBeenCalledWith('model.py');
  });

  it('handles file filtering search', () => {
    render(
      <CodeWorkspace
        files={mockFiles}
        selectedFile="main.py"
        onSelectFile={vi.fn()}
      />
    );

    const searchInput = screen.getByPlaceholderText('Filter files...');
    fireEvent.change(searchInput, { target: { value: 'README' } });

    expect(screen.getAllByText('README.md').length).toBeGreaterThan(0);
  });

  it('triggers action callbacks (Diff, Export ZIP, Publish to GitHub)', () => {
    const onOpenDiff = vi.fn();
    const onExportZip = vi.fn();
    const onPublishToGitHub = vi.fn();

    render(
      <CodeWorkspace
        files={mockFiles}
        selectedFile="main.py"
        onSelectFile={vi.fn()}
        onOpenDiff={onOpenDiff}
        onExportZip={onExportZip}
        onPublishToGitHub={onPublishToGitHub}
      />
    );

    fireEvent.click(screen.getByText('Diff View'));
    expect(onOpenDiff).toHaveBeenCalled();

    fireEvent.click(screen.getByText('Export ZIP'));
    expect(onExportZip).toHaveBeenCalled();

    fireEvent.click(screen.getByText('Publish to GitHub'));
    expect(onPublishToGitHub).toHaveBeenCalled();
  });
});

describe('DiffViewer Component', () => {
  const mockFiles = {
    'main.py': {
      path: 'main.py',
      content: 'import torch\n\ndef run():\n    model = Model()\n    print("Success")\n',
      language: 'python',
    },
  };

  const baselineFiles = {
    'main.py': 'import numpy\n\ndef run():\n    print("Old Baseline")\n',
  };

  it('renders diff metrics and side-by-side view', () => {
    render(
      <DiffViewer
        files={mockFiles}
        baselineFiles={baselineFiles}
        selectedFile="main.py"
      />
    );

    expect(screen.getByText('Code Evolution & Diff Viewer')).toBeDefined();
    expect(screen.getByText(/additions/i)).toBeDefined();
    expect(screen.getByText(/deletions/i)).toBeDefined();
    expect(screen.getByText(/Original Baseline Specification/i)).toBeDefined();
    expect(screen.getByText(/Refined Multi-Agent Implementation/i)).toBeDefined();
  });

  it('switches between split and unified view mode', () => {
    render(
      <DiffViewer
        files={mockFiles}
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
});

describe('GitHubPublishModal Component', () => {
  const mockFiles = {
    'main.py': { path: 'main.py', content: 'print(1)', language: 'python' },
  };

  beforeEach(() => {
    localStorage.clear();
    sessionStorage.clear();
    vi.restoreAllMocks();
  });

  it('renders GitHub Publish dialog when open', async () => {
    await act(async () => {
      render(
        <GitHubPublishModal
          isOpen={true}
          onClose={vi.fn()}
          files={mockFiles}
          paperTitle="Flash Attention 2"
        />
      );
    });

    expect(screen.getByText('Publish Repository to GitHub')).toBeDefined();
    expect(screen.getByPlaceholderText(/ghp_/i)).toBeDefined();
    expect(screen.getByText(/Initial Commit Message/i)).toBeDefined();
  });

  it('successfully publishes repository and displays result links', async () => {
    vi.spyOn(gitHubPublisher, 'verifyToken').mockResolvedValue({
      username: 'researcher-user',
      scopes: ['repo'],
    });

    vi.spyOn(gitHubPublisher, 'createAndPushRepo').mockResolvedValue({
      repoUrl: 'https://github.com/researcher-user/autogit-flash-attention-2',
      cloneUrl: 'https://github.com/researcher-user/autogit-flash-attention-2.git',
      commitSha: 'abcdef1234567890',
      publishedFilesCount: 1,
    });

    const onSuccess = vi.fn();

    await act(async () => {
      render(
        <GitHubPublishModal
          isOpen={true}
          onClose={vi.fn()}
          files={mockFiles}
          paperTitle="Flash Attention 2"
          onSuccess={onSuccess}
        />
      );
    });

    const patInput = screen.getByPlaceholderText(/ghp_/i);
    await act(async () => {
      fireEvent.change(patInput, { target: { value: 'ghp_test_token_12345' } });
    });

    const submitBtn = screen.getByText('Create & Push');
    await act(async () => {
      fireEvent.click(submitBtn);
    });

    await waitFor(() => {
      expect(screen.getByText('Repository Published Successfully!')).toBeDefined();
      expect(screen.getByText(/git clone https:\/\/github.com/i)).toBeDefined();
      expect(onSuccess).toHaveBeenCalled();
    });
  });
});

describe('ZipExportModal Component', () => {
  const mockFiles = {
    'main.py': { path: 'main.py', content: 'print("zip demo")', language: 'python' },
  };

  it('renders zip archive modal and triggers zip download', async () => {
    const downloadSpy = vi.spyOn(zipExporter, 'downloadRepositoryZip').mockResolvedValue(new Blob());

    render(
      <ZipExportModal
        isOpen={true}
        onClose={vi.fn()}
        files={mockFiles}
        projectName="mamba-demo"
      />
    );

    expect(screen.getByText('Export Repository Archive')).toBeDefined();
    expect(screen.getByText('Include standard project scaffolding')).toBeDefined();

    const downloadBtn = screen.getByRole('button', { name: /Download/i });
    await act(async () => {
      fireEvent.click(downloadBtn);
    });

    expect(downloadSpy).toHaveBeenCalledWith(
      expect.objectContaining({
        projectName: 'autogit-mamba-demo',
        includeStandardScaffolding: true,
      }),
      'autogit-mamba-demo.zip'
    );
  });
});
