import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { GitHubPublisher, gitHubPublisher, PublishOptions } from '@/lib/github/publisher';

describe('GitHubPublisher Unit Tests', () => {
  const originalFetch = globalThis.fetch;

  beforeEach(() => {
    vi.restoreAllMocks();
  });

  afterEach(() => {
    globalThis.fetch = originalFetch;
  });

  describe('verifyToken', () => {
    it('throws error when PAT is empty or whitespace', async () => {
      const publisher = new GitHubPublisher();
      await expect(publisher.verifyToken('')).rejects.toThrow(/Personal Access Token is required/i);
      await expect(publisher.verifyToken('   ')).rejects.toThrow(/Personal Access Token is required/i);
    });

    it('successfully verifies a valid PAT and parses username & scopes', async () => {
      const mockUser = {
        login: 'octocat',
        name: 'The Octocat',
        avatar_url: 'https://github.com/images/error/octocat_happy.gif',
      };

      globalThis.fetch = vi.fn().mockResolvedValue({
        ok: true,
        status: 200,
        headers: new Headers({
          'x-oauth-scopes': 'repo, workflow, read:org',
        }),
        json: async () => mockUser,
      });

      const publisher = new GitHubPublisher();
      const result = await publisher.verifyToken('ghp_test1234567890');

      expect(result.username).toBe('octocat');
      expect(result.name).toBe('The Octocat');
      expect(result.avatarUrl).toBe('https://github.com/images/error/octocat_happy.gif');
      expect(result.scopes).toEqual(['repo', 'workflow', 'read:org']);
      expect(globalThis.fetch).toHaveBeenCalledWith(
        'https://api.github.com/user',
        expect.objectContaining({
          method: 'GET',
          headers: expect.objectContaining({
            Authorization: 'Bearer ghp_test1234567890',
            Accept: 'application/vnd.github+json',
          }),
        })
      );
    });

    it('throws 401 Unauthorized with clear guidance for invalid PAT', async () => {
      globalThis.fetch = vi.fn().mockResolvedValue({
        ok: false,
        status: 401,
        statusText: 'Unauthorized',
        headers: new Headers(),
        json: async () => ({ message: 'Bad credentials' }),
      });

      const publisher = new GitHubPublisher();
      await expect(publisher.verifyToken('ghp_invalid_token')).rejects.toThrow(/401 Unauthorized/i);
    });

    it('throws 403 Rate Limit when x-ratelimit-remaining is 0', async () => {
      globalThis.fetch = vi.fn().mockResolvedValue({
        ok: false,
        status: 403,
        statusText: 'Forbidden',
        headers: new Headers({
          'x-ratelimit-remaining': '0',
        }),
        json: async () => ({ message: 'API rate limit exceeded' }),
      });

      const publisher = new GitHubPublisher();
      await expect(publisher.verifyToken('ghp_limited_token')).rejects.toThrow(/rate limit exceeded/i);
    });

    it('throws 403 Scope error when rate limit is not 0', async () => {
      globalThis.fetch = vi.fn().mockResolvedValue({
        ok: false,
        status: 403,
        statusText: 'Forbidden',
        headers: new Headers({
          'x-ratelimit-remaining': '50',
        }),
        json: async () => ({ message: 'Resource not accessible by integration' }),
      });

      const publisher = new GitHubPublisher();
      await expect(publisher.verifyToken('ghp_forbidden_token')).rejects.toThrow(/repo.*scope/i);
    });
  });

  describe('createAndPushRepo', () => {
    it('throws error when repo name is empty', async () => {
      const publisher = new GitHubPublisher();
      await expect(
        publisher.createAndPushRepo('ghp_token', {
          repoName: '',
          files: { 'main.py': { path: 'main.py', content: 'print("hi")', language: 'python' } },
        })
      ).rejects.toThrow(/Repository name cannot be empty/i);
    });

    it('throws error when files map is empty', async () => {
      const publisher = new GitHubPublisher();
      await expect(
        publisher.createAndPushRepo('ghp_token', {
          repoName: 'my-repo',
          files: {},
        })
      ).rejects.toThrow(/Cannot publish an empty repository/i);
    });

    it('executes full Git Data API flow successfully', async () => {
      const mockResponses: Record<string, any> = {
        'GET https://api.github.com/user': {
          ok: true,
          status: 200,
          headers: new Headers({ 'x-oauth-scopes': 'repo' }),
          json: async () => ({ login: 'autogit-bot' }),
        },
        'POST https://api.github.com/user/repos': {
          ok: true,
          status: 201,
          json: async () => ({
            html_url: 'https://github.com/autogit-bot/autogit-flash-attn',
            clone_url: 'https://github.com/autogit-bot/autogit-flash-attn.git',
            default_branch: 'main',
          }),
        },
        'POST https://api.github.com/repos/autogit-bot/autogit-flash-attn/git/blobs': {
          ok: true,
          status: 201,
          json: async () => ({ sha: 'blob_sha_123456789' }),
        },
        'GET https://api.github.com/repos/autogit-bot/autogit-flash-attn/git/ref/heads/main': {
          ok: true,
          status: 200,
          json: async () => ({
            object: { sha: 'initial_commit_sha_987654321' },
          }),
        },
        'GET https://api.github.com/repos/autogit-bot/autogit-flash-attn/git/commits/initial_commit_sha_987654321': {
          ok: true,
          status: 200,
          json: async () => ({
            tree: { sha: 'base_tree_sha_55555' },
          }),
        },
        'POST https://api.github.com/repos/autogit-bot/autogit-flash-attn/git/trees': {
          ok: true,
          status: 201,
          json: async () => ({ sha: 'new_tree_sha_77777' }),
        },
        'POST https://api.github.com/repos/autogit-bot/autogit-flash-attn/git/commits': {
          ok: true,
          status: 201,
          json: async () => ({ sha: 'final_commit_sha_abcdef123456' }),
        },
        'PATCH https://api.github.com/repos/autogit-bot/autogit-flash-attn/git/refs/heads/main': {
          ok: true,
          status: 200,
          json: async () => ({ object: { sha: 'final_commit_sha_abcdef123456' } }),
        },
      };

      globalThis.fetch = vi.fn().mockImplementation((url: string, init?: RequestInit) => {
        const method = init?.method || 'GET';
        const key = `${method} ${url}`;
        if (mockResponses[key]) {
          return Promise.resolve(mockResponses[key]);
        }
        return Promise.resolve({
          ok: false,
          status: 404,
          statusText: 'Not Found',
          json: async () => ({ message: `Unknown route: ${key}` }),
        });
      });

      const publisher = new GitHubPublisher();
      const progressSteps: string[] = [];

      const result = await publisher.createAndPushRepo(
        'ghp_valid_token_123',
        {
          repoName: 'autogit-flash-attn',
          description: 'Flash attention reproduction',
          isPrivate: false,
          files: {
            'main.py': { path: 'main.py', content: 'print("demo")', language: 'python' },
            'model.py': { path: 'model.py', content: 'class Model: pass', language: 'python' },
          },
          commitMessage: 'feat: initial flash attention release',
        },
        (step) => progressSteps.push(step)
      );

      expect(result.repoUrl).toBe('https://github.com/autogit-bot/autogit-flash-attn');
      expect(result.cloneUrl).toBe('https://github.com/autogit-bot/autogit-flash-attn.git');
      expect(result.commitSha).toBe('final_commit_sha_abcdef123456');
      expect(result.publishedFilesCount).toBe(2);
      expect(progressSteps.length).toBeGreaterThan(3);
    });

    it('handles new empty repo creation without existing ref (POST to /refs)', async () => {
      const mockResponses: Record<string, any> = {
        'GET https://api.github.com/user': {
          ok: true,
          status: 200,
          headers: new Headers({ 'x-oauth-scopes': 'repo' }),
          json: async () => ({ login: 'newbie-dev' }),
        },
        'POST https://api.github.com/user/repos': {
          ok: true,
          status: 201,
          json: async () => ({
            html_url: 'https://github.com/newbie-dev/new-empty-repo',
            clone_url: 'https://github.com/newbie-dev/new-empty-repo.git',
            default_branch: 'main',
          }),
        },
        'POST https://api.github.com/repos/newbie-dev/new-empty-repo/git/blobs': {
          ok: true,
          status: 201,
          json: async () => ({ sha: 'blob_sha_abc' }),
        },
        'GET https://api.github.com/repos/newbie-dev/new-empty-repo/git/ref/heads/main': {
          ok: false,
          status: 404,
          json: async () => ({ message: 'Not Found' }),
        },
        'POST https://api.github.com/repos/newbie-dev/new-empty-repo/git/trees': {
          ok: true,
          status: 201,
          json: async () => ({ sha: 'tree_sha_root' }),
        },
        'POST https://api.github.com/repos/newbie-dev/new-empty-repo/git/commits': {
          ok: true,
          status: 201,
          json: async () => ({ sha: 'initial_root_commit_sha' }),
        },
        'POST https://api.github.com/repos/newbie-dev/new-empty-repo/git/refs': {
          ok: true,
          status: 201,
          json: async () => ({ ref: 'refs/heads/main', object: { sha: 'initial_root_commit_sha' } }),
        },
      };

      globalThis.fetch = vi.fn().mockImplementation((url: string, init?: RequestInit) => {
        const method = init?.method || 'GET';
        const key = `${method} ${url}`;
        if (mockResponses[key]) {
          return Promise.resolve(mockResponses[key]);
        }
        return Promise.resolve({
          ok: false,
          status: 404,
          json: async () => ({ message: `Unknown route: ${key}` }),
        });
      });

      const publisher = new GitHubPublisher();
      const result = await publisher.createAndPushRepo('ghp_token', {
        repoName: 'new-empty-repo',
        files: { 'README.md': { path: 'README.md', content: '# Hello', language: 'markdown' } },
      });

      expect(result.commitSha).toBe('initial_root_commit_sha');
      expect(result.publishedFilesCount).toBe(1);
    });

    it('handles existing repository gracefully if repo exists (422 fallback)', async () => {
      const mockResponses: Record<string, any> = {
        'GET https://api.github.com/user': {
          ok: true,
          status: 200,
          headers: new Headers({ 'x-oauth-scopes': 'repo' }),
          json: async () => ({ login: 'existing-user' }),
        },
        'POST https://api.github.com/user/repos': {
          ok: false,
          status: 422,
          json: async () => ({ message: 'name already exists on this account' }),
        },
        'GET https://api.github.com/repos/existing-user/existing-repo': {
          ok: true,
          status: 200,
          json: async () => ({
            html_url: 'https://github.com/existing-user/existing-repo',
            clone_url: 'https://github.com/existing-user/existing-repo.git',
            default_branch: 'main',
          }),
        },
        'POST https://api.github.com/repos/existing-user/existing-repo/git/blobs': {
          ok: true,
          status: 201,
          json: async () => ({ sha: 'blob_sha_existing' }),
        },
        'GET https://api.github.com/repos/existing-user/existing-repo/git/ref/heads/main': {
          ok: true,
          status: 200,
          json: async () => ({ object: { sha: 'existing_commit_sha' } }),
        },
        'GET https://api.github.com/repos/existing-user/existing-repo/git/commits/existing_commit_sha': {
          ok: true,
          status: 200,
          json: async () => ({ tree: { sha: 'existing_tree_sha' } }),
        },
        'POST https://api.github.com/repos/existing-user/existing-repo/git/trees': {
          ok: true,
          status: 201,
          json: async () => ({ sha: 'tree_sha_updated' }),
        },
        'POST https://api.github.com/repos/existing-user/existing-repo/git/commits': {
          ok: true,
          status: 201,
          json: async () => ({ sha: 'commit_sha_new_push' }),
        },
        'PATCH https://api.github.com/repos/existing-user/existing-repo/git/refs/heads/main': {
          ok: true,
          status: 200,
          json: async () => ({ object: { sha: 'commit_sha_new_push' } }),
        },
      };

      globalThis.fetch = vi.fn().mockImplementation((url: string, init?: RequestInit) => {
        const method = init?.method || 'GET';
        const key = `${method} ${url}`;
        if (mockResponses[key]) {
          return Promise.resolve(mockResponses[key]);
        }
        return Promise.resolve({
          ok: false,
          status: 404,
          json: async () => ({ message: `Unknown: ${key}` }),
        });
      });

      const publisher = new GitHubPublisher();
      const result = await publisher.createAndPushRepo('ghp_token', {
        repoName: 'existing-repo',
        files: { 'main.py': { path: 'main.py', content: 'print("updated")', language: 'python' } },
      });

      expect(result.commitSha).toBe('commit_sha_new_push');
    });

    it('throws error when blob creation fails', async () => {
      globalThis.fetch = vi.fn().mockImplementation((url: string, init?: RequestInit) => {
        const method = init?.method || 'GET';
        if (url.includes('/user') && method === 'GET') {
          return Promise.resolve({
            ok: true,
            status: 200,
            headers: new Headers({ 'x-oauth-scopes': 'repo' }),
            json: async () => ({ login: 'user' }),
          });
        }
        if (url.includes('/user/repos') && method === 'POST') {
          return Promise.resolve({
            ok: true,
            status: 201,
            json: async () => ({ html_url: 'https://github.com/user/test', default_branch: 'main' }),
          });
        }
        if (url.includes('/git/blobs')) {
          return Promise.resolve({
            ok: false,
            status: 500,
            statusText: 'Internal Server Error',
            json: async () => ({ message: 'Blob quota exceeded' }),
          });
        }
        return Promise.resolve({ ok: true, status: 200, json: async () => ({}) });
      });

      const publisher = new GitHubPublisher();
      await expect(
        publisher.createAndPushRepo('ghp_token', {
          repoName: 'test-repo',
          files: { 'main.py': { path: 'main.py', content: 'x = 1', language: 'python' } },
        })
      ).rejects.toThrow(/Failed to create blob/i);
    });
  });
});
