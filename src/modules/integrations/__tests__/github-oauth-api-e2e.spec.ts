import { Test, TestingModule } from '@nestjs/testing';
import {
  BadGatewayException,
  NotFoundException,
} from '@nestjs/common';
import { GitHubService } from '../github/github.service';

/**
 * Mock Octokit at module level
 * Following established pattern from github.service.spec.ts
 */
const mockGetAuthenticated = jest.fn();
const mockListForAuthenticatedUser = jest.fn();
const mockReposGet = jest.fn();
const mockListBranches = jest.fn();
const mockGetRef = jest.fn();
const mockCreateRef = jest.fn();

jest.mock('@octokit/rest', () => ({
  Octokit: jest.fn().mockImplementation(() => ({
    repos: {
      createForAuthenticatedUser: jest.fn(),
      get: mockReposGet,
      listBranches: mockListBranches,
      listForAuthenticatedUser: mockListForAuthenticatedUser,
      getBranch: jest.fn(),
    },
    git: {
      getRef: mockGetRef,
      createRef: mockCreateRef,
      deleteRef: jest.fn(),
    },
    pulls: {
      create: jest.fn(),
      list: jest.fn(),
      get: jest.fn(),
      update: jest.fn(),
      merge: jest.fn(),
    },
    issues: {
      addLabels: jest.fn(),
    },
    users: {
      getAuthenticated: mockGetAuthenticated,
    },
  })),
}));

/**
 * GitHub OAuth API Operations E2E Tests
 * Story 15-3: AC5 - GitHub API calls with stored/decrypted token
 *
 * Verifies GitHubService methods work correctly with mocked Octokit responses.
 */
describe('GitHub OAuth E2E - API Operations', () => {
  let service: GitHubService;

  const mockAccessToken = 'gho_test_token_12345';

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [GitHubService],
    }).compile();

    service = module.get<GitHubService>(GitHubService);
    jest.clearAllMocks();
  });

  describe('AC5: GitHub API Operations with Stored Token', () => {
    it('should create Octokit client with valid access token', () => {
      const client = service.getClient(mockAccessToken);

      expect(client).toBeDefined();
      expect(client).toHaveProperty('repos');
      expect(client).toHaveProperty('git');
      expect(client).toHaveProperty('pulls');
      expect(client).toHaveProperty('users');
    });

    it('should fetch authenticated user info via getUserInfo', async () => {
      const mockUserData = {
        login: 'testuser',
        id: 12345,
        avatar_url: 'https://github.com/testuser.png',
        email: 'test@example.com',
      };
      mockGetAuthenticated.mockResolvedValue({ data: mockUserData });

      const result = await service.getUserInfo(mockAccessToken);

      expect(result).toEqual(mockUserData);
      expect(result.login).toBe('testuser');
      expect(result.id).toBe(12345);
      expect(result.avatar_url).toBe('https://github.com/testuser.png');
    });

    it('should list repositories for authenticated user', async () => {
      const mockRepos = [
        { id: 1, name: 'repo-1', full_name: 'testuser/repo-1' },
        { id: 2, name: 'repo-2', full_name: 'testuser/repo-2' },
      ];
      mockListForAuthenticatedUser.mockResolvedValue({ data: mockRepos });

      const result = await service.listRepositories(mockAccessToken);

      expect(Array.isArray(result)).toBe(true);
      expect(result).toHaveLength(2);
      expect(result[0].name).toBe('repo-1');
      expect(result[1].name).toBe('repo-2');
    });

    it('should return repo details for a valid repository via getRepository', async () => {
      const mockRepoData = {
        id: 123456789,
        name: 'my-repo',
        full_name: 'testuser/my-repo',
        html_url: 'https://github.com/testuser/my-repo',
        clone_url: 'https://github.com/testuser/my-repo.git',
        ssh_url: 'git@github.com:testuser/my-repo.git',
        private: true,
        default_branch: 'main',
        description: 'Test repository',
      };
      mockReposGet.mockResolvedValue({ data: mockRepoData });

      const result = await service.getRepository(
        mockAccessToken,
        'testuser',
        'my-repo',
      );

      expect(result).not.toBeNull();
      expect(result!.name).toBe('my-repo');
      expect(result!.fullName).toBe('testuser/my-repo');
    });

    it('should return null for non-existent repository (404)', async () => {
      const error: any = new Error('Not Found');
      error.status = 404;
      mockReposGet.mockRejectedValue(error);

      const result = await service.getRepository(
        mockAccessToken,
        'testuser',
        'nonexistent-repo',
      );

      expect(result).toBeNull();
    });

    it('should throw BadGatewayException for GitHub rate limit (403) on createBranch', async () => {
      const error: any = new Error('API rate limit exceeded');
      error.status = 403;
      mockGetRef.mockRejectedValue(error);

      await expect(
        service.createBranch(mockAccessToken, 'owner', 'repo', 'feature/test'),
      ).rejects.toThrow(BadGatewayException);
    });

    it('should throw BadGatewayException for rate limit (403) on listBranches', async () => {
      const error: any = new Error('API rate limit exceeded');
      error.status = 403;
      mockListBranches.mockRejectedValue(error);

      await expect(
        service.listBranches(mockAccessToken, 'owner', 'repo'),
      ).rejects.toThrow(BadGatewayException);
    });

    it('should handle invalid/expired token error (401) on getUserInfo', async () => {
      const error: any = new Error('Bad credentials');
      error.status = 401;
      mockGetAuthenticated.mockRejectedValue(error);

      await expect(
        service.getUserInfo('invalid-token'),
      ).rejects.toThrow();
    });

    it('should handle Octokit error appropriately for 401 on listRepositories', async () => {
      const error: any = new Error('Bad credentials');
      error.status = 401;
      mockListForAuthenticatedUser.mockRejectedValue(error);

      await expect(
        service.listRepositories('invalid-token'),
      ).rejects.toThrow();
    });
  });
});
