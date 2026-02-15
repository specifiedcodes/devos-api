/**
 * HandoffContextAssembler Service Tests
 * Story 11.8: Multi-Agent Handoff Chain
 *
 * Tests for context assembly between agent handoffs.
 */
import { Test, TestingModule } from '@nestjs/testing';
import { HandoffContextAssemblerService } from './handoff-context-assembler.service';

describe('HandoffContextAssemblerService', () => {
  let service: HandoffContextAssemblerService;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [HandoffContextAssemblerService],
    }).compile();

    service = module.get<HandoffContextAssemblerService>(
      HandoffContextAssemblerService,
    );
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });

  // ─── assemblePlannerToDevContext ─────────────────────────────────────────

  describe('assemblePlannerToDevContext', () => {
    const basePlannerResult = {
      success: true,
      planningTask: 'create-stories',
      documentsGenerated: [
        { type: 'story', filePath: '/path/to/story.md', title: 'Story 1' },
        {
          type: 'architecture',
          filePath: '/path/to/arch.md',
          title: 'Architecture',
        },
      ],
      storiesCreated: [
        {
          storyId: 'story-1',
          title: 'Implement feature X',
          epicId: 'epic-1',
          status: 'ready-for-dev',
          acceptanceCriteria: ['AC1: Must do X', 'AC2: Must handle Y'],
          estimatedComplexity: 'M',
        },
      ],
      commitHash: 'abc123',
      sessionId: 'session-1',
      durationMs: 5000,
      error: null,
    };

    const baseMetadata = {
      storyId: 'story-1',
      storyTitle: 'Implement feature X',
      storyDescription: 'A story about feature X',
      techStack: 'NestJS + TypeScript',
      codeStylePreferences: 'ESLint + Prettier',
      testingStrategy: 'TDD with Jest',
      gitRepoUrl: 'https://github.com/org/repo.git',
      githubToken: 'ghp_test123',
      repoOwner: 'org',
      repoName: 'repo',
    };

    it('should extract story details from planner result', () => {
      const result = service.assemblePlannerToDevContext(
        basePlannerResult,
        baseMetadata,
      );

      expect(result.storyId).toBe('story-1');
      expect(result.storyTitle).toBe('Implement feature X');
      expect(result.storyDescription).toBe('A story about feature X');
    });

    it('should include acceptance criteria and tech stack', () => {
      const result = service.assemblePlannerToDevContext(
        basePlannerResult,
        baseMetadata,
      );

      expect(result.acceptanceCriteria).toEqual([
        'AC1: Must do X',
        'AC2: Must handle Y',
      ]);
      expect(result.techStack).toBe('NestJS + TypeScript');
      expect(result.codeStylePreferences).toBe('ESLint + Prettier');
      expect(result.testingStrategy).toBe('TDD with Jest');
    });

    it('should include planning document paths', () => {
      const result = service.assemblePlannerToDevContext(
        basePlannerResult,
        baseMetadata,
      );

      expect(result.planningDocuments).toEqual([
        '/path/to/story.md',
        '/path/to/arch.md',
      ]);
    });

    it('should pass through git credentials from metadata', () => {
      const result = service.assemblePlannerToDevContext(
        basePlannerResult,
        baseMetadata,
      );

      expect(result.gitRepoUrl).toBe('https://github.com/org/repo.git');
      expect(result.githubToken).toBe('ghp_test123');
      expect(result.repoOwner).toBe('org');
      expect(result.repoName).toBe('repo');
    });

    it('should handle empty planner result gracefully', () => {
      const emptyResult = {
        success: false,
        planningTask: 'create-stories',
        documentsGenerated: [],
        storiesCreated: [],
        commitHash: null,
        sessionId: 'session-1',
        durationMs: 1000,
        error: 'Planning failed',
      };

      const result = service.assemblePlannerToDevContext(
        emptyResult,
        baseMetadata,
      );

      expect(result.storyId).toBe('story-1');
      expect(result.acceptanceCriteria).toEqual([]);
      expect(result.planningDocuments).toEqual([]);
      expect(result.epicId).toBeNull();
    });
  });

  // ─── assembleDevToQAContext ──────────────────────────────────────────────

  describe('assembleDevToQAContext', () => {
    const baseDevResult = {
      success: true,
      branch: 'feature/story-1',
      commitHash: 'def456',
      prUrl: 'https://github.com/org/repo/pull/42',
      prNumber: 42,
      testResults: {
        total: 10,
        passed: 9,
        failed: 1,
        coverage: 85,
        testCommand: 'npm test',
      },
      filesCreated: ['src/new-file.ts', 'src/new-file.spec.ts'],
      filesModified: ['src/existing.ts'],
      sessionId: 'session-2',
      durationMs: 30000,
      error: null,
    };

    const baseMetadata = {
      storyId: 'story-1',
      storyTitle: 'Implement feature X',
      storyDescription: 'A story about feature X',
      acceptanceCriteria: ['AC1', 'AC2'],
      techStack: 'NestJS + TypeScript',
      testingStrategy: 'TDD with Jest',
      gitRepoUrl: 'https://github.com/org/repo.git',
      githubToken: 'ghp_test123',
      repoOwner: 'org',
      repoName: 'repo',
    };

    it('should extract branch and PR info from dev result', () => {
      const result = service.assembleDevToQAContext(
        baseDevResult,
        baseMetadata,
      );

      expect(result.branch).toBe('feature/story-1');
      expect(result.prUrl).toBe('https://github.com/org/repo/pull/42');
      expect(result.prNumber).toBe(42);
    });

    it('should include test results and file changes', () => {
      const result = service.assembleDevToQAContext(
        baseDevResult,
        baseMetadata,
      );

      expect(result.devTestResults).toEqual({
        total: 10,
        passed: 9,
        failed: 1,
        coverage: 85,
        testCommand: 'npm test',
      });
      expect(result.filesCreated).toEqual([
        'src/new-file.ts',
        'src/new-file.spec.ts',
      ]);
      expect(result.filesModified).toEqual(['src/existing.ts']);
    });

    it('should handle null PR URL gracefully', () => {
      const devResultNoPR = {
        ...baseDevResult,
        prUrl: null,
        prNumber: null,
      };

      const result = service.assembleDevToQAContext(
        devResultNoPR,
        baseMetadata,
      );

      expect(result.prUrl).toBe('');
      expect(result.prNumber).toBe(0);
    });

    it('should pass through story details from metadata', () => {
      const result = service.assembleDevToQAContext(
        baseDevResult,
        baseMetadata,
      );

      expect(result.storyId).toBe('story-1');
      expect(result.storyTitle).toBe('Implement feature X');
      expect(result.acceptanceCriteria).toEqual(['AC1', 'AC2']);
    });
  });

  // ─── assembleQAToDevOpsContext ──────────────────────────────────────────

  describe('assembleQAToDevOpsContext', () => {
    const baseQAResult = {
      success: true,
      verdict: 'PASS' as const,
      qaReport: {
        storyId: 'story-1',
        verdict: 'PASS' as const,
        testResults: {
          total: 15,
          passed: 15,
          failed: 0,
          skipped: 0,
          coverage: 90,
          testCommand: 'npm test',
          failedTests: [],
        },
        securityScan: {
          critical: 0,
          high: 0,
          medium: 0,
          low: 1,
          total: 1,
          passed: true,
          details: '',
        },
        lintResults: {
          errors: 0,
          warnings: 2,
          fixableErrors: 0,
          fixableWarnings: 1,
          passed: true,
          details: '',
        },
        typeCheckResults: { errors: 0, passed: true, details: '' },
        acceptanceCriteria: [
          { criterion: 'AC1', met: true, evidence: 'Tests pass' },
        ],
        coverageAnalysis: {
          currentCoverage: 90,
          baselineCoverage: 85,
          delta: 5,
          meetsThreshold: true,
        },
        comments: ['All checks passed'],
        summary: 'QA passed all checks. 15/15 tests, 90% coverage.',
      },
      additionalTestsWritten: 3,
      sessionId: 'session-3',
      durationMs: 20000,
      error: null,
    };

    const baseMetadata = {
      storyId: 'story-1',
      storyTitle: 'Implement feature X',
      storyDescription: 'A story about feature X',
      prUrl: 'https://github.com/org/repo/pull/42',
      prNumber: 42,
      devBranch: 'feature/story-1',
      deploymentPlatform: 'railway' as const,
      supabaseConfigured: true,
      environment: 'staging',
      gitRepoUrl: 'https://github.com/org/repo.git',
      githubToken: 'ghp_test123',
      repoOwner: 'org',
      repoName: 'repo',
    };

    it('should extract QA verdict and PR info', () => {
      const result = service.assembleQAToDevOpsContext(
        baseQAResult,
        baseMetadata,
      );

      expect(result.qaVerdict).toBe('PASS');
      expect(result.prUrl).toBe('https://github.com/org/repo/pull/42');
      expect(result.prNumber).toBe(42);
      expect(result.devBranch).toBe('feature/story-1');
    });

    it('should include deployment platform and environment', () => {
      const result = service.assembleQAToDevOpsContext(
        baseQAResult,
        baseMetadata,
      );

      expect(result.deploymentPlatform).toBe('railway');
      expect(result.supabaseConfigured).toBe(true);
      expect(result.environment).toBe('staging');
    });

    it('should include QA report summary', () => {
      const result = service.assembleQAToDevOpsContext(
        baseQAResult,
        baseMetadata,
      );

      expect(result.qaReportSummary).toBe(
        'QA passed all checks. 15/15 tests, 90% coverage.',
      );
    });
  });

  // ─── assembleQAToDevRejectionContext ─────────────────────────────────────

  describe('assembleQAToDevRejectionContext', () => {
    const baseQARejectionResult = {
      success: true,
      verdict: 'FAIL' as const,
      qaReport: {
        storyId: 'story-1',
        verdict: 'FAIL' as const,
        testResults: {
          total: 15,
          passed: 12,
          failed: 3,
          skipped: 0,
          coverage: 70,
          testCommand: 'npm test',
          failedTests: [
            {
              testName: 'should validate input',
              file: 'src/service.spec.ts',
              error: 'Expected true, got false',
            },
          ],
        },
        securityScan: {
          critical: 0,
          high: 1,
          medium: 0,
          low: 0,
          total: 1,
          passed: false,
          details: 'High severity vulnerability found',
        },
        lintResults: {
          errors: 3,
          warnings: 5,
          fixableErrors: 2,
          fixableWarnings: 3,
          passed: false,
          details: 'ESLint errors found',
        },
        typeCheckResults: { errors: 0, passed: true, details: '' },
        acceptanceCriteria: [
          { criterion: 'AC1', met: true, evidence: 'Tests pass' },
          { criterion: 'AC2', met: false, evidence: 'Missing validation' },
        ],
        coverageAnalysis: {
          currentCoverage: 70,
          baselineCoverage: 85,
          delta: -15,
          meetsThreshold: false,
        },
        comments: ['Fix failing tests', 'Address security issue'],
        summary: 'QA failed: 3 test failures, security issues, low coverage.',
      },
      additionalTestsWritten: 0,
      sessionId: 'session-4',
      durationMs: 15000,
      error: null,
    };

    const baseMetadata = {
      storyId: 'story-1',
      storyTitle: 'Implement feature X',
      storyDescription: 'A story about feature X',
      acceptanceCriteria: ['AC1', 'AC2'],
      techStack: 'NestJS + TypeScript',
      codeStylePreferences: 'ESLint + Prettier',
      testingStrategy: 'TDD with Jest',
      previousBranch: 'feature/story-1',
      previousPrUrl: 'https://github.com/org/repo/pull/42',
      previousPrNumber: 42,
      iterationCount: 1,
      gitRepoUrl: 'https://github.com/org/repo.git',
      githubToken: 'ghp_test123',
      repoOwner: 'org',
      repoName: 'repo',
    };

    it('should extract failure details from QA report', () => {
      const result = service.assembleQAToDevRejectionContext(
        baseQARejectionResult,
        baseMetadata,
      );

      expect(result.qaVerdict).toBe('FAIL');
      expect(result.qaReportSummary).toBe(
        'QA failed: 3 test failures, security issues, low coverage.',
      );
    });

    it('should include failed tests and lint errors', () => {
      const result = service.assembleQAToDevRejectionContext(
        baseQARejectionResult,
        baseMetadata,
      );

      expect(result.failedTests).toContain(
        'should validate input (src/service.spec.ts): Expected true, got false',
      );
      expect(result.lintErrors).toBe('ESLint errors found');
    });

    it('should include security issues', () => {
      const result = service.assembleQAToDevRejectionContext(
        baseQARejectionResult,
        baseMetadata,
      );

      expect(result.securityIssues).toBe('High severity vulnerability found');
    });

    it('should include change requests from QA comments', () => {
      const result = service.assembleQAToDevRejectionContext(
        baseQARejectionResult,
        baseMetadata,
      );

      expect(result.changeRequests).toEqual([
        'Fix failing tests',
        'Address security issue',
      ]);
    });

    it('should include iteration count', () => {
      const result = service.assembleQAToDevRejectionContext(
        baseQARejectionResult,
        baseMetadata,
      );

      expect(result.iterationCount).toBe(1);
    });

    it('should include previous branch and PR info', () => {
      const result = service.assembleQAToDevRejectionContext(
        baseQARejectionResult,
        baseMetadata,
      );

      expect(result.previousBranch).toBe('feature/story-1');
      expect(result.previousPrUrl).toBe(
        'https://github.com/org/repo/pull/42',
      );
      expect(result.previousPrNumber).toBe(42);
    });
  });

  // ─── assembleDevOpsCompletionContext ─────────────────────────────────────

  describe('assembleDevOpsCompletionContext', () => {
    it('should extract deployment URL and platform', () => {
      const devopsResult = {
        success: true,
        mergeCommitHash: 'abc123def',
        deploymentUrl: 'https://my-app.railway.app',
        deploymentId: 'deploy-1',
        deploymentPlatform: 'railway' as const,
        smokeTestResults: {
          passed: true,
          healthCheck: {
            name: 'health',
            url: '/health',
            method: 'GET',
            expectedStatus: 200,
            actualStatus: 200,
            passed: true,
            responseTimeMs: 50,
            error: null,
          },
          apiChecks: [],
          totalChecks: 1,
          passedChecks: 1,
          failedChecks: 0,
          durationMs: 1000,
          details: 'All checks passed',
        },
        rollbackPerformed: false,
        rollbackReason: null,
        incidentReport: null,
        sessionId: 'session-5',
        durationMs: 60000,
        error: null,
      };

      const metadata = {
        storyId: 'story-1',
      };

      const result = service.assembleDevOpsCompletionContext(
        devopsResult,
        metadata,
      );

      expect(result.storyId).toBe('story-1');
      expect(result.deploymentUrl).toBe('https://my-app.railway.app');
      expect(result.deploymentPlatform).toBe('railway');
      expect(result.mergeCommitHash).toBe('abc123def');
      expect(result.smokeTestsPassed).toBe(true);
    });

    it('should handle null deployment URL', () => {
      const devopsResult = {
        success: false,
        mergeCommitHash: null,
        deploymentUrl: null,
        deploymentId: null,
        deploymentPlatform: null,
        smokeTestResults: null,
        rollbackPerformed: true,
        rollbackReason: 'Deployment failed',
        incidentReport: null,
        sessionId: 'session-6',
        durationMs: 30000,
        error: 'Deployment timed out',
      };

      const metadata = {
        storyId: 'story-1',
      };

      const result = service.assembleDevOpsCompletionContext(
        devopsResult,
        metadata,
      );

      expect(result.deploymentUrl).toBeNull();
      expect(result.deploymentPlatform).toBeNull();
      expect(result.mergeCommitHash).toBeNull();
      expect(result.smokeTestsPassed).toBe(false);
    });
  });
});
