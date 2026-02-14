/**
 * QAPRReviewerService Tests
 * Story 11.5: QA Agent CLI Integration
 *
 * Tests for PR review submission via GitHub API.
 */

// Mock @octokit/rest to avoid ESM import issues in Jest
jest.mock('@octokit/rest', () => ({
  Octokit: jest.fn().mockImplementation(() => ({})),
}));

import { Test, TestingModule } from '@nestjs/testing';
import { QAPRReviewerService } from './qa-pr-reviewer.service';
import { GitHubService } from '../../integrations/github/github.service';
import { QAReport } from '../interfaces/qa-agent-execution.interfaces';

describe('QAPRReviewerService', () => {
  let service: QAPRReviewerService;
  let mockCreateReview: jest.Mock;
  let mockCreateComment: jest.Mock;

  const baseReport: QAReport = {
    storyId: '11-5',
    verdict: 'PASS',
    testResults: {
      total: 50, passed: 50, failed: 0, skipped: 0,
      coverage: 85, testCommand: 'npm test', failedTests: [],
    },
    securityScan: {
      critical: 0, high: 0, medium: 1, low: 2, total: 3,
      passed: true, details: 'Clean',
    },
    lintResults: {
      errors: 0, warnings: 2, fixableErrors: 0, fixableWarnings: 1,
      passed: true, details: 'Clean',
    },
    typeCheckResults: {
      errors: 0, passed: true, details: 'No errors',
    },
    acceptanceCriteria: [
      { criterion: 'Tests pass', met: true, evidence: 'All 50 pass' },
      { criterion: 'Coverage >= 80%', met: true, evidence: '85%' },
    ],
    coverageAnalysis: {
      currentCoverage: 85, baselineCoverage: 83, delta: 2, meetsThreshold: true,
    },
    comments: [],
    summary: 'Tests: 50/50 passed | Coverage: 85%',
  };

  beforeEach(async () => {
    mockCreateReview = jest.fn().mockResolvedValue({ data: {} });
    mockCreateComment = jest.fn().mockResolvedValue({ data: {} });

    const mockGithubService = {
      getClient: jest.fn().mockReturnValue({
        pulls: { createReview: mockCreateReview },
        issues: { createComment: mockCreateComment },
      }),
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        QAPRReviewerService,
        { provide: GitHubService, useValue: mockGithubService },
      ],
    }).compile();

    service = module.get<QAPRReviewerService>(QAPRReviewerService);
  });

  describe('submitPRReview', () => {
    it('should create PR review comment via GitHubService', async () => {
      await service.submitPRReview({
        githubToken: 'ghp_test',
        repoOwner: 'owner',
        repoName: 'repo',
        prNumber: 42,
        report: baseReport,
        verdict: 'PASS',
      });

      expect(mockCreateReview).toHaveBeenCalledTimes(1);
    });

    it('should include QA verdict badge in comment', async () => {
      await service.submitPRReview({
        githubToken: 'ghp_test',
        repoOwner: 'owner',
        repoName: 'repo',
        prNumber: 42,
        report: baseReport,
        verdict: 'PASS',
      });

      const callArgs = mockCreateReview.mock.calls[0][0];
      expect(callArgs.body).toContain('PASS');
    });

    it('should include test results table', async () => {
      await service.submitPRReview({
        githubToken: 'ghp_test',
        repoOwner: 'owner',
        repoName: 'repo',
        prNumber: 42,
        report: baseReport,
        verdict: 'PASS',
      });

      const callArgs = mockCreateReview.mock.calls[0][0];
      expect(callArgs.body).toContain('50');
      expect(callArgs.body).toContain('85');
    });

    it('should include acceptance criteria checklist', async () => {
      await service.submitPRReview({
        githubToken: 'ghp_test',
        repoOwner: 'owner',
        repoName: 'repo',
        prNumber: 42,
        report: baseReport,
        verdict: 'PASS',
      });

      const callArgs = mockCreateReview.mock.calls[0][0];
      expect(callArgs.body).toContain('Tests pass');
    });

    it('should submit APPROVE review for PASS verdict', async () => {
      await service.submitPRReview({
        githubToken: 'ghp_test',
        repoOwner: 'owner',
        repoName: 'repo',
        prNumber: 42,
        report: baseReport,
        verdict: 'PASS',
      });

      const callArgs = mockCreateReview.mock.calls[0][0];
      expect(callArgs.event).toBe('APPROVE');
    });

    it('should submit REQUEST_CHANGES review for FAIL verdict', async () => {
      const failReport = { ...baseReport, verdict: 'FAIL' as const };

      await service.submitPRReview({
        githubToken: 'ghp_test',
        repoOwner: 'owner',
        repoName: 'repo',
        prNumber: 42,
        report: failReport,
        verdict: 'FAIL',
      });

      const callArgs = mockCreateReview.mock.calls[0][0];
      expect(callArgs.event).toBe('REQUEST_CHANGES');
    });

    it('should submit COMMENT review for NEEDS_CHANGES verdict', async () => {
      const needsChanges = { ...baseReport, verdict: 'NEEDS_CHANGES' as const };

      await service.submitPRReview({
        githubToken: 'ghp_test',
        repoOwner: 'owner',
        repoName: 'repo',
        prNumber: 42,
        report: needsChanges,
        verdict: 'NEEDS_CHANGES',
      });

      const callArgs = mockCreateReview.mock.calls[0][0];
      expect(callArgs.event).toBe('COMMENT');
    });

    it('should handle GitHub API error gracefully', async () => {
      mockCreateReview.mockRejectedValueOnce(new Error('API error'));

      // Should not throw - falls back to comment
      await expect(
        service.submitPRReview({
          githubToken: 'ghp_test',
          repoOwner: 'owner',
          repoName: 'repo',
          prNumber: 42,
          report: baseReport,
          verdict: 'PASS',
        }),
      ).resolves.not.toThrow();

      // Should have attempted fallback comment
      expect(mockCreateComment).toHaveBeenCalledTimes(1);
    });
  });
});
