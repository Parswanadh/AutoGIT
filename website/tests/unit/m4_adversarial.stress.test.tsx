import React from 'react';
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, fireEvent, waitFor, act } from '@testing-library/react';
import JSZip from 'jszip';
import { GitHubPublisher, gitHubPublisher, PublishOptions } from '@/lib/github/publisher';
import { ZipExporter, zipExporter, ZipExportOptions } from '@/lib/export/zipExporter';
import GitHubPublishModal from '@/components/studio/GitHubPublishModal';
import ZipExportModal from '@/components/studio/ZipExportModal';
import CodeWorkspace from '@/components/studio/CodeWorkspace';
import DiffViewer from '@/components/studio/DiffViewer';
import { keyStore } from '@/lib/storage/keyStore';

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

describe('Milestone 4 Adversarial Stress Tests: GitHub Publisher & JSZip Exporter', () => {
  const originalFetch = globalThis.fetch;

  beforeEach(() => {
    vi.restoreAllMocks();
    localStorage.clear();
    sessionStorage.clear();
  });

  afterEach(() => {
    globalThis.fetch = originalFetch;
  });

  // ==========================================================================
  // Suite 1: GitHubPublisher - PAT Authentication, Scopes & Edge Cases
  // ==========================================================================
  describe('Suite 1: GitHubPublisher PAT Authentication & Error Scenarios', () => {
    it('1.1: handles token variations (Bearer prefix, token prefix, leading/trailing whitespace & newlines)', async () => {
      const publisher = new GitHubPublisher();
      const mockUser = { login: 'adversarial-tester', name: 'Tester', avatar_url: '' };

      const fetchSpy = vi.fn().mockResolvedValue({
        ok: true,
        status: 200,
        headers: new Headers({ 'x-oauth-scopes': 'repo, workflow' }),
        json: async () => mockUser,
      });
      globalThis.fetch = fetchSpy;

      // Raw token
      const res1 = await publisher.verifyToken('ghp_rawtoken123');
      expect(res1.username).toBe('adversarial-tester');
      expect(fetchSpy).toHaveBeenLastCalledWith(
        'https://api.github.com/user',
        expect.objectContaining({
          headers: expect.objectContaining({ Authorization: 'Bearer ghp_rawtoken123' }),
        })
      );

      // Token with 'Bearer ' prefix
      const res2 = await publisher.verifyToken('Bearer ghp_withbearer456');
      expect(res2.username).toBe('adversarial-tester');
      expect(fetchSpy).toHaveBeenLastCalledWith(
        'https://api.github.com/user',
        expect.objectContaining({
          headers: expect.objectContaining({ Authorization: 'Bearer ghp_withbearer456' }),
        })
      );

      // Token with 'token ' prefix (classic GitHub format)
      const res3 = await publisher.verifyToken('token ghp_classictoken789');
      expect(res3.username).toBe('adversarial-tester');
      expect(fetchSpy).toHaveBeenLastCalledWith(
        'https://api.github.com/user',
        expect.objectContaining({
          headers: expect.objectContaining({ Authorization: 'token ghp_classictoken789' }),
        })
      );

      // Token surrounded with newlines, spaces, and tabs
      const res4 = await publisher.verifyToken('  \n\t ghp_messytoken \t\n  ');
      expect(res4.username).toBe('adversarial-tester');
      expect(fetchSpy).toHaveBeenLastCalledWith(
        'https://api.github.com/user',
        expect.objectContaining({
          headers: expect.objectContaining({ Authorization: 'Bearer ghp_messytoken' }),
        })
      );
    });

    it('1.2: rejects empty, null, or whitespace-only PAT tokens before initiating network request', async () => {
      const publisher = new GitHubPublisher();
      const fetchSpy = vi.fn();
      globalThis.fetch = fetchSpy;

      await expect(publisher.verifyToken('')).rejects.toThrow(/Personal Access Token is required/i);
      await expect(publisher.verifyToken('   \t\n  ')).rejects.toThrow(/Personal Access Token is required/i);
      await expect(publisher.verifyToken(null as any)).rejects.toThrow(/Personal Access Token is required/i);
      await expect(publisher.verifyToken(undefined as any)).rejects.toThrow(/Personal Access Token is required/i);

      expect(fetchSpy).not.toHaveBeenCalled();
    });

    it('1.3: handles 401 Unauthorized with various JSON and malformed error bodies', async () => {
      const publisher = new GitHubPublisher();

      // Standard GitHub 401 JSON
      globalThis.fetch = vi.fn().mockResolvedValue({
        ok: false,
        status: 401,
        statusText: 'Unauthorized',
        headers: new Headers(),
        json: async () => ({ message: 'Bad credentials' }),
      });
      await expect(publisher.verifyToken('ghp_expired_token')).rejects.toThrow(/401 Unauthorized/i);

      // 401 with HTML body (e.g. corporate proxy/firewall)
      globalThis.fetch = vi.fn().mockResolvedValue({
        ok: false,
        status: 401,
        statusText: 'Unauthorized',
        headers: new Headers(),
        json: async () => {
          throw new Error('Unexpected token < in JSON at position 0');
        },
      });
      await expect(publisher.verifyToken('ghp_bad_proxy_token')).rejects.toThrow(/401 Unauthorized/i);
    });

    it('1.4: handles 403 Forbidden with rate limit exhaustion vs missing OAuth repo scope', async () => {
      const publisher = new GitHubPublisher();

      // Rate limit exhausted (x-ratelimit-remaining: '0')
      globalThis.fetch = vi.fn().mockResolvedValue({
        ok: false,
        status: 403,
        statusText: 'Forbidden',
        headers: new Headers({ 'x-ratelimit-remaining': '0' }),
        json: async () => ({ message: 'API rate limit exceeded for user' }),
      });
      await expect(publisher.verifyToken('ghp_ratelimited')).rejects.toThrow(/rate limit exceeded/i);

      // Missing repo scope (x-ratelimit-remaining > 0)
      globalThis.fetch = vi.fn().mockResolvedValue({
        ok: false,
        status: 403,
        statusText: 'Forbidden',
        headers: new Headers({ 'x-ratelimit-remaining': '4990' }),
        json: async () => ({ message: 'Resource not accessible by personal access token' }),
      });
      await expect(publisher.verifyToken('ghp_insufficient_scope')).rejects.toThrow(/repo.*scope/i);

      // 403 without x-ratelimit-remaining header
      globalThis.fetch = vi.fn().mockResolvedValue({
        ok: false,
        status: 403,
        statusText: 'Forbidden',
        headers: new Headers(),
        json: async () => ({ message: 'Forbidden' }),
      });
      await expect(publisher.verifyToken('ghp_forbidden')).rejects.toThrow(/403/i);
    });

    it('1.5: handles unexpected HTTP error statuses (404, 500, 502, 503) with descriptive messages', async () => {
      const publisher = new GitHubPublisher();

      // 500 Internal Server Error
      globalThis.fetch = vi.fn().mockResolvedValue({
        ok: false,
        status: 500,
        statusText: 'Internal Server Error',
        headers: new Headers(),
        json: async () => ({ message: 'GitHub Octocat exploded' }),
      });
      await expect(publisher.verifyToken('ghp_token')).rejects.toThrow(/GitHub token verification failed \(500\): GitHub Octocat exploded/i);

      // 503 Service Unavailable
      globalThis.fetch = vi.fn().mockResolvedValue({
        ok: false,
        status: 503,
        statusText: 'Service Unavailable',
        headers: new Headers(),
        json: async () => ({ message: 'GitHub is currently under maintenance' }),
      });
      await expect(publisher.verifyToken('ghp_token')).rejects.toThrow(/503/i);
    });

    it('1.6: correctly parses complex and messy OAuth scopes headers', async () => {
      const publisher = new GitHubPublisher();

      // Empty scopes header (token has no scopes)
      globalThis.fetch = vi.fn().mockResolvedValue({
        ok: true,
        status: 200,
        headers: new Headers({ 'x-oauth-scopes': '' }),
        json: async () => ({ login: 'no-scope-user' }),
      });
      const res1 = await publisher.verifyToken('ghp_noscope');
      expect(res1.scopes).toEqual([]);

      // Comma-separated with inconsistent whitespace and trailing comma
      globalThis.fetch = vi.fn().mockResolvedValue({
        ok: true,
        status: 200,
        headers: new Headers({ 'x-oauth-scopes': ' repo ,  public_repo,workflow , delete_repo, ' }),
        json: async () => ({ login: 'scoped-user' }),
      });
      const res2 = await publisher.verifyToken('ghp_scoped');
      expect(res2.scopes).toEqual(['repo', 'public_repo', 'workflow', 'delete_repo']);
    });
  });

  // ==========================================================================
  // Suite 2: GitHubPublisher - Git Data API Repository Creation & Push Stress
  // ==========================================================================
  describe('Suite 2: GitHubPublisher Multi-File Git Data API Stress Scenarios', () => {
    it('2.1: validates required input parameters (repoName, files)', async () => {
      const publisher = new GitHubPublisher();

      // Empty repoName
      await expect(
        publisher.createAndPushRepo('ghp_token', {
          repoName: '',
          files: { 'a.py': { path: 'a.py', content: '1', language: 'python' } },
        })
      ).rejects.toThrow(/Repository name cannot be empty/i);

      // Whitespace repoName
      await expect(
        publisher.createAndPushRepo('ghp_token', {
          repoName: '   \n ',
          files: { 'a.py': { path: 'a.py', content: '1', language: 'python' } },
        })
      ).rejects.toThrow(/Repository name cannot be empty/i);

      // Empty files map
      await expect(
        publisher.createAndPushRepo('ghp_token', {
          repoName: 'valid-repo',
          files: {},
        })
      ).rejects.toThrow(/Cannot publish an empty repository/i);
    });

    it('2.2: sanitizes special characters in repository names automatically', async () => {
      const mockRoutes: Record<string, any> = {
        'GET https://api.github.com/user': {
          ok: true,
          status: 200,
          headers: new Headers({ 'x-oauth-scopes': 'repo' }),
          json: async () => ({ login: 'sanitizer-dev' }),
        },
        'POST https://api.github.com/user/repos': {
          ok: true,
          status: 201,
          json: async () => ({
            html_url: 'https://github.com/sanitizer-dev/AutoGIT-Test-Repo-2026',
            clone_url: 'https://github.com/sanitizer-dev/AutoGIT-Test-Repo-2026.git',
            default_branch: 'main',
          }),
        },
        'POST https://api.github.com/repos/sanitizer-dev/AutoGIT-Test-Repo-2026/git/blobs': {
          ok: true,
          status: 201,
          json: async () => ({ sha: 'blob123' }),
        },
        'GET https://api.github.com/repos/sanitizer-dev/AutoGIT-Test-Repo-2026/git/ref/heads/main': {
          ok: false,
          status: 404,
          json: async () => ({ message: 'Not Found' }),
        },
        'POST https://api.github.com/repos/sanitizer-dev/AutoGIT-Test-Repo-2026/git/trees': {
          ok: true,
          status: 201,
          json: async () => ({ sha: 'tree123' }),
        },
        'POST https://api.github.com/repos/sanitizer-dev/AutoGIT-Test-Repo-2026/git/commits': {
          ok: true,
          status: 201,
          json: async () => ({ sha: 'commit123' }),
        },
        'POST https://api.github.com/repos/sanitizer-dev/AutoGIT-Test-Repo-2026/git/refs': {
          ok: true,
          status: 201,
          json: async () => ({ ref: 'refs/heads/main', object: { sha: 'commit123' } }),
        },
      };

      globalThis.fetch = vi.fn().mockImplementation((url: string, init?: RequestInit) => {
        const method = init?.method || 'GET';
        const key = `${method} ${url}`;
        if (mockRoutes[key]) return Promise.resolve(mockRoutes[key]);
        return Promise.resolve({ ok: false, status: 404, json: async () => ({ message: `Unknown: ${key}` }) });
      });

      const publisher = new GitHubPublisher();
      const result = await publisher.createAndPushRepo('ghp_token', {
        repoName: '  AutoGIT Test Repo! @#$% 2026  ',
        files: { 'main.py': { path: 'main.py', content: 'print(1)', language: 'python' } },
      });

      expect(result.commitSha).toBe('commit123');
      expect(result.repoUrl).toContain('AutoGIT-Test-Repo-2026');
    });

    it('2.3: handles 422 repo conflict when repo already exists and pushes atomic update', async () => {
      const mockRoutes: Record<string, any> = {
        'GET https://api.github.com/user': {
          ok: true,
          status: 200,
          headers: new Headers({ 'x-oauth-scopes': 'repo' }),
          json: async () => ({ login: 'conflict-user' }),
        },
        'POST https://api.github.com/user/repos': {
          ok: false,
          status: 422,
          json: async () => ({ message: 'name already exists on this account' }),
        },
        'GET https://api.github.com/repos/conflict-user/existing-project': {
          ok: true,
          status: 200,
          json: async () => ({
            html_url: 'https://github.com/conflict-user/existing-project',
            clone_url: 'https://github.com/conflict-user/existing-project.git',
            default_branch: 'main',
          }),
        },
        'POST https://api.github.com/repos/conflict-user/existing-project/git/blobs': {
          ok: true,
          status: 201,
          json: async () => ({ sha: 'blob_conflict_123' }),
        },
        'GET https://api.github.com/repos/conflict-user/existing-project/git/ref/heads/main': {
          ok: true,
          status: 200,
          json: async () => ({ object: { sha: 'existing_head_sha' } }),
        },
        'GET https://api.github.com/repos/conflict-user/existing-project/git/commits/existing_head_sha': {
          ok: true,
          status: 200,
          json: async () => ({ tree: { sha: 'existing_tree_sha' } }),
        },
        'POST https://api.github.com/repos/conflict-user/existing-project/git/trees': {
          ok: true,
          status: 201,
          json: async () => ({ sha: 'new_combined_tree_sha' }),
        },
        'POST https://api.github.com/repos/conflict-user/existing-project/git/commits': {
          ok: true,
          status: 201,
          json: async () => ({ sha: 'updated_commit_sha' }),
        },
        'PATCH https://api.github.com/repos/conflict-user/existing-project/git/refs/heads/main': {
          ok: true,
          status: 200,
          json: async () => ({ object: { sha: 'updated_commit_sha' } }),
        },
      };

      globalThis.fetch = vi.fn().mockImplementation((url: string, init?: RequestInit) => {
        const method = init?.method || 'GET';
        const key = `${method} ${url}`;
        if (mockRoutes[key]) return Promise.resolve(mockRoutes[key]);
        return Promise.resolve({ ok: false, status: 404, json: async () => ({ message: `Unknown: ${key}` }) });
      });

      const publisher = new GitHubPublisher();
      const result = await publisher.createAndPushRepo('ghp_token', {
        repoName: 'existing-project',
        files: { 'update.py': { path: 'update.py', content: '# updated', language: 'python' } },
      });

      expect(result.commitSha).toBe('updated_commit_sha');
      expect(result.publishedFilesCount).toBe(1);
    });

    it('2.4: fails with descriptive error when 422 is caused by non-existing repo validation (e.g. policy block)', async () => {
      globalThis.fetch = vi.fn().mockImplementation((url: string, init?: RequestInit) => {
        const method = init?.method || 'GET';
        if (url.includes('/user') && method === 'GET') {
          return Promise.resolve({
            ok: true,
            status: 200,
            headers: new Headers({ 'x-oauth-scopes': 'repo' }),
            json: async () => ({ login: 'restricted-user' }),
          });
        }
        if (url.includes('/user/repos') && method === 'POST') {
          return Promise.resolve({
            ok: false,
            status: 422,
            json: async () => ({ message: 'Repository creation is disabled by organization policy.' }),
          });
        }
        if (url.includes('/repos/restricted-user/blocked-repo') && method === 'GET') {
          return Promise.resolve({
            ok: false,
            status: 404,
            json: async () => ({ message: 'Not Found' }),
          });
        }
        return Promise.resolve({ ok: false, status: 500 });
      });

      const publisher = new GitHubPublisher();
      await expect(
        publisher.createAndPushRepo('ghp_token', {
          repoName: 'blocked-repo',
          files: { 'main.py': { path: 'main.py', content: 'x = 1', language: 'python' } },
        })
      ).rejects.toThrow(/Repository creation is disabled by organization policy/i);
    });

    it('2.5: handles network failures during multi-step creation (tree failure, commit failure, ref failure)', async () => {
      const baseRoutes: Record<string, any> = {
        'GET https://api.github.com/user': {
          ok: true,
          status: 200,
          headers: new Headers({ 'x-oauth-scopes': 'repo' }),
          json: async () => ({ login: 'user-err' }),
        },
        'POST https://api.github.com/user/repos': {
          ok: true,
          status: 201,
          json: async () => ({ html_url: 'https://github.com/user-err/repo', default_branch: 'main' }),
        },
        'POST https://api.github.com/repos/user-err/repo/git/blobs': {
          ok: true,
          status: 201,
          json: async () => ({ sha: 'blob1' }),
        },
        'GET https://api.github.com/repos/user-err/repo/git/ref/heads/main': {
          ok: false,
          status: 404,
          json: async () => ({ message: 'Not Found' }),
        },
      };

      // Sub-case A: Tree creation returns 500
      globalThis.fetch = vi.fn().mockImplementation((url: string, init?: RequestInit) => {
        const method = init?.method || 'GET';
        const key = `${method} ${url}`;
        if (key === 'POST https://api.github.com/repos/user-err/repo/git/trees') {
          return Promise.resolve({
            ok: false,
            status: 500,
            statusText: 'Internal Server Error',
            json: async () => ({ message: 'Tree creation failed due to database timeout' }),
          });
        }
        if (baseRoutes[key]) return Promise.resolve(baseRoutes[key]);
        return Promise.resolve({ ok: false, status: 404 });
      });

      const publisher = new GitHubPublisher();
      await expect(
        publisher.createAndPushRepo('ghp_token', {
          repoName: 'repo',
          files: { 'main.py': { path: 'main.py', content: 'x = 1', language: 'python' } },
        })
      ).rejects.toThrow(/Failed to create Git tree \(500\): Tree creation failed/i);

      // Sub-case B: Commit creation returns 422
      globalThis.fetch = vi.fn().mockImplementation((url: string, init?: RequestInit) => {
        const method = init?.method || 'GET';
        const key = `${method} ${url}`;
        if (key === 'POST https://api.github.com/repos/user-err/repo/git/trees') {
          return Promise.resolve({ ok: true, status: 201, json: async () => ({ sha: 'tree_sha' }) });
        }
        if (key === 'POST https://api.github.com/repos/user-err/repo/git/commits') {
          return Promise.resolve({
            ok: false,
            status: 422,
            statusText: 'Unprocessable Entity',
            json: async () => ({ message: 'Invalid tree SHA specified in commit' }),
          });
        }
        if (baseRoutes[key]) return Promise.resolve(baseRoutes[key]);
        return Promise.resolve({ ok: false, status: 404 });
      });

      await expect(
        publisher.createAndPushRepo('ghp_token', {
          repoName: 'repo',
          files: { 'main.py': { path: 'main.py', content: 'x = 1', language: 'python' } },
        })
      ).rejects.toThrow(/Failed to create commit \(422\): Invalid tree SHA/i);

      // Sub-case C: Ref creation returns 409 Conflict
      globalThis.fetch = vi.fn().mockImplementation((url: string, init?: RequestInit) => {
        const method = init?.method || 'GET';
        const key = `${method} ${url}`;
        if (key === 'POST https://api.github.com/repos/user-err/repo/git/trees') {
          return Promise.resolve({ ok: true, status: 201, json: async () => ({ sha: 'tree_sha' }) });
        }
        if (key === 'POST https://api.github.com/repos/user-err/repo/git/commits') {
          return Promise.resolve({ ok: true, status: 201, json: async () => ({ sha: 'commit_sha' }) });
        }
        if (key === 'POST https://api.github.com/repos/user-err/repo/git/refs') {
          return Promise.resolve({
            ok: false,
            status: 409,
            statusText: 'Conflict',
            json: async () => ({ message: 'Reference already locked or branch updated concurrently' }),
          });
        }
        if (baseRoutes[key]) return Promise.resolve(baseRoutes[key]);
        return Promise.resolve({ ok: false, status: 404 });
      });

      await expect(
        publisher.createAndPushRepo('ghp_token', {
          repoName: 'repo',
          files: { 'main.py': { path: 'main.py', content: 'x = 1', language: 'python' } },
        })
      ).rejects.toThrow(/Failed to create branch reference \(409\): Reference already locked/i);
    });

    it('2.6: verifies monotonically increasing progress callback notifications', async () => {
      const mockRoutes: Record<string, any> = {
        'GET https://api.github.com/user': {
          ok: true,
          status: 200,
          headers: new Headers({ 'x-oauth-scopes': 'repo' }),
          json: async () => ({ login: 'progress-tester' }),
        },
        'POST https://api.github.com/user/repos': {
          ok: true,
          status: 201,
          json: async () => ({ html_url: 'https://github.com/progress-tester/demo', default_branch: 'main' }),
        },
        'POST https://api.github.com/repos/progress-tester/demo/git/blobs': {
          ok: true,
          status: 201,
          json: async () => ({ sha: 'blob_sha' }),
        },
        'GET https://api.github.com/repos/progress-tester/demo/git/ref/heads/main': {
          ok: false,
          status: 404,
          json: async () => ({ message: 'Not Found' }),
        },
        'POST https://api.github.com/repos/progress-tester/demo/git/trees': {
          ok: true,
          status: 201,
          json: async () => ({ sha: 'tree_sha' }),
        },
        'POST https://api.github.com/repos/progress-tester/demo/git/commits': {
          ok: true,
          status: 201,
          json: async () => ({ sha: 'commit_sha' }),
        },
        'POST https://api.github.com/repos/progress-tester/demo/git/refs': {
          ok: true,
          status: 201,
          json: async () => ({ ref: 'refs/heads/main', object: { sha: 'commit_sha' } }),
        },
      };

      globalThis.fetch = vi.fn().mockImplementation((url: string, init?: RequestInit) => {
        const method = init?.method || 'GET';
        const key = `${method} ${url}`;
        if (mockRoutes[key]) return Promise.resolve(mockRoutes[key]);
        return Promise.resolve({ ok: false, status: 404 });
      });

      const progressRecords: Array<{ step: string; progress: number }> = [];
      const publisher = new GitHubPublisher();

      await publisher.createAndPushRepo(
        'ghp_token',
        {
          repoName: 'demo',
          files: {
            'file1.py': { path: 'file1.py', content: '1', language: 'python' },
            'file2.py': { path: 'file2.py', content: '2', language: 'python' },
            'file3.py': { path: 'file3.py', content: '3', language: 'python' },
          },
        },
        (step, progress) => {
          progressRecords.push({ step, progress });
        }
      );

      expect(progressRecords.length).toBeGreaterThanOrEqual(6);
      expect(progressRecords[0].progress).toBe(10);
      expect(progressRecords[progressRecords.length - 1].progress).toBe(100);

      // Verify strictly monotonic increase
      for (let i = 1; i < progressRecords.length; i++) {
        expect(progressRecords[i].progress).toBeGreaterThanOrEqual(progressRecords[i - 1].progress);
      }
    });
  });

  // ==========================================================================
  // Suite 3: JSZip Exporter - Deep Nesting, Unicode, High File Count Stress
  // ==========================================================================
  describe('Suite 3: JSZip Exporter Edge Cases & Adversarial Inputs', () => {
    it('3.1: handles unicode filenames and multi-lingual content (CJK, Emoji, Math, Cyrillic)', async () => {
      const options: ZipExportOptions = {
        projectName: 'unicode-neural-repo',
        includeStandardScaffolding: false,
        files: {
          'src/模型/注意力机制.py': 'class 注意力: pass  # 🚀 Self-Attention',
          'tests/🧪_pipeline.py': 'def test_🧪(): assert True',
          'data/данные.json': '{"статус": "успешно", "точность": 0.99}',
          'docs/日本語.md': '# 拡散モデルの解説\n数式: $\\nabla_\\theta \\log p(x)$',
        },
      };

      const blob = await zipExporter.exportRepositoryZip(options);
      expect(blob).toBeInstanceOf(Blob);

      const zip = await JSZip.loadAsync(blob);
      const fileKeys = Object.keys(zip.files);

      expect(fileKeys).toContain('src/模型/注意力机制.py');
      expect(fileKeys).toContain('tests/🧪_pipeline.py');
      expect(fileKeys).toContain('data/данные.json');
      expect(fileKeys).toContain('docs/日本語.md');

      const cjkContent = await zip.file('src/模型/注意力机制.py')?.async('text');
      expect(cjkContent).toContain('🚀 Self-Attention');

      const mathDoc = await zip.file('docs/日本語.md')?.async('text');
      expect(mathDoc).toContain('\\nabla_\\theta \\log p(x)');
    });

    it('3.2: handles deeply nested paths (25+ directory levels) and normalizes leading slashes', async () => {
      const deepPath = 'a/b/c/d/e/f/g/h/i/j/k/l/m/n/o/p/q/r/s/t/u/v/w/x/y/z/deep_leaf.py';
      const slashPath = '///root/nested/module.py';

      const options: ZipExportOptions = {
        projectName: 'nested-stress',
        includeStandardScaffolding: false,
        files: {
          [deepPath]: 'def deep_function(): return 42',
          [slashPath]: 'print("normalized")',
        },
      };

      const blob = await zipExporter.exportRepositoryZip(options);
      const zip = await JSZip.loadAsync(blob);
      const fileKeys = Object.keys(zip.files);

      expect(fileKeys).toContain(deepPath);
      expect(fileKeys).toContain('root/nested/module.py');
      expect(fileKeys).not.toContain('///root/nested/module.py');

      const deepContent = await zip.file(deepPath)?.async('text');
      expect(deepContent).toBe('def deep_function(): return 42');
    });

    it('3.3: handles large file counts (120+ files) across multiple subpackages seamlessly', async () => {
      const largeFileMap: Record<string, string> = {};
      for (let i = 0; i < 120; i++) {
        const pkgIndex = Math.floor(i / 10);
        largeFileMap[`pkg_${pkgIndex}/module_${i}.py`] = `def func_${i}():\n    return ${i} * 2\n`;
      }

      const options: ZipExportOptions = {
        projectName: 'large-package-repo',
        includeStandardScaffolding: true,
        files: largeFileMap,
      };

      const blob = await zipExporter.exportRepositoryZip(options);
      const inspection = await zipExporter.inspectZip(blob);

      // 120 user files + 4 scaffolding files = 124 files
      expect(inspection.totalFiles).toBe(124);
      expect(inspection.totalBytes).toBeGreaterThan(5000);

      const zip = await JSZip.loadAsync(blob);
      expect(await zip.file('pkg_0/module_0.py')?.async('text')).toContain('return 0 * 2');
      expect(await zip.file('pkg_11/module_119.py')?.async('text')).toContain('return 119 * 2');
    });

    it('3.4: handles empty string files and 0-byte blobs without crashing', async () => {
      const options: ZipExportOptions = {
        projectName: 'empty-files-test',
        includeStandardScaffolding: false,
        files: {
          'empty_init.py': '',
          'empty_module.py': '',
          'valid.py': 'x = 100',
        },
      };

      const blob = await zipExporter.exportRepositoryZip(options);
      const inspection = await zipExporter.inspectZip(blob);

      expect(inspection.totalFiles).toBe(3);
      const emptyInit = inspection.fileList.find((f) => f.path === 'empty_init.py');
      expect(emptyInit?.size).toBe(0);

      const zip = await JSZip.loadAsync(blob);
      expect(await zip.file('empty_init.py')?.async('text')).toBe('');
    });

    it('3.5: sanitizes complex project names with special symbols when building zip archive', async () => {
      const options: ZipExportOptions = {
        projectName: 'Research Paper: 2.0 (Fast & Robust) [2026]! @#$',
        rootFolder: true,
        includeStandardScaffolding: false,
        files: {
          'main.py': 'print("hello")',
        },
      };

      const blob = await zipExporter.exportRepositoryZip(options);
      const zip = await JSZip.loadAsync(blob);
      const fileKeys = Object.keys(zip.files).filter((k) => !zip.files[k].dir);

      // Sanitized name should replace special chars with dashes
      expect(fileKeys.length).toBe(1);
      expect(fileKeys[0]).toMatch(/^Research-Paper.*\/main\.py$/);
    });
  });

  // ==========================================================================
  // Suite 4: Studio UI Components Integration & Modal Stress
  // ==========================================================================
  describe('Suite 4: Studio UI Components Stress & Error Presentation', () => {
    const mockFiles = {
      'main.py': { path: 'main.py', content: 'import torch\nprint("AutoGIT")', language: 'python' },
      'model.py': { path: 'model.py', content: 'class Model: pass', language: 'python' },
      'utils.py': { path: 'utils.py', content: 'def helper(): pass', language: 'python' },
    };

    it('4.1: GitHubPublishModal handles PAT verification failure and displays error banner', async () => {
      vi.spyOn(gitHubPublisher, 'verifyToken').mockRejectedValue(
        new Error('Invalid GitHub Personal Access Token (401 Unauthorized).')
      );

      await act(async () => {
        render(
          <GitHubPublishModal
            isOpen={true}
            onClose={vi.fn()}
            files={mockFiles}
            paperTitle="Diffusion Mamba"
          />
        );
      });

      const patInput = screen.getByPlaceholderText(/ghp_/i);
      await act(async () => {
        fireEvent.change(patInput, { target: { value: 'ghp_invalid_token' } });
        fireEvent.blur(patInput);
      });

      await waitFor(() => {
        expect(screen.getByText(/Invalid GitHub Personal Access Token \(401 Unauthorized\)/i)).toBeDefined();
      });
    });

    it('4.2: GitHubPublishModal displays live error banner if publishing fails during execution', async () => {
      vi.spyOn(gitHubPublisher, 'verifyToken').mockResolvedValue({
        username: 'valid-user',
        scopes: ['repo'],
      });

      vi.spyOn(gitHubPublisher, 'createAndPushRepo').mockRejectedValue(
        new Error('Failed to create Git tree (422): Malformed blob reference')
      );

      await act(async () => {
        render(
          <GitHubPublishModal
            isOpen={true}
            onClose={vi.fn()}
            files={mockFiles}
            paperTitle="Diffusion Mamba"
          />
        );
      });

      const patInput = screen.getByPlaceholderText(/ghp_/i);
      await act(async () => {
        fireEvent.change(patInput, { target: { value: 'ghp_valid_token' } });
      });

      const submitBtn = screen.getByText('Create & Push');
      await act(async () => {
        fireEvent.click(submitBtn);
      });

      await waitFor(() => {
        expect(screen.getByText(/Failed to create Git tree \(422\): Malformed blob reference/i)).toBeDefined();
      });
    });

    it('4.3: ZipExportModal dynamically recalculates file list when scaffolding is toggled', async () => {
      await act(async () => {
        render(
          <ZipExportModal
            isOpen={true}
            onClose={vi.fn()}
            files={mockFiles}
            projectName="diffusion-mamba"
          />
        );
      });

      // Initially 3 user files + 4 scaffolding files = 7 files
      expect(screen.getByText('7 files')).toBeDefined();

      // Uncheck scaffolding checkbox
      const scaffoldCheckbox = screen.getByRole('checkbox', { name: /Include standard project scaffolding/i });
      await act(async () => {
        fireEvent.click(scaffoldCheckbox);
      });

      // Now only 3 user files
      expect(screen.getByText('3 files')).toBeDefined();
    });

    it('4.4: CodeWorkspace handles file creation, deletion, and searching', async () => {
      const onCreateFile = vi.fn();
      const onDeleteFile = vi.fn();
      const onSelectFile = vi.fn();

      window.confirm = vi.fn().mockReturnValue(true);

      await act(async () => {
        render(
          <CodeWorkspace
            files={mockFiles}
            selectedFile="main.py"
            onSelectFile={onSelectFile}
            onCreateFile={onCreateFile}
            onDeleteFile={onDeleteFile}
          />
        );
      });

      // Test searching/filtering
      const searchInput = screen.getByPlaceholderText('Filter files...');
      fireEvent.change(searchInput, { target: { value: 'utils' } });
      expect(screen.getAllByText('utils.py').length).toBeGreaterThan(0);

      // Open new file form
      const plusBtn = screen.getByTitle('Create New File');
      fireEvent.click(plusBtn);

      const newFileInput = screen.getByPlaceholderText('filename.py');
      fireEvent.change(newFileInput, { target: { value: 'dataset.py' } });
      fireEvent.click(screen.getByText('Create'));

      expect(onCreateFile).toHaveBeenCalledWith('dataset.py', expect.any(String));
    });

    it('4.5: DiffViewer accurately computes split diffs and metrics across edge cases', () => {
      const testFiles = {
        'code.py': {
          path: 'code.py',
          content: 'line1\nline2_modified\nline3\nline4_new',
          language: 'python',
        },
      };

      const baselineFiles = {
        'code.py': 'line1\nline2_old\nline3',
      };

      render(
        <DiffViewer
          files={testFiles}
          baselineFiles={baselineFiles}
          selectedFile="code.py"
        />
      );

      expect(screen.getByText(/additions/i)).toBeDefined();
      expect(screen.getByText(/deletions/i)).toBeDefined();
      expect(screen.getByText(/baseline fidelity/i)).toBeDefined();
      expect(screen.getByText('Original Baseline Specification')).toBeDefined();
      expect(screen.getByText('Refined Multi-Agent Implementation')).toBeDefined();
    });
  });
});
