/**
 * DevAgentPRCreatorService Tests
 * Story 11.4: Dev Agent CLI Integration
 *
 * Tests for PR creation using GitHubService.
 */

// Mock @octokit/rest to avoid ESM import issues in Jest
jest.mock('@octokit/rest', () => ({
  Octokit: jest.fn().mockImplementation(() => ({})),
}));

import { Test, TestingModule } from '@nestjs/testing';
import { ConflictException } from '@nestjs/common';
import {
  DevAgentPRCreatorService,
  DevAgentPRParams,
} from './dev-agent-pr-creator.service';
import { GitHubService } from '../../integrations/github/github.service';

describe('DevAgentPRCreatorService', () => {
  let service: DevAgentPRCreatorService;
  let githubService: jest.Mocked<GitHubService>;

  const baseParams: DevAgentPRParams = {
    githubToken: 'ghp_test_token',
    repoOwner: 'owner',
    repoName: 'repo',
    branch: 'devos/dev/11-4',
    baseBranch: 'main',
    storyId: '11-4',
    storyTitle: 'Dev Agent CLI Integration',
    testResults: {
      total: 25,
      passed: 24,
      failed: 1,
      coverage: 85.5,
      testCommand: 'npm test',
    },
    changedFiles: {
      created: ['src/new.ts', 'src/new.spec.ts'],
      modified: ['src/existing.ts'],
      deleted: ['src/old.ts'],
    },
  };

  const mockPRResponse = {
    id: 1,
    number: 42,
    title: '[DevOS-11-4] Dev Agent CLI Integration',
    body: 'test body',
    state: 'open',
    htmlUrl: 'https://github.com/owner/repo/pull/42',
    head: { ref: 'devos/dev/11-4', sha: 'abc123' },
    base: { ref: 'main', sha: 'def456' },
    draft: false,
    labels: [],
    user: { login: 'devos-bot', avatarUrl: '' },
    createdAt: '2026-02-15T10:00:00Z',
    updatedAt: '2026-02-15T10:00:00Z',
  };

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        DevAgentPRCreatorService,
        {
          provide: GitHubService,
          useValue: {
            createPullRequest: jest.fn().mockResolvedValue(mockPRResponse),
            addLabelsToIssue: jest.fn().mockResolvedValue(undefined),
            listPullRequests: jest.fn().mockResolvedValue({
              pullRequests: [],
              total: 0,
            }),
          },
        },
      ],
    }).compile();

    service = module.get<DevAgentPRCreatorService>(
      DevAgentPRCreatorService,
    );
    githubService = module.get(GitHubService);
  });

  describe('createPullRequest', () => {
    it('should create PR via GitHubService', async () => {
      const result = await service.createPullRequest(baseParams);

      expect(githubService.createPullRequest).toHaveBeenCalledWith(
        baseParams.githubToken,
        baseParams.repoOwner,
        baseParams.repoName,
        expect.objectContaining({
          head: 'devos/dev/11-4',
          base: 'main',
        }),
      );
      expect(result.prUrl).toBe(
        'https://github.com/owner/repo/pull/42',
      );
      expect(result.prNumber).toBe(42);
    });

    it('should include story ID and title in PR title', async () => {
      await service.createPullRequest(baseParams);

      const createCall =
        githubService.createPullRequest.mock.calls[0];
      const options = createCall[3];
      expect(options.title).toBe(
        '[DevOS-11-4] Dev Agent CLI Integration',
      );
    });

    it('should include acceptance criteria reference in PR body', async () => {
      await service.createPullRequest(baseParams);

      const createCall =
        githubService.createPullRequest.mock.calls[0];
      const options = createCall[3];
      expect(options.body).toContain('Acceptance Criteria');
      expect(options.body).toContain('DevOS-11-4');
    });

    it('should include test results summary in PR body', async () => {
      await service.createPullRequest(baseParams);

      const createCall =
        githubService.createPullRequest.mock.calls[0];
      const options = createCall[3];
      expect(options.body).toContain('Test Results');
      expect(options.body).toContain('25');
      expect(options.body).toContain('24');
      expect(options.body).toContain('1');
      expect(options.body).toContain('85.5%');
    });

    it('should include changed files summary in PR body', async () => {
      await service.createPullRequest(baseParams);

      const createCall =
        githubService.createPullRequest.mock.calls[0];
      const options = createCall[3];
      expect(options.body).toContain('Files Changed');
      expect(options.body).toContain('**Created**: 2 file(s)');
      expect(options.body).toContain('**Modified**: 1 file(s)');
      expect(options.body).toContain('**Deleted**: 1 file(s)');
    });

    it('should return PR URL and number', async () => {
      const result = await service.createPullRequest(baseParams);

      expect(result).toEqual({
        prUrl: 'https://github.com/owner/repo/pull/42',
        prNumber: 42,
      });
    });

    it('should handle null test results in PR body', async () => {
      const params = { ...baseParams, testResults: null };

      await service.createPullRequest(params);

      const createCall =
        githubService.createPullRequest.mock.calls[0];
      const options = createCall[3];
      expect(options.body).toContain('Test results not available');
    });

    it('should include DevOS Dev Agent footer', async () => {
      await service.createPullRequest(baseParams);

      const createCall =
        githubService.createPullRequest.mock.calls[0];
      const options = createCall[3];
      expect(options.body).toContain(
        'Automated by DevOS Dev Agent',
      );
    });

    it('should add labels to PR', async () => {
      await service.createPullRequest(baseParams);

      expect(githubService.addLabelsToIssue).toHaveBeenCalledWith(
        baseParams.githubToken,
        baseParams.repoOwner,
        baseParams.repoName,
        42,
        ['devos-agent', 'automated'],
      );
    });

    it('should handle GitHub API error gracefully', async () => {
      githubService.createPullRequest.mockRejectedValue(
        new Error('GitHub API error'),
      );

      await expect(
        service.createPullRequest(baseParams),
      ).rejects.toThrow('GitHub API error');
    });

    it('should find existing PR on conflict', async () => {
      githubService.createPullRequest.mockRejectedValue(
        new ConflictException('Pull request already exists'),
      );
      githubService.listPullRequests.mockResolvedValue({
        pullRequests: [mockPRResponse as any],
        total: 1,
      });

      const result = await service.createPullRequest(baseParams);

      expect(result.prUrl).toBe(
        'https://github.com/owner/repo/pull/42',
      );
      expect(result.prNumber).toBe(42);
    });

    it('should throw when conflict PR cannot be found', async () => {
      githubService.createPullRequest.mockRejectedValue(
        new ConflictException('Pull request already exists'),
      );
      githubService.listPullRequests.mockResolvedValue({
        pullRequests: [],
        total: 0,
      });

      await expect(
        service.createPullRequest(baseParams),
      ).rejects.toThrow('could not be found');
    });
  });
});
