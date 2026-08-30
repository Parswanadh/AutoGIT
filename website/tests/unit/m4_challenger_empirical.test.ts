import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import JSZip from 'jszip';
import { GitHubPublisher, gitHubPublisher, PublishOptions } from '@/lib/github/publisher';
import { ZipExporter, zipExporter, ZipExportOptions } from '@/lib/export/zipExporter';

describe('Milestone 4 Challenger Empirical Stress Suite', () => {
  const originalFetch = globalThis.fetch;

  beforeEach(() => {
    vi.restoreAllMocks();
  });

  afterEach(() => {
    globalThis.fetch = originalFetch;
  });

  // =========================================================================
  // Section 1: GitHubPublisher - PAT Verification & Error Handling
  // =========================================================================
  describe('Section 1: GitHubPublisher Token Authentication & Errors', () => {
    it('1.1: Rejects missing, empty, or whitespace PAT tokens without network calls', async () => {
      const publisher = new GitHubPublisher();
      const fetchSpy = vi.fn();
      globalThis.fetch = fetchSpy;

      await expect(publisher.verifyToken('')).rejects.toThrow(/Personal Access Token is required/i);
      await expect(publisher.verifyToken('    ')).rejects.toThrow(/Personal Access Token is required/i);
      await expect(publisher.verifyToken('\t\n')).rejects.toThrow(/Personal Access Token is required/i);
      await expect(publisher.verifyToken(null as any)).rejects.toThrow(/Personal Access Token is required/i);
      await expect(publisher.verifyToken(undefined as any)).rejects.toThrow(/Personal Access Token is required/i);

      expect(fetchSpy).not.toHaveBeenCalled();
    });

    it('1.2: Handles 401 Unauthorized with descriptive user error', async () => {
      const publisher = new GitHubPublisher();
      globalThis.fetch = vi.fn().mockResolvedValue({
        ok: false,
        status: 401,
        statusText: 'Unauthorized',
        headers: new Headers(),
        json: async () => ({ message: 'Bad credentials' }),
      });

      await expect(publisher.verifyToken('ghp_invalid_expired_token')).rejects.toThrow(/401 Unauthorized/i);
    });

    it('1.3: Handles 403 Forbidden with rate limit exhaustion header', async () => {
      const publisher = new GitHubPublisher();
      globalThis.fetch = vi.fn().mockResolvedValue({
        ok: false,
        status: 403,
        statusText: 'Forbidden',
        headers: new Headers({
          'x-ratelimit-remaining': '0',
          'x-ratelimit-reset': '1700000000',
        }),
        json: async () => ({ message: 'API rate limit exceeded' }),
      });

      await expect(publisher.verifyToken('ghp_limited_token')).rejects.toThrow(/rate limit exceeded/i);
    });

    it('1.4: Handles 403 Forbidden with insufficient scope (missing repo scope)', async () => {
      const publisher = new GitHubPublisher();
      globalThis.fetch = vi.fn().mockResolvedValue({
        ok: false,
        status: 403,
        statusText: 'Forbidden',
        headers: new Headers({
          'x-ratelimit-remaining': '4999',
        }),
        json: async () => ({ message: 'Resource not accessible by personal access token' }),
      });

      await expect(publisher.verifyToken('ghp_read_only_token')).rejects.toThrow(/repo.*scope/i);
    });

    it('1.5: Correctly extracts user metadata and multiple OAuth scopes', async () => {
      const publisher = new GitHubPublisher();
      globalThis.fetch = vi.fn().mockResolvedValue({
        ok: true,
        status: 200,
        headers: new Headers({
          'x-oauth-scopes': 'repo, read:org, workflow, user:email',
        }),
        json: async () => ({
          login: 'octodev',
          name: 'Octo Developer',
          avatar_url: 'https://avatars.githubusercontent.com/u/12345',
        }),
      });

      const user = await publisher.verifyToken('ghp_valid_token_123');
      expect(user.username).toBe('octodev');
      expect(user.name).toBe('Octo Developer');
      expect(user.avatarUrl).toBe('https://avatars.githubusercontent.com/u/12345');
      expect(user.scopes).toEqual(['repo', 'read:org', 'workflow', 'user:email']);
    });

    it('1.6: Formats Authorization headers appropriately for Bearer and token prefixes', async () => {
      const publisher = new GitHubPublisher();
      const fetchSpy = vi.fn().mockResolvedValue({
        ok: true,
        status: 200,
        headers: new Headers({ 'x-oauth-scopes': 'repo' }),
        json: async () => ({ login: 'octodev' }),
      });
      globalThis.fetch = fetchSpy;

      // Clean token
      await publisher.verifyToken('ghp_clean123');
      expect(fetchSpy).toHaveBeenLastCalledWith(
        'https://api.github.com/user',
        expect.objectContaining({
          headers: expect.objectContaining({ Authorization: 'Bearer ghp_clean123' }),
        })
      );

      // Bearer token
      await publisher.verifyToken('Bearer ghp_bearer123');
      expect(fetchSpy).toHaveBeenLastCalledWith(
        'https://api.github.com/user',
        expect.objectContaining({
          headers: expect.objectContaining({ Authorization: 'Bearer ghp_bearer123' }),
        })
      );

      // Legacy token prefix
      await publisher.verifyToken('token ghp_token123');
      expect(fetchSpy).toHaveBeenLastCalledWith(
        'https://api.github.com/user',
        expect.objectContaining({
          headers: expect.objectContaining({ Authorization: 'token ghp_token123' }),
        })
      );
    });
  });

  // =========================================================================
  // Section 2: GitHubPublisher - Multi-File Git Data API Stress Scenarios
  // =========================================================================
  describe('Section 2: GitHubPublisher Git Data API Publishing & Failures', () => {
    it('2.1: Rejects empty repo name and empty files collection', async () => {
      const publisher = new GitHubPublisher();

      await expect(
        publisher.createAndPushRepo('ghp_token', {
          repoName: '',
          files: { 'a.py': { path: 'a.py', content: 'x=1' } },
        })
      ).rejects.toThrow(/Repository name cannot be empty/i);

      await expect(
        publisher.createAndPushRepo('ghp_token', {
          repoName: 'my-repo',
          files: {},
        })
      ).rejects.toThrow(/Cannot publish an empty repository/i);
    });

    it('2.2: Successfully executes complete 7-stage Git Data API workflow', async () => {
      const publisher = new GitHubPublisher();
      const mockRoutes: Record<string, any> = {
        'GET https://api.github.com/user': {
          ok: true,
          status: 200,
          headers: new Headers({ 'x-oauth-scopes': 'repo' }),
          json: async () => ({ login: 'researcher' }),
        },
        'POST https://api.github.com/user/repos': {
          ok: true,
          status: 201,
          json: async () => ({
            html_url: 'https://github.com/researcher/neural-synth',
            clone_url: 'https://github.com/researcher/neural-synth.git',
            default_branch: 'main',
          }),
        },
        'POST https://api.github.com/repos/researcher/neural-synth/git/blobs': {
          ok: true,
          status: 201,
          json: async () => ({ sha: 'blob_sha_1' }),
        },
        'GET https://api.github.com/repos/researcher/neural-synth/git/ref/heads/main': {
          ok: true,
          status: 200,
          json: async () => ({ object: { sha: 'base_commit_1' } }),
        },
        'GET https://api.github.com/repos/researcher/neural-synth/git/commits/base_commit_1': {
          ok: true,
          status: 200,
          json: async () => ({ tree: { sha: 'base_tree_1' } }),
        },
        'POST https://api.github.com/repos/researcher/neural-synth/git/trees': {
          ok: true,
          status: 201,
          json: async () => ({ sha: 'new_tree_1' }),
        },
        'POST https://api.github.com/repos/researcher/neural-synth/git/commits': {
          ok: true,
          status: 201,
          json: async () => ({ sha: 'commit_sha_123456789' }),
        },
        'PATCH https://api.github.com/repos/researcher/neural-synth/git/refs/heads/main': {
          ok: true,
          status: 200,
          json: async () => ({ object: { sha: 'commit_sha_123456789' } }),
        },
      };

      globalThis.fetch = vi.fn().mockImplementation((url: string, init?: RequestInit) => {
        const method = init?.method || 'GET';
        const key = `${method} ${url}`;
        if (mockRoutes[key]) return Promise.resolve(mockRoutes[key]);
        return Promise.resolve({ ok: false, status: 404, json: async () => ({ message: `Route not found: ${key}` }) });
      });

      const progressLog: Array<{ step: string; progress: number }> = [];
      const result = await publisher.createAndPushRepo(
        'ghp_token_xyz',
        {
          repoName: 'neural-synth',
          description: 'Neural synthesizer repo',
          files: {
            'main.py': { path: 'main.py', content: 'print("Synth")' },
            'src/model.py': { path: 'src/model.py', content: 'class Model: pass' },
          },
        },
        (step, progress) => {
          progressLog.push({ step, progress });
        }
      );

      expect(result.repoUrl).toBe('https://github.com/researcher/neural-synth');
      expect(result.cloneUrl).toBe('https://github.com/researcher/neural-synth.git');
      expect(result.commitSha).toBe('commit_sha_123456789');
      expect(result.publishedFilesCount).toBe(2);
      expect(progressLog.length).toBeGreaterThanOrEqual(5);
    });

    it('2.3: Gracefully handles 422 Conflict (repo already exists) by pushing new commit to existing ref', async () => {
      const publisher = new GitHubPublisher();
      const mockRoutes: Record<string, any> = {
        'GET https://api.github.com/user': {
          ok: true,
          status: 200,
          headers: new Headers({ 'x-oauth-scopes': 'repo' }),
          json: async () => ({ login: 'researcher' }),
        },
        'POST https://api.github.com/user/repos': {
          ok: false,
          status: 422,
          json: async () => ({ message: 'name already exists on this account' }),
        },
        'GET https://api.github.com/repos/researcher/existing-repo': {
          ok: true,
          status: 200,
          json: async () => ({
            html_url: 'https://github.com/researcher/existing-repo',
            clone_url: 'https://github.com/researcher/existing-repo.git',
            default_branch: 'main',
          }),
        },
        'POST https://api.github.com/repos/researcher/existing-repo/git/blobs': {
          ok: true,
          status: 201,
          json: async () => ({ sha: 'blob_sha_update' }),
        },
        'GET https://api.github.com/repos/researcher/existing-repo/git/ref/heads/main': {
          ok: true,
          status: 200,
          json: async () => ({ object: { sha: 'existing_commit_sha' } }),
        },
        'GET https://api.github.com/repos/researcher/existing-repo/git/commits/existing_commit_sha': {
          ok: true,
          status: 200,
          json: async () => ({ tree: { sha: 'existing_tree_sha' } }),
        },
        'POST https://api.github.com/repos/researcher/existing-repo/git/trees': {
          ok: true,
          status: 201,
          json: async () => ({ sha: 'updated_tree_sha' }),
        },
        'POST https://api.github.com/repos/researcher/existing-repo/git/commits': {
          ok: true,
          status: 201,
          json: async () => ({ sha: 'pushed_commit_sha' }),
        },
        'PATCH https://api.github.com/repos/researcher/existing-repo/git/refs/heads/main': {
          ok: true,
          status: 200,
          json: async () => ({ object: { sha: 'pushed_commit_sha' } }),
        },
      };

      globalThis.fetch = vi.fn().mockImplementation((url: string, init?: RequestInit) => {
        const method = init?.method || 'GET';
        const key = `${method} ${url}`;
        if (mockRoutes[key]) return Promise.resolve(mockRoutes[key]);
        return Promise.resolve({ ok: false, status: 404, json: async () => ({ message: `Unknown: ${key}` }) });
      });

      const result = await publisher.createAndPushRepo('ghp_token', {
        repoName: 'existing-repo',
        files: { 'patch.py': { path: 'patch.py', content: '# patch' } },
      });

      expect(result.commitSha).toBe('pushed_commit_sha');
      expect(result.repoUrl).toBe('https://github.com/researcher/existing-repo');
    });

    it('2.4: Fails gracefully when network fails on tree creation (500)', async () => {
      const publisher = new GitHubPublisher();
      globalThis.fetch = vi.fn().mockImplementation((url: string, init?: RequestInit) => {
        const method = init?.method || 'GET';
        if (url.endsWith('/user') && method === 'GET') {
          return Promise.resolve({ ok: true, status: 200, headers: new Headers({ 'x-oauth-scopes': 'repo' }), json: async () => ({ login: 'user' }) });
        }
        if (url.endsWith('/user/repos') && method === 'POST') {
          return Promise.resolve({ ok: true, status: 201, json: async () => ({ html_url: 'https://github.com/user/repo', default_branch: 'main' }) });
        }
        if (url.includes('/git/blobs') && method === 'POST') {
          return Promise.resolve({ ok: true, status: 201, json: async () => ({ sha: 'blob1' }) });
        }
        if (url.includes('/git/ref/heads/main') && method === 'GET') {
          return Promise.resolve({ ok: false, status: 404 });
        }
        if (url.includes('/git/trees') && method === 'POST') {
          return Promise.resolve({ ok: false, status: 500, statusText: 'Internal Server Error', json: async () => ({ message: 'Tree build failed' }) });
        }
        return Promise.resolve({ ok: false, status: 404 });
      });

      await expect(
        publisher.createAndPushRepo('ghp_token', {
          repoName: 'repo',
          files: { 'file.py': { path: 'file.py', content: '1' } },
        })
      ).rejects.toThrow(/Failed to create Git tree \(500\): Tree build failed/i);
    });

    it('2.5: Fails gracefully when commit creation returns 422 Unprocessable Entity', async () => {
      const publisher = new GitHubPublisher();
      globalThis.fetch = vi.fn().mockImplementation((url: string, init?: RequestInit) => {
        const method = init?.method || 'GET';
        if (url.endsWith('/user') && method === 'GET') {
          return Promise.resolve({ ok: true, status: 200, headers: new Headers({ 'x-oauth-scopes': 'repo' }), json: async () => ({ login: 'user' }) });
        }
        if (url.endsWith('/user/repos') && method === 'POST') {
          return Promise.resolve({ ok: true, status: 201, json: async () => ({ html_url: 'https://github.com/user/repo', default_branch: 'main' }) });
        }
        if (url.includes('/git/blobs') && method === 'POST') {
          return Promise.resolve({ ok: true, status: 201, json: async () => ({ sha: 'blob1' }) });
        }
        if (url.includes('/git/ref/heads/main') && method === 'GET') {
          return Promise.resolve({ ok: false, status: 404 });
        }
        if (url.includes('/git/trees') && method === 'POST') {
          return Promise.resolve({ ok: true, status: 201, json: async () => ({ sha: 'tree1' }) });
        }
        if (url.includes('/git/commits') && method === 'POST') {
          return Promise.resolve({ ok: false, status: 422, statusText: 'Unprocessable Entity', json: async () => ({ message: 'Invalid commit author' }) });
        }
        return Promise.resolve({ ok: false, status: 404 });
      });

      await expect(
        publisher.createAndPushRepo('ghp_token', {
          repoName: 'repo',
          files: { 'file.py': { path: 'file.py', content: '1' } },
        })
      ).rejects.toThrow(/Failed to create commit \(422\): Invalid commit author/i);
    });

    it('2.6: Fails gracefully when updating branch ref returns 409 Conflict', async () => {
      const publisher = new GitHubPublisher();
      globalThis.fetch = vi.fn().mockImplementation((url: string, init?: RequestInit) => {
        const method = init?.method || 'GET';
        if (url.endsWith('/user') && method === 'GET') {
          return Promise.resolve({ ok: true, status: 200, headers: new Headers({ 'x-oauth-scopes': 'repo' }), json: async () => ({ login: 'user' }) });
        }
        if (url.endsWith('/user/repos') && method === 'POST') {
          return Promise.resolve({ ok: true, status: 201, json: async () => ({ html_url: 'https://github.com/user/repo', default_branch: 'main' }) });
        }
        if (url.includes('/git/blobs') && method === 'POST') {
          return Promise.resolve({ ok: true, status: 201, json: async () => ({ sha: 'blob1' }) });
        }
        if (url.includes('/git/ref/heads/main') && method === 'GET') {
          return Promise.resolve({ ok: true, status: 200, json: async () => ({ object: { sha: 'old_sha' } }) });
        }
        if (url.includes('/git/commits/old_sha') && method === 'GET') {
          return Promise.resolve({ ok: true, status: 200, json: async () => ({ tree: { sha: 'old_tree' } }) });
        }
        if (url.includes('/git/trees') && method === 'POST') {
          return Promise.resolve({ ok: true, status: 201, json: async () => ({ sha: 'tree1' }) });
        }
        if (url.includes('/git/commits') && method === 'POST') {
          return Promise.resolve({ ok: true, status: 201, json: async () => ({ sha: 'commit_sha' }) });
        }
        if (url.includes('/git/refs/heads/main') && method === 'PATCH') {
          return Promise.resolve({ ok: false, status: 409, statusText: 'Conflict', json: async () => ({ message: 'Branch updated concurrently' }) });
        }
        return Promise.resolve({ ok: false, status: 404 });
      });

      await expect(
        publisher.createAndPushRepo('ghp_token', {
          repoName: 'repo',
          files: { 'file.py': { path: 'file.py', content: '1' } },
        })
      ).rejects.toThrow(/Failed to update branch reference \(409\): Branch updated concurrently/i);
    });
  });

  // =========================================================================
  // Section 3: JSZip Exporter - Stress, Edge Cases & Data Integrity
  // =========================================================================
  describe('Section 3: JSZip Exporter Boundary & Stress Testing', () => {
    it('3.1: Handles Unicode filenames and content (CJK, Cyrillic, Emoji, Greek Math)', async () => {
      const options: ZipExportOptions = {
        projectName: 'unicode-neural-suite',
        includeStandardScaffolding: false,
        files: {
          'src/模型/自注意力.py': 'class 注意力机制:\n    """🚀 Self Attention in Python"""\n    pass',
          'tests/тест_алгоритм.py': 'def тест_модели():\n    assert 1 == 1',
          'docs/アルゴリズム.md': '# 機械学習モデル\n数式: $\\mathbb{E}_{x \\sim p}[f(x)]$',
          'emojis/⚡_speed_test.py': 'print("⚡ Lightning fast")',
        },
      };

      const blob = await zipExporter.exportRepositoryZip(options);
      expect(blob).toBeInstanceOf(Blob);

      const inspection = await zipExporter.inspectZip(blob);
      expect(inspection.totalFiles).toBe(4);

      const zip = await JSZip.loadAsync(blob);
      const cjkCode = await zip.file('src/模型/自注意力.py')?.async('text');
      expect(cjkCode).toContain('🚀 Self Attention');

      const mathDoc = await zip.file('docs/アルゴリズム.md')?.async('text');
      expect(mathDoc).toContain('\\mathbb{E}_{x \\sim p}[f(x)]');
    });

    it('3.2: Handles deeply nested directory structures (30+ path segments) and strips leading slashes', async () => {
      const deepSegments = Array.from({ length: 30 }, (_, i) => `dir_${i}`).join('/');
      const deepPath = `${deepSegments}/deep_module.py`;
      const slashPath = '////nested///module.py';

      const options: ZipExportOptions = {
        projectName: 'deep-nesting-repo',
        includeStandardScaffolding: false,
        files: {
          [deepPath]: 'def deep(): return True',
          [slashPath]: 'print("clean")',
        },
      };

      const blob = await zipExporter.exportRepositoryZip(options);
      const zip = await JSZip.loadAsync(blob);

      expect(await zip.file(deepPath)?.async('text')).toBe('def deep(): return True');
      expect(await zip.file('nested/module.py')?.async('text')).toBe('print("clean")');
    });

    it('3.3: Scales to 150+ files across multiple directories efficiently', async () => {
      const fileMap: Record<string, string> = {};
      for (let i = 0; i < 150; i++) {
        const folder = `subpkg_${Math.floor(i / 15)}`;
        fileMap[`${folder}/module_${i}.py`] = `def compute_${i}():\n    return ${i} ** 2\n`;
      }

      const options: ZipExportOptions = {
        projectName: 'large-scale-repo',
        includeStandardScaffolding: true,
        files: fileMap,
      };

      const startTime = performance.now();
      const blob = await zipExporter.exportRepositoryZip(options);
      const durationMs = performance.now() - startTime;

      expect(durationMs).toBeLessThan(3000); // Efficient generation < 3s

      const inspection = await zipExporter.inspectZip(blob);
      // 150 user files + 4 scaffolding files = 154 files
      expect(inspection.totalFiles).toBe(154);
      expect(inspection.totalBytes).toBeGreaterThan(5000);
    });

    it('3.4: Handles 0-byte / empty files cleanly without crashing', async () => {
      const options: ZipExportOptions = {
        projectName: 'empty-pkg',
        includeStandardScaffolding: false,
        files: {
          '__init__.py': '',
          'empty_data.csv': '',
          'normal.py': 'x = 1',
        },
      };

      const blob = await zipExporter.exportRepositoryZip(options);
      const inspection = await zipExporter.inspectZip(blob);

      expect(inspection.totalFiles).toBe(3);
      const initFile = inspection.fileList.find((f) => f.path === '__init__.py');
      expect(initFile?.size).toBe(0);

      const zip = await JSZip.loadAsync(blob);
      expect(await zip.file('__init__.py')?.async('text')).toBe('');
    });

    it('3.5: Prevents scaffolding collisions when custom README, LICENSE, or .gitignore are provided', async () => {
      const customReadme = '# Custom Research Synthesis\nStrict reproduction protocol.\n';
      const customLicense = 'Custom License (C) 2026';
      const customGitignore = '*.custom_cache\n';

      const options: ZipExportOptions = {
        projectName: 'custom-scaffold-repo',
        includeStandardScaffolding: true,
        files: {
          'README.md': customReadme,
          'LICENSE': customLicense,
          '.gitignore': customGitignore,
          'main.py': 'print("hello")',
        },
      };

      const blob = await zipExporter.exportRepositoryZip(options);
      const inspection = await zipExporter.inspectZip(blob);

      // README.md, LICENSE, .gitignore were custom, requirements.txt is added -> 4 user + 1 scaffold = 5 files
      expect(inspection.totalFiles).toBe(5);

      const zip = await JSZip.loadAsync(blob);
      expect(await zip.file('README.md')?.async('text')).toBe(customReadme);
      expect(await zip.file('LICENSE')?.async('text')).toBe(customLicense);
      expect(await zip.file('.gitignore')?.async('text')).toBe(customGitignore);
      expect(await zip.file('requirements.txt')?.async('text')).toContain('torch');
    });

    it('3.6: Wraps archive in custom root directory when rootFolder is enabled', async () => {
      const options: ZipExportOptions = {
        projectName: 'bundled-project',
        rootFolder: 'custom-package-root',
        includeStandardScaffolding: false,
        files: {
          'main.py': 'print("entry")',
          'config.json': '{"mode": "test"}',
        },
      };

      const blob = await zipExporter.exportRepositoryZip(options);
      const inspection = await zipExporter.inspectZip(blob);

      expect(inspection.fileList.map((f) => f.path)).toContain('custom-package-root/main.py');
      expect(inspection.fileList.map((f) => f.path)).toContain('custom-package-root/config.json');
    });
  });
});
