/**
 * DevOpsPRMergerService Tests
 * Story 11.7: DevOps Agent CLI Integration
 */

// Mock Octokit ESM module before imports
jest.mock('@octokit/rest', () => ({
  Octokit: jest.fn().mockImplementation(() => ({})),
}));

import { Test, TestingModule } from '@nestjs/testing';
import { DevOpsPRMergerService } from './devops-pr-merger.service';
import { GitHubService } from '../../integrations/github/github.service';

describe('DevOpsPRMergerService', () => {
  let service: DevOpsPRMergerService;
  let githubService: jest.Mocked<GitHubService>;

  const baseMergeParams = {
    githubToken: 'ghp_test_token',
    repoOwner: 'test-org',
    repoName: 'test-repo',
    prNumber: 42,
  };

  beforeEach(async () => {
    const mockGithubService = {
      mergePullRequest: jest.fn(),
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        DevOpsPRMergerService,
        { provide: GitHubService, useValue: mockGithubService },
      ],
    }).compile();

    service = module.get<DevOpsPRMergerService>(DevOpsPRMergerService);
    githubService = module.get(GitHubService) as jest.Mocked<GitHubService>;
  });

  describe('mergePullRequest', () => {
    it('should merge PR via GitHubService with squash method by default', async () => {
      githubService.mergePullRequest.mockResolvedValue({
        merged: true,
        sha: 'abc123def456',
        message: 'Pull Request successfully merged',
      });

      const result = await service.mergePullRequest(baseMergeParams);

      expect(githubService.mergePullRequest).toHaveBeenCalledWith(
        'ghp_test_token',
        'test-org',
        'test-repo',
        42,
        expect.objectContaining({ mergeMethod: 'squash' }),
      );
      expect(result.success).toBe(true);
    });

    it('should return merge commit hash on success', async () => {
      githubService.mergePullRequest.mockResolvedValue({
        merged: true,
        sha: 'abc123def456',
        message: 'Pull Request successfully merged',
      });

      const result = await service.mergePullRequest(baseMergeParams);

      expect(result.mergeCommitHash).toBe('abc123def456');
      expect(result.mergedAt).toBeInstanceOf(Date);
      expect(result.error).toBeNull();
    });

    it('should return error on merge conflict (409)', async () => {
      const conflictError = new Error('Merge conflict');
      (conflictError as any).status = 409;

      githubService.mergePullRequest.mockRejectedValue(conflictError);

      const result = await service.mergePullRequest(baseMergeParams);

      expect(result.success).toBe(false);
      expect(result.mergeCommitHash).toBeNull();
      expect(result.error).toContain('Merge conflict');
    });

    it('should return error on branch protection violation (403)', async () => {
      const protectionError = new Error('Branch protection rules not met');
      (protectionError as any).status = 403;

      githubService.mergePullRequest.mockRejectedValue(protectionError);

      const result = await service.mergePullRequest(baseMergeParams);

      expect(result.success).toBe(false);
      expect(result.error).toContain('Branch protection violation');
    });

    it('should return error on branch protection violation (422)', async () => {
      const protectionError = new Error('Required status check missing');
      (protectionError as any).status = 422;

      githubService.mergePullRequest.mockRejectedValue(protectionError);

      const result = await service.mergePullRequest(baseMergeParams);

      expect(result.success).toBe(false);
      expect(result.error).toContain('Branch protection violation');
    });

    it('should handle GitHub API error gracefully', async () => {
      githubService.mergePullRequest.mockRejectedValue(
        new Error('Network error'),
      );

      const result = await service.mergePullRequest(baseMergeParams);

      expect(result.success).toBe(false);
      expect(result.mergeCommitHash).toBeNull();
      expect(result.mergedAt).toBeNull();
      expect(result.error).toContain('GitHub API error');
      expect(result.error).toContain('Network error');
    });

    it('should default to squash merge method', async () => {
      githubService.mergePullRequest.mockResolvedValue({
        merged: true,
        sha: 'abc123',
        message: 'Merged',
      });

      await service.mergePullRequest(baseMergeParams);

      expect(githubService.mergePullRequest).toHaveBeenCalledWith(
        expect.any(String),
        expect.any(String),
        expect.any(String),
        expect.any(Number),
        expect.objectContaining({ mergeMethod: 'squash' }),
      );
    });

    it('should use specified merge method when provided', async () => {
      githubService.mergePullRequest.mockResolvedValue({
        merged: true,
        sha: 'abc123',
        message: 'Merged',
      });

      await service.mergePullRequest({
        ...baseMergeParams,
        mergeMethod: 'rebase',
      });

      expect(githubService.mergePullRequest).toHaveBeenCalledWith(
        expect.any(String),
        expect.any(String),
        expect.any(String),
        expect.any(Number),
        expect.objectContaining({ mergeMethod: 'rebase' }),
      );
    });

    it('should handle merge response where merged is false', async () => {
      githubService.mergePullRequest.mockResolvedValue({
        merged: false,
        sha: '',
        message: 'Pull request is not mergeable',
      });

      const result = await service.mergePullRequest(baseMergeParams);

      expect(result.success).toBe(false);
      expect(result.error).toContain('not mergeable');
    });
  });
});
