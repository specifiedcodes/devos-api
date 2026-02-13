import { Test, TestingModule } from '@nestjs/testing';
import {
  ConflictException,
  BadGatewayException,
  NotFoundException,
  BadRequestException,
  HttpException,
} from '@nestjs/common';
import { GitHubService } from './github.service';

// Mock Octokit at module level
const mockCreateForAuthenticatedUser = jest.fn();
const mockReposGet = jest.fn();
const mockGetRef = jest.fn();
const mockCreateRef = jest.fn();
const mockListBranches = jest.fn();
const mockGetBranch = jest.fn();
const mockDeleteRef = jest.fn();
const mockPullsCreate = jest.fn();
const mockPullsList = jest.fn();
const mockPullsGet = jest.fn();
const mockPullsUpdate = jest.fn();
const mockPullsMerge = jest.fn();
const mockIssuesAddLabels = jest.fn();

jest.mock('@octokit/rest', () => ({
  Octokit: jest.fn().mockImplementation(() => ({
    repos: {
      createForAuthenticatedUser: mockCreateForAuthenticatedUser,
      get: mockReposGet,
      listBranches: mockListBranches,
      getBranch: mockGetBranch,
    },
    git: {
      getRef: mockGetRef,
      createRef: mockCreateRef,
      deleteRef: mockDeleteRef,
    },
    pulls: {
      create: mockPullsCreate,
      list: mockPullsList,
      get: mockPullsGet,
      update: mockPullsUpdate,
      merge: mockPullsMerge,
    },
    issues: {
      addLabels: mockIssuesAddLabels,
    },
  })),
}));

/**
 * GitHubService Unit Tests
 * Story 6.2: GitHub Repository Creation
 * Story 6.3: GitHub Branch Management (enhanced createBranch, listBranches, getBranch, deleteBranch)
 * Story 6.4: GitHub Pull Request Creation (createPullRequest, listPullRequests, getPullRequest, updatePullRequest, mergePullRequest, addLabelsToIssue)
 *
 * Tests for enhanced createRepository, getRepository, branch methods, and PR methods.
 */
describe('GitHubService', () => {
  let service: GitHubService;

  const mockGitHubApiResponse = {
    data: {
      id: 123456789,
      name: 'my-repo',
      full_name: 'testuser/my-repo',
      html_url: 'https://github.com/testuser/my-repo',
      clone_url: 'https://github.com/testuser/my-repo.git',
      ssh_url: 'git@github.com:testuser/my-repo.git',
      private: true,
      default_branch: 'main',
      description: 'Test repository',
    },
  };

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [GitHubService],
    }).compile();

    service = module.get<GitHubService>(GitHubService);
    jest.clearAllMocks();
  });

  describe('createRepository', () => {
    it('should create repo with correct Octokit params', async () => {
      mockCreateForAuthenticatedUser.mockResolvedValue(mockGitHubApiResponse);

      await service.createRepository('test-token', 'my-repo', {
        description: 'Test repository',
        private: true,
        autoInit: true,
        gitignoreTemplate: 'Node',
        licenseTemplate: 'mit',
      });

      expect(mockCreateForAuthenticatedUser).toHaveBeenCalledWith({
        name: 'my-repo',
        description: 'Test repository',
        private: true,
        auto_init: true,
        gitignore_template: 'Node',
        license_template: 'mit',
      });
    });

    it('should pass gitignoreTemplate and licenseTemplate to Octokit', async () => {
      mockCreateForAuthenticatedUser.mockResolvedValue(mockGitHubApiResponse);

      await service.createRepository('test-token', 'my-repo', {
        gitignoreTemplate: 'Python',
        licenseTemplate: 'apache-2.0',
      });

      expect(mockCreateForAuthenticatedUser).toHaveBeenCalledWith(
        expect.objectContaining({
          gitignore_template: 'Python',
          license_template: 'apache-2.0',
        }),
      );
    });

    it('should default to private=true and autoInit=true', async () => {
      mockCreateForAuthenticatedUser.mockResolvedValue(mockGitHubApiResponse);

      await service.createRepository('test-token', 'my-repo');

      expect(mockCreateForAuthenticatedUser).toHaveBeenCalledWith(
        expect.objectContaining({
          private: true,
          auto_init: true,
        }),
      );
    });

    it('should return mapped response DTO', async () => {
      mockCreateForAuthenticatedUser.mockResolvedValue(mockGitHubApiResponse);

      const result = await service.createRepository('test-token', 'my-repo', {
        description: 'Test repository',
      });

      expect(result).toEqual({
        id: 123456789,
        name: 'my-repo',
        fullName: 'testuser/my-repo',
        htmlUrl: 'https://github.com/testuser/my-repo',
        cloneUrl: 'https://github.com/testuser/my-repo.git',
        sshUrl: 'git@github.com:testuser/my-repo.git',
        private: true,
        defaultBranch: 'main',
        description: 'Test repository',
      });
    });

    it('should throw ConflictException for 422 error (repo already exists)', async () => {
      const error: any = new Error('Repository creation failed.');
      error.status = 422;
      mockCreateForAuthenticatedUser.mockRejectedValue(error);

      await expect(
        service.createRepository('test-token', 'existing-repo'),
      ).rejects.toThrow(ConflictException);
    });

    it('should throw BadGatewayException for rate limit (403)', async () => {
      const error: any = new Error('API rate limit exceeded');
      error.status = 403;
      mockCreateForAuthenticatedUser.mockRejectedValue(error);

      await expect(
        service.createRepository('test-token', 'my-repo'),
      ).rejects.toThrow(BadGatewayException);
    });

    it('should throw BadGatewayException for other GitHub errors', async () => {
      const error: any = new Error('Internal Server Error');
      error.status = 500;
      mockCreateForAuthenticatedUser.mockRejectedValue(error);

      await expect(
        service.createRepository('test-token', 'my-repo'),
      ).rejects.toThrow(BadGatewayException);
    });

    it('should log repository creation', async () => {
      mockCreateForAuthenticatedUser.mockResolvedValue(mockGitHubApiResponse);
      const logSpy = jest.spyOn(service['logger'], 'log');

      await service.createRepository('test-token', 'my-repo');

      expect(logSpy).toHaveBeenCalledWith(
        expect.stringContaining('Creating GitHub repository: my-repo'),
      );
    });
  });

  describe('getRepository', () => {
    it('should return mapped DTO for existing repo', async () => {
      mockReposGet.mockResolvedValue(mockGitHubApiResponse);

      const result = await service.getRepository('test-token', 'testuser', 'my-repo');

      expect(mockReposGet).toHaveBeenCalledWith({
        owner: 'testuser',
        repo: 'my-repo',
      });

      expect(result).toEqual({
        id: 123456789,
        name: 'my-repo',
        fullName: 'testuser/my-repo',
        htmlUrl: 'https://github.com/testuser/my-repo',
        cloneUrl: 'https://github.com/testuser/my-repo.git',
        sshUrl: 'git@github.com:testuser/my-repo.git',
        private: true,
        defaultBranch: 'main',
        description: 'Test repository',
      });
    });

    it('should return null for 404 response', async () => {
      const error: any = new Error('Not Found');
      error.status = 404;
      mockReposGet.mockRejectedValue(error);

      const result = await service.getRepository('test-token', 'testuser', 'non-existent');

      expect(result).toBeNull();
    });

    it('should throw BadGatewayException for other errors', async () => {
      const error: any = new Error('Internal Server Error');
      error.status = 500;
      mockReposGet.mockRejectedValue(error);

      await expect(
        service.getRepository('test-token', 'testuser', 'my-repo'),
      ).rejects.toThrow(BadGatewayException);
    });
  });

  // ============ Story 6.3: Branch Management Tests ============

  describe('createBranch', () => {
    it('should get base branch SHA and create new ref', async () => {
      mockGetRef.mockResolvedValue({
        data: { object: { sha: 'abc123' } },
      });
      mockCreateRef.mockResolvedValue({
        data: {
          ref: 'refs/heads/feature/1-2',
          object: { sha: 'abc123' },
          url: 'https://api.github.com/repos/owner/repo/git/refs/heads/feature/1-2',
        },
      });

      const result = await service.createBranch(
        'token',
        'owner',
        'repo',
        'feature/1-2',
      );

      expect(mockGetRef).toHaveBeenCalledWith({
        owner: 'owner',
        repo: 'repo',
        ref: 'heads/main',
      });
      expect(mockCreateRef).toHaveBeenCalledWith({
        owner: 'owner',
        repo: 'repo',
        ref: 'refs/heads/feature/1-2',
        sha: 'abc123',
      });
      expect(result.branchName).toBe('feature/1-2');
      expect(result.sha).toBe('abc123');
    });

    it('should use default fromBranch="main" when not specified', async () => {
      mockGetRef.mockResolvedValue({
        data: { object: { sha: 'abc123' } },
      });
      mockCreateRef.mockResolvedValue({
        data: {
          ref: 'refs/heads/feature/test',
          object: { sha: 'abc123' },
          url: 'https://api.github.com/repos/owner/repo/git/refs/heads/feature/test',
        },
      });

      await service.createBranch('token', 'owner', 'repo', 'feature/test');

      expect(mockGetRef).toHaveBeenCalledWith({
        owner: 'owner',
        repo: 'repo',
        ref: 'heads/main',
      });
    });

    it('should use specified fromBranch when provided', async () => {
      mockGetRef.mockResolvedValue({
        data: { object: { sha: 'abc123' } },
      });
      mockCreateRef.mockResolvedValue({
        data: {
          ref: 'refs/heads/feature/test',
          object: { sha: 'abc123' },
          url: 'https://api.github.com/repos/owner/repo/git/refs/heads/feature/test',
        },
      });

      await service.createBranch(
        'token',
        'owner',
        'repo',
        'feature/test',
        'develop',
      );

      expect(mockGetRef).toHaveBeenCalledWith({
        owner: 'owner',
        repo: 'repo',
        ref: 'heads/develop',
      });
    });

    it('should return typed BranchResponseDto', async () => {
      mockGetRef.mockResolvedValue({
        data: { object: { sha: 'abc123def456' } },
      });
      mockCreateRef.mockResolvedValue({
        data: {
          ref: 'refs/heads/feature/1-2-user-login',
          object: { sha: 'abc123def456' },
          url: 'https://api.github.com/repos/owner/repo/git/refs/heads/feature/1-2-user-login',
        },
      });

      const result = await service.createBranch(
        'token',
        'owner',
        'repo',
        'feature/1-2-user-login',
      );

      expect(result).toEqual({
        branchName: 'feature/1-2-user-login',
        sha: 'abc123def456',
        ref: 'refs/heads/feature/1-2-user-login',
        url: 'https://api.github.com/repos/owner/repo/git/refs/heads/feature/1-2-user-login',
      });
    });

    it('should throw ConflictException for 422 error (branch already exists)', async () => {
      const error: any = new Error('Reference already exists');
      error.status = 422;
      mockGetRef.mockResolvedValue({
        data: { object: { sha: 'abc123' } },
      });
      mockCreateRef.mockRejectedValue(error);

      await expect(
        service.createBranch('token', 'owner', 'repo', 'existing-branch'),
      ).rejects.toThrow(ConflictException);
    });

    it('should throw NotFoundException for 404 error (source branch not found)', async () => {
      const error: any = new Error('Not Found');
      error.status = 404;
      mockGetRef.mockRejectedValue(error);

      await expect(
        service.createBranch(
          'token',
          'owner',
          'repo',
          'feature/test',
          'nonexistent',
        ),
      ).rejects.toThrow(NotFoundException);
    });

    it('should throw BadGatewayException for rate limit (403)', async () => {
      const error: any = new Error('API rate limit exceeded');
      error.status = 403;
      mockGetRef.mockRejectedValue(error);

      await expect(
        service.createBranch('token', 'owner', 'repo', 'feature/test'),
      ).rejects.toThrow(BadGatewayException);
    });

    it('should throw BadGatewayException for other errors', async () => {
      const error: any = new Error('Internal Server Error');
      error.status = 500;
      mockGetRef.mockRejectedValue(error);

      await expect(
        service.createBranch('token', 'owner', 'repo', 'feature/test'),
      ).rejects.toThrow(BadGatewayException);
    });
  });

  describe('listBranches', () => {
    const mockBranchList = {
      data: [
        {
          name: 'main',
          commit: { sha: 'abc123' },
          protected: true,
        },
        {
          name: 'feature/1-2-user-login',
          commit: { sha: 'def456' },
          protected: false,
        },
      ],
    };

    it('should return mapped branch list', async () => {
      mockListBranches.mockResolvedValue(mockBranchList);

      const result = await service.listBranches('token', 'owner', 'repo');

      expect(result.branches).toHaveLength(2);
      expect(result.branches[0]).toEqual({
        name: 'main',
        sha: 'abc123',
        protected: true,
        url: 'https://api.github.com/repos/owner/repo/branches/main',
      });
      expect(result.branches[1]).toEqual({
        name: 'feature/1-2-user-login',
        sha: 'def456',
        protected: false,
        url: 'https://api.github.com/repos/owner/repo/branches/feature/1-2-user-login',
      });
      expect(result.total).toBe(2);
    });

    it('should pass pagination params (page, perPage)', async () => {
      mockListBranches.mockResolvedValue({ data: [] });

      await service.listBranches('token', 'owner', 'repo', {
        page: 2,
        perPage: 50,
      });

      expect(mockListBranches).toHaveBeenCalledWith({
        owner: 'owner',
        repo: 'repo',
        per_page: 50,
        page: 2,
      });
    });

    it('should pass protected filter when specified', async () => {
      mockListBranches.mockResolvedValue({ data: [] });

      await service.listBranches('token', 'owner', 'repo', {
        protected: true,
      });

      expect(mockListBranches).toHaveBeenCalledWith(
        expect.objectContaining({
          protected: true,
        }),
      );
    });

    it('should use default pagination when no options provided', async () => {
      mockListBranches.mockResolvedValue({ data: [] });

      await service.listBranches('token', 'owner', 'repo');

      expect(mockListBranches).toHaveBeenCalledWith({
        owner: 'owner',
        repo: 'repo',
        per_page: 30,
        page: 1,
      });
    });

    it('should throw BadGatewayException for API errors', async () => {
      const error: any = new Error('Internal Server Error');
      error.status = 500;
      mockListBranches.mockRejectedValue(error);

      await expect(
        service.listBranches('token', 'owner', 'repo'),
      ).rejects.toThrow(BadGatewayException);
    });

    it('should throw BadGatewayException for rate limit (403)', async () => {
      const error: any = new Error('API rate limit exceeded');
      error.status = 403;
      mockListBranches.mockRejectedValue(error);

      await expect(
        service.listBranches('token', 'owner', 'repo'),
      ).rejects.toThrow(BadGatewayException);
    });
  });

  describe('getBranch', () => {
    const mockBranchDetail = {
      data: {
        name: 'feature/1-2-user-login',
        commit: {
          sha: 'def456',
          commit: {
            message: 'feat: implement user login (Story 1.2)',
            author: {
              name: 'testuser',
              date: '2026-01-30T10:00:00Z',
            },
          },
        },
        protected: false,
        _links: {
          html: 'https://github.com/owner/repo/tree/feature/1-2-user-login',
        },
      },
    };

    it('should return branch detail with commit info', async () => {
      mockGetBranch.mockResolvedValue(mockBranchDetail);

      const result = await service.getBranch(
        'token',
        'owner',
        'repo',
        'feature/1-2-user-login',
      );

      expect(mockGetBranch).toHaveBeenCalledWith({
        owner: 'owner',
        repo: 'repo',
        branch: 'feature/1-2-user-login',
      });

      expect(result).toEqual({
        name: 'feature/1-2-user-login',
        sha: 'def456',
        protected: false,
        url: 'https://github.com/owner/repo/tree/feature/1-2-user-login',
        commit: {
          sha: 'def456',
          message: 'feat: implement user login (Story 1.2)',
          author: 'testuser',
          date: '2026-01-30T10:00:00Z',
        },
      });
    });

    it('should return null for 404', async () => {
      const error: any = new Error('Not Found');
      error.status = 404;
      mockGetBranch.mockRejectedValue(error);

      const result = await service.getBranch(
        'token',
        'owner',
        'repo',
        'nonexistent-branch',
      );

      expect(result).toBeNull();
    });

    it('should throw BadGatewayException for other errors', async () => {
      const error: any = new Error('Internal Server Error');
      error.status = 500;
      mockGetBranch.mockRejectedValue(error);

      await expect(
        service.getBranch('token', 'owner', 'repo', 'feature/test'),
      ).rejects.toThrow(BadGatewayException);
    });

    it('should handle missing _links by constructing URL', async () => {
      const mockBranchNoLinks = {
        data: {
          name: 'feature/test',
          commit: {
            sha: 'abc123',
            commit: {
              message: 'test commit',
              author: {
                name: 'author',
                date: '2026-01-30T10:00:00Z',
              },
            },
          },
          protected: false,
          _links: {},
        },
      };
      mockGetBranch.mockResolvedValue(mockBranchNoLinks);

      const result = await service.getBranch(
        'token',
        'owner',
        'repo',
        'feature/test',
      );

      expect(result?.url).toBe(
        'https://github.com/owner/repo/tree/feature/test',
      );
    });
  });

  describe('deleteBranch', () => {
    it('should call deleteRef with correct ref format', async () => {
      mockDeleteRef.mockResolvedValue({ data: {} });

      await service.deleteBranch(
        'token',
        'owner',
        'repo',
        'feature/1-2-user-login',
      );

      expect(mockDeleteRef).toHaveBeenCalledWith({
        owner: 'owner',
        repo: 'repo',
        ref: 'heads/feature/1-2-user-login',
      });
    });

    it('should throw NotFoundException for 422 (branch not found)', async () => {
      const error: any = new Error('Reference does not exist');
      error.status = 422;
      mockDeleteRef.mockRejectedValue(error);

      await expect(
        service.deleteBranch('token', 'owner', 'repo', 'nonexistent'),
      ).rejects.toThrow(NotFoundException);
    });

    it('should throw NotFoundException for 404 (branch not found)', async () => {
      const error: any = new Error('Not Found');
      error.status = 404;
      mockDeleteRef.mockRejectedValue(error);

      await expect(
        service.deleteBranch('token', 'owner', 'repo', 'nonexistent'),
      ).rejects.toThrow(NotFoundException);
    });

    it('should throw BadGatewayException for rate limit (403)', async () => {
      const error: any = new Error('API rate limit exceeded');
      error.status = 403;
      mockDeleteRef.mockRejectedValue(error);

      await expect(
        service.deleteBranch('token', 'owner', 'repo', 'feature/test'),
      ).rejects.toThrow(BadGatewayException);
    });

    it('should throw BadGatewayException for other errors', async () => {
      const error: any = new Error('Internal Server Error');
      error.status = 500;
      mockDeleteRef.mockRejectedValue(error);

      await expect(
        service.deleteBranch('token', 'owner', 'repo', 'feature/test'),
      ).rejects.toThrow(BadGatewayException);
    });

    it('should log branch deletion', async () => {
      mockDeleteRef.mockResolvedValue({ data: {} });
      const logSpy = jest.spyOn(service['logger'], 'log');

      await service.deleteBranch('token', 'owner', 'repo', 'feature/test');

      expect(logSpy).toHaveBeenCalledWith(
        expect.stringContaining('Branch deleted: feature/test in owner/repo'),
      );
    });
  });

  // ============ Story 6.4: Pull Request Tests ============

  const mockPrApiResponse = {
    data: {
      id: 1,
      number: 42,
      title: 'Story 1.2: User Login',
      body: '## Story\nUser Login',
      state: 'open',
      html_url: 'https://github.com/owner/repo/pull/42',
      head: { ref: 'feature/1-2-user-login', sha: 'abc123' },
      base: { ref: 'main', sha: 'def456' },
      draft: false,
      labels: [{ name: 'ai-generated' }],
      user: {
        login: 'testuser',
        avatar_url: 'https://avatars.githubusercontent.com/u/12345',
      },
      created_at: '2026-01-31T10:00:00Z',
      updated_at: '2026-01-31T10:00:00Z',
      diff_url: 'https://github.com/owner/repo/pull/42.diff',
      additions: 150,
      deletions: 20,
      changed_files: 8,
      mergeable_state: 'unknown',
      mergeable: null,
    },
  };

  describe('createPullRequest', () => {
    it('should create PR with correct params including draft', async () => {
      mockPullsCreate.mockResolvedValue(mockPrApiResponse);

      const result = await service.createPullRequest('token', 'owner', 'repo', {
        title: 'Story 1.2: User Login',
        head: 'feature/1-2-user-login',
        base: 'main',
        body: '## Story\nUser Login',
        draft: false,
      });

      expect(mockPullsCreate).toHaveBeenCalledWith({
        owner: 'owner',
        repo: 'repo',
        title: 'Story 1.2: User Login',
        head: 'feature/1-2-user-login',
        base: 'main',
        body: '## Story\nUser Login',
        draft: false,
      });
      expect(result.number).toBe(42);
      expect(result.htmlUrl).toBe('https://github.com/owner/repo/pull/42');
    });

    it('should return typed PullRequestResponseDto', async () => {
      mockPullsCreate.mockResolvedValue(mockPrApiResponse);

      const result = await service.createPullRequest('token', 'owner', 'repo', {
        title: 'Story 1.2: User Login',
        head: 'feature/1-2-user-login',
        base: 'main',
      });

      expect(result).toEqual({
        id: 1,
        number: 42,
        title: 'Story 1.2: User Login',
        body: '## Story\nUser Login',
        state: 'open',
        htmlUrl: 'https://github.com/owner/repo/pull/42',
        head: { ref: 'feature/1-2-user-login', sha: 'abc123' },
        base: { ref: 'main', sha: 'def456' },
        draft: false,
        labels: ['ai-generated'],
        user: {
          login: 'testuser',
          avatarUrl: 'https://avatars.githubusercontent.com/u/12345',
        },
        createdAt: '2026-01-31T10:00:00Z',
        updatedAt: '2026-01-31T10:00:00Z',
        mergeableState: 'unknown',
        mergeable: undefined,
        diffUrl: 'https://github.com/owner/repo/pull/42.diff',
        additions: 150,
        deletions: 20,
        changedFiles: 8,
      });
    });

    it('should throw ConflictException for 422 error (PR already exists)', async () => {
      const error: any = new Error('Validation Failed');
      error.status = 422;
      mockPullsCreate.mockRejectedValue(error);

      await expect(
        service.createPullRequest('token', 'owner', 'repo', {
          title: 'Test',
          head: 'feature/test',
          base: 'main',
        }),
      ).rejects.toThrow(ConflictException);
    });

    it('should throw NotFoundException for 404 error (branch not found)', async () => {
      const error: any = new Error('Not Found');
      error.status = 404;
      mockPullsCreate.mockRejectedValue(error);

      await expect(
        service.createPullRequest('token', 'owner', 'repo', {
          title: 'Test',
          head: 'nonexistent',
          base: 'main',
        }),
      ).rejects.toThrow(NotFoundException);
    });

    it('should throw BadGatewayException for rate limit (403)', async () => {
      const error: any = new Error('API rate limit exceeded');
      error.status = 403;
      mockPullsCreate.mockRejectedValue(error);

      await expect(
        service.createPullRequest('token', 'owner', 'repo', {
          title: 'Test',
          head: 'feature/test',
          base: 'main',
        }),
      ).rejects.toThrow(BadGatewayException);
    });

    it('should throw BadGatewayException for other errors', async () => {
      const error: any = new Error('Internal Server Error');
      error.status = 500;
      mockPullsCreate.mockRejectedValue(error);

      await expect(
        service.createPullRequest('token', 'owner', 'repo', {
          title: 'Test',
          head: 'feature/test',
          base: 'main',
        }),
      ).rejects.toThrow(BadGatewayException);
    });
  });

  describe('listPullRequests', () => {
    it('should return mapped PR list with pagination', async () => {
      mockPullsList.mockResolvedValue({
        data: [mockPrApiResponse.data],
      });

      const result = await service.listPullRequests('token', 'owner', 'repo');

      expect(result.pullRequests).toHaveLength(1);
      expect(result.pullRequests[0].number).toBe(42);
      expect(result.total).toBe(1);
    });

    it('should pass state, sort, direction filters', async () => {
      mockPullsList.mockResolvedValue({ data: [] });

      await service.listPullRequests('token', 'owner', 'repo', {
        state: 'closed',
        sort: 'updated',
        direction: 'asc',
        page: 2,
        perPage: 50,
      });

      expect(mockPullsList).toHaveBeenCalledWith({
        owner: 'owner',
        repo: 'repo',
        state: 'closed',
        sort: 'updated',
        direction: 'asc',
        per_page: 50,
        page: 2,
      });
    });

    it('should use default pagination when no options provided', async () => {
      mockPullsList.mockResolvedValue({ data: [] });

      await service.listPullRequests('token', 'owner', 'repo');

      expect(mockPullsList).toHaveBeenCalledWith({
        owner: 'owner',
        repo: 'repo',
        state: 'open',
        sort: 'created',
        direction: 'desc',
        per_page: 30,
        page: 1,
      });
    });

    it('should throw BadGatewayException for API errors', async () => {
      const error: any = new Error('Internal Server Error');
      error.status = 500;
      mockPullsList.mockRejectedValue(error);

      await expect(
        service.listPullRequests('token', 'owner', 'repo'),
      ).rejects.toThrow(BadGatewayException);
    });
  });

  describe('getPullRequest', () => {
    it('should return PR detail with merge info', async () => {
      const prWithMergeInfo = {
        ...mockPrApiResponse,
        data: {
          ...mockPrApiResponse.data,
          mergeable_state: 'clean',
          mergeable: true,
        },
      };
      mockPullsGet.mockResolvedValue(prWithMergeInfo);

      const result = await service.getPullRequest('token', 'owner', 'repo', 42);

      expect(mockPullsGet).toHaveBeenCalledWith({
        owner: 'owner',
        repo: 'repo',
        pull_number: 42,
      });
      expect(result).not.toBeNull();
      expect(result!.number).toBe(42);
      expect(result!.mergeableState).toBe('clean');
      expect(result!.mergeable).toBe(true);
    });

    it('should return null for 404', async () => {
      const error: any = new Error('Not Found');
      error.status = 404;
      mockPullsGet.mockRejectedValue(error);

      const result = await service.getPullRequest('token', 'owner', 'repo', 999);

      expect(result).toBeNull();
    });

    it('should throw BadGatewayException for other errors', async () => {
      const error: any = new Error('Internal Server Error');
      error.status = 500;
      mockPullsGet.mockRejectedValue(error);

      await expect(
        service.getPullRequest('token', 'owner', 'repo', 42),
      ).rejects.toThrow(BadGatewayException);
    });
  });

  describe('updatePullRequest', () => {
    it('should update PR with provided fields', async () => {
      mockPullsUpdate.mockResolvedValue(mockPrApiResponse);

      await service.updatePullRequest('token', 'owner', 'repo', 42, {
        title: 'Updated title',
        body: 'Updated body',
        state: 'closed',
      });

      expect(mockPullsUpdate).toHaveBeenCalledWith({
        owner: 'owner',
        repo: 'repo',
        pull_number: 42,
        title: 'Updated title',
        body: 'Updated body',
        state: 'closed',
        base: undefined,
      });
    });

    it('should return updated PullRequestResponseDto', async () => {
      mockPullsUpdate.mockResolvedValue(mockPrApiResponse);

      const result = await service.updatePullRequest('token', 'owner', 'repo', 42, {
        title: 'Updated title',
      });

      expect(result.number).toBe(42);
      expect(result.htmlUrl).toBe('https://github.com/owner/repo/pull/42');
    });

    it('should throw NotFoundException for 404', async () => {
      const error: any = new Error('Not Found');
      error.status = 404;
      mockPullsUpdate.mockRejectedValue(error);

      await expect(
        service.updatePullRequest('token', 'owner', 'repo', 999, {
          title: 'Test',
        }),
      ).rejects.toThrow(NotFoundException);
    });

    it('should throw BadGatewayException for other errors', async () => {
      const error: any = new Error('Internal Server Error');
      error.status = 500;
      mockPullsUpdate.mockRejectedValue(error);

      await expect(
        service.updatePullRequest('token', 'owner', 'repo', 42, {
          title: 'Test',
        }),
      ).rejects.toThrow(BadGatewayException);
    });
  });

  describe('mergePullRequest', () => {
    const mockMergeResponse = {
      data: {
        merged: true,
        sha: 'abc123def456',
        message: 'Pull Request successfully merged',
      },
    };

    it('should call octokit.pulls.merge with correct params', async () => {
      mockPullsMerge.mockResolvedValue(mockMergeResponse);

      await service.mergePullRequest('token', 'owner', 'repo', 42, {
        mergeMethod: 'squash',
        commitTitle: 'feat: Story 1.2',
        commitMessage: 'Implements user login',
      });

      expect(mockPullsMerge).toHaveBeenCalledWith({
        owner: 'owner',
        repo: 'repo',
        pull_number: 42,
        merge_method: 'squash',
        commit_title: 'feat: Story 1.2',
        commit_message: 'Implements user login',
      });
    });

    it('should return MergePullRequestResponseDto with merged=true', async () => {
      mockPullsMerge.mockResolvedValue(mockMergeResponse);

      const result = await service.mergePullRequest('token', 'owner', 'repo', 42);

      expect(result).toEqual({
        merged: true,
        sha: 'abc123def456',
        message: 'Pull Request successfully merged',
      });
    });

    it('should throw HttpException(405) when not mergeable', async () => {
      const error: any = new Error('Pull Request is not mergeable');
      error.status = 405;
      mockPullsMerge.mockRejectedValue(error);

      await expect(
        service.mergePullRequest('token', 'owner', 'repo', 42),
      ).rejects.toThrow(HttpException);

      try {
        await service.mergePullRequest('token', 'owner', 'repo', 42);
      } catch (e) {
        expect((e as HttpException).getStatus()).toBe(405);
      }
    });

    it('should throw ConflictException for 409 (SHA mismatch)', async () => {
      const error: any = new Error('Head branch was modified');
      error.status = 409;
      mockPullsMerge.mockRejectedValue(error);

      await expect(
        service.mergePullRequest('token', 'owner', 'repo', 42),
      ).rejects.toThrow(ConflictException);
    });

    it('should throw NotFoundException for 404', async () => {
      const error: any = new Error('Not Found');
      error.status = 404;
      mockPullsMerge.mockRejectedValue(error);

      await expect(
        service.mergePullRequest('token', 'owner', 'repo', 999),
      ).rejects.toThrow(NotFoundException);
    });

    it('should throw BadGatewayException for rate limit (403)', async () => {
      const error: any = new Error('API rate limit exceeded');
      error.status = 403;
      mockPullsMerge.mockRejectedValue(error);

      await expect(
        service.mergePullRequest('token', 'owner', 'repo', 42),
      ).rejects.toThrow(BadGatewayException);
    });

    it('should throw BadGatewayException for other errors', async () => {
      const error: any = new Error('Internal Server Error');
      error.status = 500;
      mockPullsMerge.mockRejectedValue(error);

      await expect(
        service.mergePullRequest('token', 'owner', 'repo', 42),
      ).rejects.toThrow(BadGatewayException);
    });
  });

  describe('addLabelsToIssue', () => {
    it('should call octokit.issues.addLabels with correct params', async () => {
      mockIssuesAddLabels.mockResolvedValue({ data: [] });

      await service.addLabelsToIssue('token', 'owner', 'repo', 42, [
        'ai-generated',
        'feat',
      ]);

      expect(mockIssuesAddLabels).toHaveBeenCalledWith({
        owner: 'owner',
        repo: 'repo',
        issue_number: 42,
        labels: ['ai-generated', 'feat'],
      });
    });

    it('should not throw on error (silently catches)', async () => {
      const error = new Error('Label creation failed');
      mockIssuesAddLabels.mockRejectedValue(error);

      // Should not throw
      await expect(
        service.addLabelsToIssue('token', 'owner', 'repo', 42, ['test']),
      ).resolves.toBeUndefined();
    });

    it('should log warning on error', async () => {
      const error = new Error('Label creation failed');
      mockIssuesAddLabels.mockRejectedValue(error);
      const warnSpy = jest.spyOn(service['logger'], 'warn');

      await service.addLabelsToIssue('token', 'owner', 'repo', 42, ['test']);

      expect(warnSpy).toHaveBeenCalledWith(
        expect.stringContaining('Failed to add labels to PR #42'),
      );
    });
  });
});
